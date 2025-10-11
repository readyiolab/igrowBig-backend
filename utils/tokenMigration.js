/**
 * Token Migration Script
 * Run this ONCE to update all existing verification tokens to the new format
 * and resend notification emails
 */

const db = require("../config/db");
const crypto = require("crypto");
const { sendDomainNotification } = require("../config/email");

/**
 * Generate new token in correct format
 */
const generateVerificationToken = () => {
  return `igrow-${crypto.randomUUID()}`;
};

/**
 * Migrate existing tokens and resend emails
 */
const migrateTokens = async () => {
  try {
    console.log("\n🔄 ========================================");
    console.log("🔄 Starting Token Migration");
    console.log("🔄 ========================================\n");

    // Get all pending/partially_verified domains
    const pendingDomains = await db.queryAll(
      `SELECT 
        dv.*,
        s.email_id,
        u.email as user_email,
        t.store_name
       FROM tbl_domain_verifications dv
       LEFT JOIN tbl_settings s ON dv.tenant_id = s.tenant_id
       LEFT JOIN tbl_users u ON dv.tenant_id = u.tenant_id
       LEFT JOIN tbl_tenants t ON dv.tenant_id = t.id
       WHERE dv.verification_status IN ('pending', 'partially_verified')`
    );

    if (!pendingDomains || pendingDomains.length === 0) {
      console.log("✅ No pending domains found. Nothing to migrate.");
      return { success: true, migrated: 0 };
    }

    console.log(`📋 Found ${pendingDomains.length} domains to migrate:\n`);

    let migratedCount = 0;
    let emailsSentCount = 0;
    const errors = [];

    for (const domain of pendingDomains) {
      try {
        console.log(`\n--- Migrating: ${domain.domain} (Tenant ${domain.tenant_id}) ---`);
        console.log(`   Old Token: ${domain.verification_token}`);

        // Generate new token
        const newToken = generateVerificationToken();
        console.log(`   New Token: ${newToken}`);

        // Update database
        const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
        await db.update(
          "tbl_domain_verifications",
          {
            verification_token: newToken,
            updated_at: timestamp,
          },
          "tenant_id = ?",
          [domain.tenant_id]
        );

        console.log(`   ✅ Database updated`);
        migratedCount++;

        // Get email address
        const userEmail = domain.email_id || domain.user_email;
        
        if (!userEmail) {
          console.log(`   ⚠️ No email found for tenant ${domain.tenant_id}`);
          errors.push({
            tenant_id: domain.tenant_id,
            domain: domain.domain,
            error: "No email address found"
          });
          continue;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
          console.log(`   ⚠️ Invalid email format: ${userEmail}`);
          errors.push({
            tenant_id: domain.tenant_id,
            domain: domain.domain,
            error: "Invalid email format"
          });
          continue;
        }

        // Prepare email instructions
        const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
        const serverIP = process.env.SERVER_IP || "139.59.8.68";

        const instructions = {
          token: newToken,
          step1: {
            type: "TXT Record",
            name: `_igrowbig-verification.${domain.domain}`,
            value: newToken,
            ttl: "3600",
          },
          step2: {
            type: "CNAME/A Record",
            cname: {
              name: domain.domain.replace(/^www\./, ''),
              value: baseDomain,
            },
            a_record: {
              name: "@",
              value: serverIP,
            },
          },
        };

        // Send email
        console.log(`   📧 Sending notification to: ${userEmail}`);
        const emailResult = await sendDomainNotification(
          userEmail,
          domain.domain,
          "pending",
          instructions
        );

        if (emailResult.success) {
          console.log(`   ✅ Email sent successfully`);
          emailsSentCount++;
        } else {
          console.log(`   ❌ Email failed: ${emailResult.error}`);
          errors.push({
            tenant_id: domain.tenant_id,
            domain: domain.domain,
            email: userEmail,
            error: emailResult.error
          });
        }

      } catch (error) {
        console.error(`   ❌ Migration failed for ${domain.domain}:`, error.message);
        errors.push({
          tenant_id: domain.tenant_id,
          domain: domain.domain,
          error: error.message
        });
      }
    }

    console.log("\n🔄 ========================================");
    console.log("✅ Token Migration Complete!");
    console.log(`   Total domains: ${pendingDomains.length}`);
    console.log(`   Migrated: ${migratedCount}`);
    console.log(`   Emails sent: ${emailsSentCount}`);
    console.log(`   Errors: ${errors.length}`);
    console.log("🔄 ========================================\n");

    if (errors.length > 0) {
      console.log("\n⚠️ Errors encountered:");
      errors.forEach(err => {
        console.log(`   - Tenant ${err.tenant_id} (${err.domain}): ${err.error}`);
      });
    }

    return {
      success: true,
      total: pendingDomains.length,
      migrated: migratedCount,
      emails_sent: emailsSentCount,
      errors: errors
    };

  } catch (error) {
    console.error("\n❌ Migration script failed:", error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Update a single domain's token (for manual fixes)
 */
const updateSingleToken = async (tenantId, newToken = null) => {
  try {
    const token = newToken || generateVerificationToken();
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

    await db.update(
      "tbl_domain_verifications",
      {
        verification_token: token,
        updated_at: timestamp,
      },
      "tenant_id = ?",
      [tenantId]
    );

    console.log(`✅ Token updated for tenant ${tenantId}: ${token}`);
    return { success: true, token };
  } catch (error) {
    console.error(`❌ Failed to update token for tenant ${tenantId}:`, error);
    return { success: false, error: error.message };
  }
};

// If running directly from command line
if (require.main === module) {
  migrateTokens()
    .then(result => {
      console.log("\n✅ Migration script finished");
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error("\n❌ Migration script crashed:", error);
      process.exit(1);
    });
}

module.exports = {
  migrateTokens,
  updateSingleToken
};