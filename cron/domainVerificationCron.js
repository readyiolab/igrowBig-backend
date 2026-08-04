// cron/domainVerificationCron.js
const cron = require("node-cron");
const { autoVerifyPendingDomains } = require("../services/domainVerificationService");

let isRunning = false;

/**
 * Setup cron job to auto-verify domains every 5 minutes
 */
const setupDomainVerificationCron = () => {
  cron.schedule("*/5 * * * *", async () => {
    if (isRunning) {
      console.log("⏭️ [CRON] Previous domain verification still running — skipping this tick");
      return;
    }

    isRunning = true;
    console.log("⏰ [CRON] Domain verification check started at:", new Date().toISOString());

    try {
      const result = await autoVerifyPendingDomains();
      console.log(`✅ [CRON] Checked: ${result.checked}, Verified: ${result.verified}`);
    } catch (error) {
      console.error("❌ [CRON] Domain verification error:", error.message);
    } finally {
      isRunning = false;
    }
  });

  console.log("✅ Domain verification cron job initialized (runs every 5 minutes)");
};

module.exports = { setupDomainVerificationCron };
