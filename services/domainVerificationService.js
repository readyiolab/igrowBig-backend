const db = require("../config/db");
const dns = require("dns").promises;
const crypto = require("crypto");
const { sendDomainNotification } = require("../config/email");

/**
 * Generate a consistent verification token format
 */
const generateVerificationToken = () => {
  return `igrow-${crypto.randomUUID()}`;
};

/**
 * Start domain verification process
 * Generates verification token and saves to database
 */
const startVerificationProcess = async (tenantId, customDomain, userEmail = null) => {
  try {
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    
    // Generate unique verification token with consistent format
    const verificationToken = generateVerificationToken();
    
    console.log(`🔐 Generated verification token for ${customDomain}: ${verificationToken}`);
    
    // Check if verification record exists
    const existingVerification = await db.selectAll(
      "tbl_domain_verifications",
      "*",
      "tenant_id = ?",
      [tenantId]
    );

    if (existingVerification.length > 0) {
      // Update existing record
      await db.update(
        "tbl_domain_verifications",
        {
          domain: customDomain,
          verification_token: verificationToken,
          verification_status: "pending",
          verification_method: "TXT",
          last_check_at: timestamp,
          updated_at: timestamp,
        },
        "tenant_id = ?",
        [tenantId]
      );
      console.log(`✅ Updated existing verification record for tenant ${tenantId}`);
    } else {
      // Insert new record
      await db.insert("tbl_domain_verifications", {
        tenant_id: tenantId,
        domain: customDomain,
        verification_token: verificationToken,
        verification_status: "pending",
        verification_method: "TXT",
        last_check_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      });
      console.log(`✅ Created new verification record for tenant ${tenantId}`);
    }

    // Get user email if not provided
    if (!userEmail) {
      const settings = await db.selectAll(
        "tbl_settings",
        "email_id",
        "tenant_id = ?",
        [tenantId]
      );
      userEmail = settings[0]?.email_id;
      
      if (!userEmail) {
        const user = await db.selectAll(
          "tbl_users",
          "email",
          "tenant_id = ?",
          [tenantId]
        );
        userEmail = user[0]?.email;
      }
    }

    // Send setup instructions email
    if (userEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
      const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
      const serverIP = process.env.SERVER_IP || "139.59.8.68";

      const instructions = {
        token: verificationToken, // Add token at root level for backward compatibility
        step1: {
          type: "TXT Record",
          name: `_igrowbig-verification.${customDomain}`,
          value: verificationToken,
          ttl: "3600",
        },
        step2: {
          type: "CNAME/A Record",
          cname: {
            name: customDomain.replace(/^www\./, ''),
            value: baseDomain,
          },
          a_record: {
            name: "@",
            value: serverIP,
          },
        },
      };

      console.log(`📧 Sending verification email to: ${userEmail}`);
      const emailResult = await sendDomainNotification(userEmail, customDomain, "pending", instructions);
      
      if (emailResult.success) {
        console.log(`✅ Verification email sent successfully`);
      } else {
        console.error(`❌ Failed to send verification email: ${emailResult.error}`);
      }
    } else {
      console.warn(`⚠️ No valid email found for tenant ${tenantId}. Verification email not sent.`);
    }

    console.log(`✅ Verification started for ${customDomain} (Tenant ${tenantId})`);

    return {
      success: true,
      token: verificationToken,
      domain: customDomain,
      status: "pending",
    };
  } catch (error) {
    console.error("❌ Start verification error:", error);
    throw new Error("Failed to start verification process");
  }
};

/**
 * Verify domain ownership via DNS TXT record
 */
const verifyDomainOwnership = async (domain, expectedToken) => {
  try {
    const txtRecordName = `_igrowbig-verification.${domain}`;
    
    console.log(`🔍 Checking TXT record: ${txtRecordName}`);
    console.log(`🔑 Expected token: ${expectedToken}`);

    // Query DNS for TXT records
    const txtRecords = await dns.resolveTxt(txtRecordName);
    
    // Flatten records (TXT records come as arrays of arrays)
    const flatRecords = txtRecords.flat();
    
    console.log(`📝 Found TXT records:`, flatRecords);

    // Check if expected token exists (exact match)
    const isVerified = flatRecords.some(record => {
      const recordTrimmed = record.trim();
      const expectedTrimmed = expectedToken.trim();
      const matches = recordTrimmed === expectedTrimmed;
      
      if (!matches) {
        console.log(`   ❌ Record "${recordTrimmed}" !== "${expectedTrimmed}"`);
      } else {
        console.log(`   ✅ Record matches!`);
      }
      
      return matches;
    });

    if (isVerified) {
      console.log(`✅ Domain ownership verified: ${domain}`);
      return { verified: true };
    } else {
      console.log(`❌ Token mismatch for ${domain}`);
      console.log(`   Expected: ${expectedToken}`);
      console.log(`   Found: ${flatRecords.join(', ')}`);
      return { verified: false, reason: "Token not found or incorrect" };
    }
  } catch (error) {
    if (error.code === "ENOTFOUND" || error.code === "ENODATA") {
      console.log(`⚠️ TXT record not found yet for ${domain}`);
      return { verified: false, reason: "TXT record not found" };
    }
    console.error(`❌ DNS verification error for ${domain}:`, error.message);
    return { verified: false, reason: error.message };
  }
};

/**
 * Check if domain is pointing to platform (CNAME or A record)
 */
const checkDomainPointing = async (domain) => {
  const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
  const serverIP = process.env.SERVER_IP || "139.59.8.68";

  try {
    // Check CNAME record
    try {
      const cnameRecords = await dns.resolveCname(domain);
      console.log(`📝 Found CNAME records for ${domain}:`, cnameRecords);
      
      if (cnameRecords.some(cname => cname.includes(baseDomain))) {
        console.log(`✅ CNAME pointing correctly: ${domain} -> ${baseDomain}`);
        return { pointing: true, method: "CNAME" };
      }
    } catch (cnameError) {
      console.log(`⚠️ No CNAME record found for ${domain}, trying A record...`);
    }

    // Check A record
    try {
      const aRecords = await dns.resolve4(domain);
      console.log(`📝 Found A records for ${domain}:`, aRecords);
      
      if (aRecords.includes(serverIP)) {
        console.log(`✅ A record pointing correctly: ${domain} -> ${serverIP}`);
        return { pointing: true, method: "A" };
      }
    } catch (aError) {
      console.log(`⚠️ No A record found for ${domain}`);
    }

    console.log(`⚠️ Domain not pointing to platform: ${domain}`);
    return { pointing: false, reason: "No valid CNAME or A record found" };
  } catch (error) {
    console.error(`❌ Domain pointing check error for ${domain}:`, error.message);
    return { pointing: false, reason: error.message };
  }
};

/**
 * Perform full domain verification check
 */
const performVerificationCheck = async (tenantId) => {
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

  try {
    console.log(`\n🔄 Starting verification check for tenant ${tenantId}...`);
    
    // Get verification record
    const verification = await db.selectAll(
      "tbl_domain_verifications",
      "*",
      "tenant_id = ?",
      [tenantId]
    );

    if (!verification.length) {
      console.log(`❌ No verification record found for tenant ${tenantId}`);
      return { success: false, message: "No verification record found" };
    }

    const verificationData = verification[0];
    const { domain, verification_token, verification_status } = verificationData;

    console.log(`📋 Verification details:`);
    console.log(`   Domain: ${domain}`);
    console.log(`   Current Status: ${verification_status}`);
    console.log(`   Token: ${verification_token}`);

    // Skip if already fully verified
    if (verification_status === "verified") {
      console.log(`✅ Domain already fully verified`);
      return { success: true, status: "verified", message: "Already verified" };
    }

    // Step 1: Check TXT record (ownership)
    console.log(`\n📋 Step 1: Checking TXT record for ownership...`);
    const ownershipCheck = await verifyDomainOwnership(domain, verification_token);

    if (!ownershipCheck.verified) {
      console.log(`❌ Ownership verification failed: ${ownershipCheck.reason}`);
      
      // Update last check time
      await db.update(
        "tbl_domain_verifications",
        { last_check_at: timestamp },
        "tenant_id = ?",
        [tenantId]
      );

      return {
        success: false,
        status: "pending",
        message: "TXT record not verified yet",
        reason: ownershipCheck.reason,
      };
    }

    console.log(`✅ Ownership verified!`);

    // Step 2: Check if domain is pointing (CNAME/A)
    console.log(`\n📋 Step 2: Checking if domain is pointing to platform...`);
    const pointingCheck = await checkDomainPointing(domain);

    let newStatus = "partially_verified"; // TXT verified, but not pointing
    let updateData = {
      verification_status: newStatus,
      last_check_at: timestamp,
      updated_at: timestamp,
    };

    if (pointingCheck.pointing) {
      console.log(`✅ Domain is pointing correctly via ${pointingCheck.method}`);
      newStatus = "verified";
      updateData.verification_status = "verified";
      updateData.verified_at = timestamp;

      // Update tenant custom_domain_status
      await db.update(
        "tbl_tenants",
        { custom_domain_status: "verified", updated_at: timestamp },
        "id = ?",
        [tenantId]
      );

      // Update settings dns_status
      await db.update(
        "tbl_settings",
        { dns_status: "verified", updated_at: timestamp },
        "tenant_id = ?",
        [tenantId]
      );
    } else {
      console.log(`⚠️ Domain ownership verified but not pointing yet: ${pointingCheck.reason}`);
    }

    // Update verification record
    await db.update(
      "tbl_domain_verifications",
      updateData,
      "tenant_id = ?",
      [tenantId]
    );

    // Get user email for notification
    const settings = await db.selectAll(
      "tbl_settings",
      "email_id",
      "tenant_id = ?",
      [tenantId]
    );
    let userEmail = settings[0]?.email_id;

    if (!userEmail) {
      const user = await db.selectAll(
        "tbl_users",
        "email",
        "tenant_id = ?",
        [tenantId]
      );
      userEmail = user[0]?.email;
    }

    // Send notification only if status changed
    if (userEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
      console.log(`📧 Sending status update email to: ${userEmail}`);
      const emailResult = await sendDomainNotification(userEmail, domain, newStatus);
      
      if (emailResult.success) {
        console.log(`✅ Status email sent successfully`);
      } else {
        console.error(`❌ Failed to send status email: ${emailResult.error}`);
      }
    }

    console.log(`\n✅ Verification check complete: ${domain} - ${newStatus}`);

    return {
      success: true,
      status: newStatus,
      ownership_verified: ownershipCheck.verified,
      pointing_verified: pointingCheck.pointing,
      message: newStatus === "verified" 
        ? "Domain fully verified and live" 
        : "Domain ownership verified, but not pointing yet",
    };
  } catch (error) {
    console.error("❌ Verification check error:", error);
    return { success: false, message: error.message };
  }
};

/**
 * Auto-verify pending domains (run periodically via cron)
 */
const autoVerifyPendingDomains = async () => {
  try {
    console.log("\n🔄 ========================================");
    console.log("🔄 Starting auto-verification of pending domains...");
    console.log("🔄 ========================================");

    // Get all pending/partially verified domains
    const pendingVerifications = await db.queryAll(
      `SELECT * FROM tbl_domain_verifications 
       WHERE verification_status IN ('pending', 'partially_verified')
       AND last_check_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
    );

    if (!pendingVerifications.length) {
      console.log("✅ No pending domains to verify");
      return { checked: 0, verified: 0 };
    }

    console.log(`📋 Found ${pendingVerifications.length} domains to check\n`);

    let verifiedCount = 0;
    let partiallyVerifiedCount = 0;

    for (const verification of pendingVerifications) {
      try {
        console.log(`\n--- Checking domain: ${verification.domain} (Tenant ${verification.tenant_id}) ---`);
        
        const result = await performVerificationCheck(verification.tenant_id);
        
        if (result.status === "verified") {
          verifiedCount++;
          console.log(`🎉 FULLY VERIFIED: ${verification.domain}`);
        } else if (result.status === "partially_verified") {
          partiallyVerifiedCount++;
          console.log(`⚠️ PARTIALLY VERIFIED: ${verification.domain}`);
        } else {
          console.log(`⏳ STILL PENDING: ${verification.domain}`);
        }
      } catch (error) {
        console.error(`❌ Error checking ${verification.domain}:`, error.message);
      }
    }

    console.log("\n🔄 ========================================");
    console.log(`✅ Auto-verification complete:`);
    console.log(`   Total checked: ${pendingVerifications.length}`);
    console.log(`   Fully verified: ${verifiedCount}`);
    console.log(`   Partially verified: ${partiallyVerifiedCount}`);
    console.log(`   Still pending: ${pendingVerifications.length - verifiedCount - partiallyVerifiedCount}`);
    console.log("🔄 ========================================\n");

    return { 
      checked: pendingVerifications.length, 
      verified: verifiedCount,
      partially_verified: partiallyVerifiedCount
    };
  } catch (error) {
    console.error("❌ Auto-verification error:", error);
    return { checked: 0, verified: 0, partially_verified: 0 };
  }
};

/**
 * Manual verification trigger (for user/admin button)
 */
const manualVerifyDomain = async (tenantId) => {
  try {
    console.log(`\n🔄 Manual verification triggered for tenant ${tenantId}`);
    
    const result = await performVerificationCheck(tenantId);
    
    return result;
  } catch (error) {
    console.error("❌ Manual verification error:", error);
    throw new Error("Failed to verify domain");
  }
};

/**
 * Get verification status for a tenant
 */
const getVerificationStatus = async (tenantId) => {
  try {
    const verification = await db.selectAll(
      "tbl_domain_verifications",
      "*",
      "tenant_id = ?",
      [tenantId]
    );

    if (!verification.length) {
      return { status: "not_started", message: "No verification in progress" };
    }

    return {
      status: verification[0].verification_status,
      domain: verification[0].domain,
      token: verification[0].verification_token,
      last_check: verification[0].last_check_at,
      verified_at: verification[0].verified_at,
    };
  } catch (error) {
    console.error("❌ Get verification status error:", error);
    throw new Error("Failed to get verification status");
  }
};

module.exports = {
  startVerificationProcess,
  verifyDomainOwnership,
  checkDomainPointing,
  performVerificationCheck,
  autoVerifyPendingDomains,
  manualVerifyDomain,
  getVerificationStatus,
};