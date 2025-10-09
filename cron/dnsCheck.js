const cron = require("node-cron");
const db = require("../config/db");
const { verifyTenantDomain, sendDomainNotification } = require("../utils/dnsVerification");

cron.schedule("0 */6 * * *", async () => {
  console.log("Running DNS revalidation job");
  try {
    const tenants = await db.selectAll(
      "tbl_tenants",
      "id, custom_domain, user_id",
      "custom_domain IS NOT NULL AND custom_domain_status = 'pending'"
    );
    for (const tenant of tenants) {
      try {
        const settings = await db.selectAll(
          "tbl_settings",
          "dns_verification_txt, email_id",
          "tenant_id = ?",
          [tenant.id]
        );
        if (settings.length === 0 || !settings[0].dns_verification_txt) {
          console.warn(`No TXT record found for tenant ${tenant.id}`);
          continue;
        }

        const dnsResult = await verifyTenantDomain(
          tenant.id,
          tenant.custom_domain,
          settings[0].dns_verification_txt
        );
        const updated_at = new Date().toISOString().slice(0, 19).replace("T", " ");
        await db.update(
          "tbl_tenants",
          {
            custom_domain_status: dnsResult.status,
            updated_at,
          },
          "id = ?",
          [tenant.id]
        );
        await db.update(
          "tbl_settings",
          {
            dns_status: dnsResult.status,
            last_verified_at: updated_at,
            updated_at,
          },
          "tenant_id = ?",
          [tenant.id]
        );

        if (dnsResult.status === "verified") {
          const user = await db.selectAll("tbl_users", "email, name", "id = ?", [tenant.user_id]);
          if (user.length > 0) {
            await sendDomainNotification(user[0].email, {
              name: user[0].name,
              custom_domain: tenant.custom_domain,
              txt_record: settings[0].dns_verification_txt,
              status: dnsResult.status,
            });
          }
        }
      } catch (error) {
        console.error(`DNS check failed for tenant ${tenant.id}, domain ${tenant.custom_domain}:`, error);
        await db.update(
          "tbl_tenants",
          {
            custom_domain_status: "error",
            updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
          },
          "id = ?",
          [tenant.id]
        );
        await db.update(
          "tbl_settings",
          {
            dns_status: "error",
            last_verified_at: new Date().toISOString().slice(0, 19).replace("T", " "),
            updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
          },
          "tenant_id = ?",
          [tenant.id]
        );
      }
    }
  } catch (error) {
    console.error("DNS revalidation job failed:", error);
  }
});