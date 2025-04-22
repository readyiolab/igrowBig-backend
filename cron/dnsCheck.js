// backend/cron/dnsCheck.js
const cron = require("node-cron");
const dns = require("dns").promises;
const db = require("../config/db");

cron.schedule("0 */6 * * *", async () => {
  console.log("Running DNS revalidation job");
  try {
    const settings = await db.selectAll("tbl_settings", "*", "domain_type = 'custom_domain'");
    for (const setting of settings) {
      try {
        const expectedARecord = process.env.SERVER_IP || "127.0.0.1";
        const records = await dns.resolve(setting.primary_domain_name, "A");
        const dnsStatus = records.includes(expectedARecord) ? "verified" : "unverified";
        await db.update(
          "tbl_settings",
          { dns_status: dnsStatus, updated_at: new Date().toISOString().slice(0, 19).replace("T", " ") },
          "tenant_id = ?",
          [setting.tenant_id]
        );
      } catch (error) {
        console.error(`DNS check failed for ${setting.primary_domain_name}:`, error);
        await db.update(
          "tbl_settings",
          { dns_status: "error", updated_at: new Date().toISOString().slice(0, 19).replace("T", " ") },
          "tenant_id = ?",
          [setting.tenant_id]
        );
      }
    }
  } catch (error) {
    console.error("DNS revalidation job failed:", error);
  }
});