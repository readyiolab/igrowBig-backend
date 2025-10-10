const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const db = require("../config/db");
const { sendDomainNotification } = require("../config/email");

const POLL_INTERVAL = parseInt(process.env.VERIFICATION_POLL_INTERVAL_MS || "15000", 10);
const MAX_ATTEMPTS = parseInt(process.env.VERIFICATION_MAX_ATTEMPTS || "12", 10);
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;

const cfApi = axios.create({
  baseURL: "https://api.cloudflare.com/client/v4",
  headers: {
    Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

async function createVerificationToken(tenantId, domain) {
  const token = `igrow-${uuidv4()}`;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  try {
    const existing = await db.selectAll("tbl_settings", "*", "tenant_id = ?", [tenantId]);

    if (existing && existing.length > 0) {
      await db.update(
        "tbl_settings",
        { dns_verification_txt: token, updated_at: now },
        "tenant_id = ?",
        [tenantId]
      );
    } else {
      await db.insert("tbl_settings", {
        tenant_id: tenantId,
        dns_verification_txt: token,
        primary_domain_name: domain,
        dns_status: "pending",
        created_at: now,
        updated_at: now,
      });
    }

    console.log(`✅ Created verification token for tenant ${tenantId}: ${token}`);
    return token;
  } catch (err) {
    console.error("❌ createVerificationToken Error:", err);
    throw err;
  }
}

async function markVerified(tenantId, domain) {
  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    await db.update(
      "tbl_settings",
      { dns_status: "verified", updated_at: now },
      "tenant_id = ?",
      [tenantId]
    );

    await db.update(
      "tbl_tenants",
      { custom_domain: domain, custom_domain_status: "verified" },
      "id = ?",
      [tenantId]
    );

    console.log(`✅ Domain ${domain} marked as VERIFIED for tenant ${tenantId}`);
  } catch (err) {
    console.error("❌ markVerified Error:", err);
    throw err;
  }
}

async function markPending(tenantId, domain) {
  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await db.update(
      "tbl_settings",
      { dns_status: "pending", updated_at: now },
      "tenant_id = ?",
      [tenantId]
    );
    console.log(`⏳ Domain ${domain} marked as PENDING for tenant ${tenantId}`);
  } catch (err) {
    console.error("❌ markPending Error:", err);
    throw err;
  }
}

/**
 * Check if TXT record exists in user's DNS
 * This verifies they own the domain
 */
async function checkTxtRecord(domain, expectedTxt) {
  const txtName = `_igrowbig-verification.${domain}`;
  
  try {
    const dns = require('dns').promises;
    const txtRecords = await dns.resolveTxt(txtName);
    const flatRecords = txtRecords.flat();
    
    console.log(`🔍 TXT records found for ${txtName}:`, flatRecords);
    
    return flatRecords.some(record => record === expectedTxt);
  } catch (err) {
    console.log(`⚠️ No TXT record found yet for ${txtName}: ${err.code}`);
    return false;
  }
}

/**
 * Check if domain points to our platform (CNAME or A record)
 */
async function checkDomainPointing(domain) {
  const rootDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
  const serverIP = process.env.SERVER_IP || "139.59.8.68";
  
  try {
    const dns = require('dns').promises;
    
    // Try CNAME first
    try {
      const cnameRecords = await dns.resolveCname(domain);
      const pointsToUs = cnameRecords.some(record => 
        record === rootDomain || record.endsWith(`.${rootDomain}`)
      );
      if (pointsToUs) {
        console.log(`✅ Domain ${domain} has CNAME pointing to ${rootDomain}`);
        return true;
      }
    } catch (cnameErr) {
      // No CNAME, try A record
      console.log(`ℹ️ No CNAME for ${domain}, checking A records...`);
    }
    
    // Check A record
    try {
      const aRecords = await dns.resolve4(domain);
      const pointsToUs = aRecords.some(ip => ip === serverIP);
      if (pointsToUs) {
        console.log(`✅ Domain ${domain} has A record pointing to ${serverIP}`);
        return true;
      }
      console.log(`⚠️ Domain ${domain} points to ${aRecords.join(', ')} but expected ${serverIP}`);
    } catch (aErr) {
      console.log(`⚠️ No A records found for ${domain}`);
    }
    
    return false;
  } catch (err) {
    console.error(`❌ Error checking domain pointing for ${domain}:`, err.message);
    return false;
  }
}

async function pollForVerification(tenantId, domain, email, expectedTxt) {
  let attempt = 0;

  console.log(`🔍 Starting verification for ${domain}`);
  console.log(`   Expected TXT token: ${expectedTxt}`);
  console.log(`   ⏳ Waiting 30 seconds for DNS propagation...`);

  await new Promise((res) => setTimeout(res, 30000));

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    console.log(`🔄 Verification attempt ${attempt}/${MAX_ATTEMPTS} for ${domain}`);

    try {
      // Step 1: Check TXT record (ownership verification)
      const txtVerified = await checkTxtRecord(domain, expectedTxt);
      
      if (!txtVerified) {
        console.log(`⚠️ TXT record not found or doesn't match. User needs to add it.`);
        
        if (attempt >= MAX_ATTEMPTS) {
          await markPending(tenantId, domain);
          
          if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            await sendDomainNotification(email, domain, "unverified", {
              step1: { value: expectedTxt },
            });
          }
          
          console.log(`❌ Verification failed after ${MAX_ATTEMPTS} attempts: ${domain}`);
          return { status: "unverified", attempts: MAX_ATTEMPTS, reason: "TXT record not found" };
        }
        
        // Continue polling
        await new Promise((res) => setTimeout(res, POLL_INTERVAL));
        continue;
      }
      
      console.log(`✅ TXT record verified for ${domain}`);
      
      // Step 2: Check if domain points to our platform
      const domainPointsToUs = await checkDomainPointing(domain);
      
      if (!domainPointsToUs) {
        console.log(`⚠️ Domain ${domain} doesn't point to our platform yet`);
        
        if (attempt >= MAX_ATTEMPTS) {
          // TXT is verified but CNAME/A is missing
          await markPending(tenantId, domain);
          
          if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            await sendDomainNotification(email, domain, "partially_verified", {
              message: "Domain ownership verified, but CNAME/A record not set up yet",
            });
          }
          
          return { 
            status: "partially_verified", 
            attempts: MAX_ATTEMPTS,
            reason: "TXT verified but domain not pointing to platform"
          };
        }
        
        // Continue polling
        await new Promise((res) => setTimeout(res, POLL_INTERVAL));
        continue;
      }
      
      // Both checks passed - domain is fully verified
      await markVerified(tenantId, domain);
      
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await sendDomainNotification(email, domain, "verified");
      }
      
      console.log(`✅ Domain fully verified: ${domain} (attempt ${attempt})`);
      return { status: "verified", method: "dns_verification", attempts: attempt };
      
    } catch (err) {
      console.error(`⚠️ Verification attempt ${attempt} error:`, err.message);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((res) => setTimeout(res, POLL_INTERVAL));
    }
  }

  // Max attempts reached
  await markPending(tenantId, domain);
  
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await sendDomainNotification(email, domain, "unverified", {
      step1: { value: expectedTxt },
    });
  }
  
  console.log(`❌ Verification failed after ${MAX_ATTEMPTS} attempts: ${domain}`);
  return { status: "unverified", attempts: MAX_ATTEMPTS };
}

async function startVerificationProcess(tenantId, domain, email, verificationToken = null) {
  try {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.warn(`⚠️ No valid email provided for tenant ${tenantId}. Skipping email notification.`);
    }

    const token = verificationToken || await createVerificationToken(tenantId, domain);

    // Send initial pending notification only if email is valid
    if (email) {
      await sendDomainNotification(email, domain, "pending", {
        step1: { value: token },
      });
    }

    // Start polling in the background
    pollForVerification(tenantId, domain, email, token)
      .then((result) => {
        console.log(`✅ Verification completed for ${domain}:`, result);
      })
      .catch((err) => {
        console.error(`❌ Verification failed for ${domain}:`, err);
      });

    return { token, message: "Verification process started" };
  } catch (err) {
    console.error("❌ startVerificationProcess Error:", err);
    throw err;
  }
}

module.exports = {
  createVerificationToken,
  pollForVerification,
  markVerified,
  markPending,
  startVerificationProcess,
};