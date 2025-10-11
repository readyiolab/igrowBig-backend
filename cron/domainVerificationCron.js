// cron/domainVerificationCron.js
const cron = require("node-cron");
const { autoVerifyPendingDomains } = require("../services/domainVerificationService");

/**
 * Setup cron job to auto-verify domains every 5 minutes
 */
const setupDomainVerificationCron = () => {
  // Run every 5 minutes: */5 * * * *
  // Run every 1 minute for faster checks: */1 * * * *
  
  cron.schedule("*/5 * * * *", async () => {
    console.log("⏰ [CRON] Domain verification check started at:", new Date().toISOString());
    
    try {
      const result = await autoVerifyPendingDomains();
      console.log(`✅ [CRON] Checked: ${result.checked}, Verified: ${result.verified}`);
    } catch (error) {
      console.error("❌ [CRON] Domain verification error:", error.message);
    }
  });

  console.log("✅ Domain verification cron job initialized (runs every 5 minutes)");
};

module.exports = { setupDomainVerificationCron };