const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const { sendDomainNotification } = require("../config/email");
const dns = require('dns').promises;

const POLL_INTERVAL = parseInt(process.env.VERIFICATION_POLL_INTERVAL_MS || "60000", 10); // 1 minute
const MAX_ATTEMPTS = parseInt(process.env.VERIFICATION_MAX_ATTEMPTS || "20", 10); // 20 minutes total

/**
 * Create unique verification token for domain ownership
 */
async function createVerificationToken(tenantId, domain) {
  const token = `igrow-${uuidv4()}`;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  try {
    const existing = await db.selectAll("tbl_settings", "*", "tenant_id = ?", [tenantId]);

    if (existing && existing.length > 0) {
      await db.update(
        "tbl_settings",
        { 
          dns_verification_txt: token, 
          dns_status: "pending",
          updated_at: now 
        },
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

/**
 * Mark domain as fully verified
 */
async function markVerified(tenantId, domain) {
  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    await db.update(
      "tbl_settings",
      { 
        dns_status: "verified", 
        last_verified_at: now,
        updated_at: now 
      },
      "tenant_id = ?",
      [tenantId]
    );

    await db.update(
      "tbl_tenants",
      { 
        custom_domain: domain, 
        custom_domain_status: "verified",
        updated_at: now
      },
      "id = ?",
      [tenantId]
    );

    console.log(`✅ Domain ${domain} marked as VERIFIED for tenant ${tenantId}`);
  } catch (err) {
    console.error("❌ markVerified Error:", err);
    throw err;
  }
}

/**
 * Mark domain as pending verification
 */
async function markPending(tenantId, domain) {
  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    
    await db.update(
      "tbl_settings",
      { dns_status: "pending", updated_at: now },
      "tenant_id = ?",
      [tenantId]
    );
    
    await db.update(
      "tbl_tenants",
      { custom_domain_status: "pending", updated_at: now },
      "id = ?",
      [tenantId]
    );
    
    console.log(`⏳ Domain ${domain} marked as PENDING for tenant ${tenantId}`);
  } catch (err) {
    console.error("❌ markPending Error:", err);
  }
}

/**
 * Mark domain as failed verification
 */
async function markFailed(tenantId, domain, reason) {
  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    
    await db.update(
      "tbl_settings",
      { dns_status: "failed", updated_at: now },
      "tenant_id = ?",
      [tenantId]
    );
    
    await db.update(
      "tbl_tenants",
      { custom_domain_status: "failed", updated_at: now },
      "id = ?",
      [tenantId]
    );
    
    console.log(`❌ Domain ${domain} marked as FAILED: ${reason}`);
  } catch (err) {
    console.error("❌ markFailed Error:", err);
  }
}

/**
 * Check TXT record for domain ownership verification
 */
async function checkTxtRecord(domain, expectedTxt) {
  const txtName = `_igrowbig-verification.${domain}`;
  
  try {
    const txtRecords = await dns.resolveTxt(txtName);
    const flatRecords = txtRecords.flat().map(r => String(r).trim());
    
    console.log(`🔍 TXT records for ${txtName}:`, flatRecords);
    
    const matches = flatRecords.some(record => record === expectedTxt);
    return { found: true, matches, records: flatRecords };
  } catch (err) {
    console.log(`⚠️ TXT not found for ${txtName}: ${err.code}`);
    return { found: false, matches: false, error: err.code };
  }
}

/**
 * Check if domain points to our platform (CNAME or A record)
 */
async function checkDomainPointing(domain) {
  const rootDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
  const serverIP = process.env.SERVER_IP || "139.59.8.68";
  
  try {
    // Try CNAME first (recommended method)
    try {
      const cnameRecords = await dns.resolveCname(domain);
      console.log(`🔍 CNAME for ${domain}:`, cnameRecords);
      
      const pointsToUs = cnameRecords.some(record => {
        const normalized = record.toLowerCase().replace(/\.$/, '');
        return normalized === rootDomain || normalized.endsWith(`.${rootDomain}`);
      });
      
      if (pointsToUs) {
        console.log(`✅ ${domain} → CNAME → ${rootDomain}`);
        return { pointing: true, method: 'CNAME', target: cnameRecords[0] };
      }
    } catch (cnameErr) {
      console.log(`ℹ️ No CNAME for ${domain}`);
    }
    
    // Try A record (alternative method)
    try {
      const aRecords = await dns.resolve4(domain);
      console.log(`🔍 A records for ${domain}:`, aRecords);
      
      const pointsToUs = aRecords.some(ip => ip === serverIP);
      
      if (pointsToUs) {
        console.log(`✅ ${domain} → A → ${serverIP}`);
        return { pointing: true, method: 'A', target: serverIP };
      } else {
        console.log(`⚠️ ${domain} points to ${aRecords[0]} (expected ${serverIP})`);
        return { pointing: false, method: 'A', target: aRecords[0] };
      }
    } catch (aErr) {
      console.log(`⚠️ No A records for ${domain}`);
    }
    
    return { pointing: false, error: 'No DNS records found' };
  } catch (err) {
    console.error(`❌ Error checking DNS for ${domain}:`, err.message);
    return { pointing: false, error: err.message };
  }
}

/**
 * Background polling function - checks DNS repeatedly until verified or timeout
 */
async function pollForVerification(tenantId, domain, email, expectedTxt) {
  let attempt = 0;

  console.log(`🔍 Starting verification polling for ${domain}`);
  console.log(`   Token: ${expectedTxt}`);
  console.log(`   Initial wait: 30 seconds for DNS propagation...`);

  // Initial delay to allow for DNS propagation
  await new Promise((res) => setTimeout(res, 30000));

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    console.log(`\n🔄 Verification attempt ${attempt}/${MAX_ATTEMPTS} for ${domain}`);

    try {
      // STEP 1: Check TXT record (proves domain ownership)
      const txtCheck = await checkTxtRecord(domain, expectedTxt);
      
      if (!txtCheck.matches) {
        console.log(`⚠️ TXT record not verified yet`);
        
        if (attempt >= MAX_ATTEMPTS) {
          await markFailed(tenantId, domain, "TXT record not found after max attempts");
          
          if (email) {
            await sendDomainNotification(email, domain, "unverified", {
              step1: { value: expectedTxt },
              reason: "TXT record not found or incorrect"
            });
          }
          
          return { 
            status: "failed", 
            reason: "TXT record not found",
            attempts: MAX_ATTEMPTS 
          };
        }
        
        // Continue polling
        await new Promise((res) => setTimeout(res, POLL_INTERVAL));
        continue;
      }
      
      console.log(`✅ TXT record verified - domain ownership confirmed`);
      
      // STEP 2: Check domain pointing (CNAME or A record)
      const pointingCheck = await checkDomainPointing(domain);
      
      if (!pointingCheck.pointing) {
        console.log(`⚠️ Domain not pointing to platform yet`);
        
        if (attempt >= MAX_ATTEMPTS) {
          await markPending(tenantId, domain);
          
          if (email) {
            await sendDomainNotification(email, domain, "partially_verified", {
              step1: { value: expectedTxt },
              message: "Domain ownership verified, but CNAME/A record not set up yet"
            });
          }
          
          return { 
            status: "partially_verified", 
            reason: "DNS not pointing to platform",
            attempts: MAX_ATTEMPTS 
          };
        }
        
        // Continue polling
        await new Promise((res) => setTimeout(res, POLL_INTERVAL));
        continue;
      }
      
      console.log(`✅ Domain pointing verified via ${pointingCheck.method}`);
      
      // BOTH CHECKS PASSED - DOMAIN IS FULLY VERIFIED
      await markVerified(tenantId, domain);
      
      if (email) {
        await sendDomainNotification(email, domain, "verified");
      }
      
      console.log(`\n🎉 Domain fully verified: ${domain} (took ${attempt} attempts)`);
      return { 
        status: "verified", 
        method: pointingCheck.method, 
        attempts: attempt 
      };
      
    } catch (err) {
      console.error(`⚠️ Attempt ${attempt} error:`, err.message);
    }

    // Wait before next attempt (unless we've reached max attempts)
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((res) => setTimeout(res, POLL_INTERVAL));
    }
  }

  // Maximum attempts reached without success
  await markFailed(tenantId, domain, "Verification timeout after 20 minutes");
  
  if (email) {
    await sendDomainNotification(email, domain, "unverified", {
      step1: { value: expectedTxt },
      reason: "Verification timeout - DNS records not detected after 20 minutes"
    });
  }
  
  console.log(`\n❌ Verification failed after ${MAX_ATTEMPTS} attempts (${MAX_ATTEMPTS} minutes)`);
  return { status: "failed", attempts: MAX_ATTEMPTS, reason: "timeout" };
}

/**
 * Start the domain verification process
 * Creates token, sends email, and starts background polling
 */
async function startVerificationProcess(tenantId, domain, email = null, verificationToken = null) {
  try {
    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.warn(`⚠️ Invalid email for tenant ${tenantId}, skipping email notifications`);
      email = null;
    }

    // Create or use existing verification token
    const token = verificationToken || await createVerificationToken(tenantId, domain);

    // Send initial "pending" notification with setup instructions
    if (email) {
      await sendDomainNotification(email, domain, "pending", {
        step1: { value: token },
      });
      console.log(`📧 Setup instructions sent to ${email}`);
    }

    // Start background verification polling (non-blocking)
    pollForVerification(tenantId, domain, email, token)
      .then((result) => {
        console.log(`✅ Verification process completed for ${domain}:`, result);
      })
      .catch((err) => {
        console.error(`❌ Verification process failed for ${domain}:`, err);
      });

    return { 
      token, 
      message: "Domain verification started. Check your email for setup instructions." 
    };
  } catch (err) {
    console.error("❌ startVerificationProcess Error:", err);
    throw err;
  }
}

/**
 * Manual verification trigger - for admin use or retry logic
 * Immediately checks DNS without waiting for polling
 */
async function manualVerifyDomain(tenantId, domain) {
  try {
    const settings = await db.selectAll(
      "tbl_settings",
      "*",
      "tenant_id = ?",
      [tenantId]
    );

    if (!settings || settings.length === 0) {
      throw new Error("Tenant not found");
    }

    const expectedTxt = settings[0].dns_verification_txt;
    
    console.log(`🔍 Manual verification triggered for tenant ${tenantId}: ${domain}`);

    // Check TXT record (ownership)
    const txtCheck = await checkTxtRecord(domain, expectedTxt);
    
    // Check domain pointing (CNAME/A)
    const pointingCheck = await checkDomainPointing(domain);

    const result = {
      domain,
      tenant_id: tenantId,
      txt_verified: txtCheck.matches,
      domain_pointing: pointingCheck.pointing,
      verified: txtCheck.matches && pointingCheck.pointing,
      details: {
        txt_check: txtCheck,
        pointing_check: pointingCheck
      }
    };

    // Update database based on results
    if (result.verified) {
      await markVerified(tenantId, domain);
      result.message = "✅ Domain fully verified";
      result.status = "verified";
    } else if (txtCheck.matches) {
      await markPending(tenantId, domain);
      result.message = "⚠️ Domain ownership verified, but not pointing to platform yet";
      result.status = "partially_verified";
    } else {
      result.message = "❌ TXT record not found or incorrect";
      result.status = "pending";
    }

    return result;
  } catch (err) {
    console.error("❌ Manual verification error:", err);
    throw err;
  }
}

/**
 * Retry verification for a failed or pending domain
 * Restarts the polling process with existing token
 */
async function retryVerification(tenantId, domain, email = null) {
  try {
    const settings = await db.selectAll(
      "tbl_settings",
      "dns_verification_txt, email_id",
      "tenant_id = ?",
      [tenantId]
    );

    if (!settings || settings.length === 0) {
      throw new Error("Tenant settings not found");
    }

    const existingToken = settings[0].dns_verification_txt;
    const userEmail = email || settings[0].email_id;

    console.log(`🔄 Retrying verification for tenant ${tenantId}: ${domain}`);

    // Reset status to pending
    await markPending(tenantId, domain);

    // Restart verification process with existing token
    return await startVerificationProcess(tenantId, domain, userEmail, existingToken);
  } catch (err) {
    console.error("❌ Retry verification error:", err);
    throw err;
  }
}

/**
 * Get current verification status for a domain
 */
async function getVerificationStatus(tenantId) {
  try {
    const settings = await db.selectAll(
      "tbl_settings",
      "primary_domain_name, dns_status, dns_verification_txt, last_verified_at",
      "tenant_id = ?",
      [tenantId]
    );

    if (!settings || settings.length === 0) {
      return { found: false };
    }

    const tenant = await db.selectAll(
      "tbl_tenants",
      "custom_domain, custom_domain_status",
      "id = ?",
      [tenantId]
    );

    return {
      found: true,
      domain: settings[0].primary_domain_name,
      dns_status: settings[0].dns_status,
      verification_token: settings[0].dns_verification_txt,
      last_verified_at: settings[0].last_verified_at,
      custom_domain: tenant[0]?.custom_domain,
      custom_domain_status: tenant[0]?.custom_domain_status
    };
  } catch (err) {
    console.error("❌ Get verification status error:", err);
    throw err;
  }
}

module.exports = {
  createVerificationToken,
  pollForVerification,
  markVerified,
  markPending,
  markFailed,
  startVerificationProcess,
  manualVerifyDomain,
  retryVerification,
  getVerificationStatus,
  checkTxtRecord,
  checkDomainPointing
};