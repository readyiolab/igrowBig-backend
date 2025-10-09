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

    await db.update("tbl_tenants", { domain }, "id = ?", [tenantId]);

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

async function pollForVerification(tenantId, domain, email, expectedTxt) {
  let attempt = 0;

  console.log(`🔍 Starting verification for ${domain}`);
  console.log(`   ⏳ Waiting 30 seconds for Cloudflare API sync...`);

  await new Promise((res) => setTimeout(res, 30000));

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    console.log(`🔄 Verification attempt ${attempt}/${MAX_ATTEMPTS} for ${domain}`);

    try {
      const cfCnameResponse = await cfApi.get(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        { params: { name: domain } }
      );

      if (cfCnameResponse.data.result.length > 0) {
        await markVerified(tenantId, domain);
        await sendDomainNotification(email, domain, "verified");
        console.log(`✅ Domain verified via Cloudflare API: ${domain}`);
        return { status: "verified", method: "cloudflare_api", attempts: attempt };
      }
    } catch (err) {
      console.error(`⚠️ Verification attempt ${attempt} error:`, err.message);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((res) => setTimeout(res, POLL_INTERVAL));
    }
  }

  await markPending(tenantId, domain);
  await sendDomainNotification(email, domain, "unverified", {
    step1: { value: expectedTxt },
  });
  console.log(`❌ Verification failed after ${MAX_ATTEMPTS} attempts: ${domain}`);
  return { status: "unverified", attempts: MAX_ATTEMPTS };
}

async function startVerificationProcess(tenantId, domain, email, verificationToken = null) {
  try {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.warn(`⚠️ No valid email provided for tenant ${tenantId}. Skipping email notification.`);
      // Optionally, throw an error if email is mandatory
      // throw new Error("Valid email address required for domain verification notification");
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