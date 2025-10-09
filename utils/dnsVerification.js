const dns = require("dns").promises;
const db = require("../config/db");

async function verifyTenantDomain(tenantId, domain, txtRecord) {
  const maxRetries = 3;
  let attempt = 1;

  try {
    const settings = await db.selectAll(
      "tbl_settings",
      "dns_verification_txt",
      "tenant_id = ? AND custom_domain = ?",
      [tenantId, domain]
    );
    if (settings.length === 0 || !settings[0].dns_verification_txt) {
      return { status: "error", message: "No TXT record found for verification" };
    }
    const expectedTxtRecord = txtRecord || settings[0].dns_verification_txt;

    while (attempt <= maxRetries) {
      try {
        console.log(`DNS TXT Verification Attempt ${attempt} for tenant ${tenantId}, domain ${domain}`);
        const txtRecords = await dns.resolveTxt(`_igrowbig-verification.${domain}`);
        console.log(`DNS TXT Records for ${domain}:`, txtRecords);

        const isVerified = txtRecords.some((record) => record.includes(expectedTxtRecord));
        if (isVerified) {
          return { status: "verified" };
        }
        return { status: "unverified" };
      } catch (error) {
        console.error(`DNS TXT Verification Error for ${domain} (Attempt ${attempt}):`, error);
        if (attempt === maxRetries) {
          return { status: "error", message: error.message };
        }
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  } catch (error) {
    console.error("verifyTenantDomain Error:", error.stack);
    return { status: "error", message: error.message };
  }
}

module.exports = { verifyTenantDomain };