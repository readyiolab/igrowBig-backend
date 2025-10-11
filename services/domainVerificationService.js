const db = require("../config/db");
const dns = require("dns").promises;
const crypto = require("crypto");
const { sendDomainNotification } = require("../config/email");

/**
 * Start domain verification process
 * Generates verification token and saves to database
 */
const startVerificationProcess = async (tenantId, customDomain, userEmail = null) => {
  try {
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    
    // Generate unique verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    
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
    }

    // Send setup instructions email
    if (userEmail) {
      const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
      const serverIP = process.env.SERVER_IP || "139.59.8.68";

      const instructions = {
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

      await sendDomainNotification(userEmail, customDomain, "pending", instructions);
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

    // Query DNS for TXT records
    const txtRecords = await dns.resolveTxt(txtRecordName);
    
    // Flatten records (TXT records come as arrays of arrays)
    const flatRecords = txtRecords.flat();
    
    console.log(`📝 Found TXT records:`, flatRecords);

    // Check if expected token exists
    const isVerified = flatRecords.some(record => record === expectedToken);

    if (isVerified) {
      console.log(`✅ Domain ownership verified: ${domain}`);
      return { verified: true };
    } else {
      console.log(`❌ Token mismatch for ${domain}`);
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
      if (cnameRecords.some(cname => cname.includes(baseDomain))) {
        console.log(`✅ CNAME pointing correctly: ${domain} -> ${baseDomain}`);
        return { pointing: true, method: "CNAME" };
      }
    } catch (cnameError) {
      // CNAME not found, try A record
    }

    // Check A record
    try {
      const aRecords = await dns.resolve4(domain);
      if (aRecords.includes(serverIP)) {
        console.log(`✅ A record pointing correctly: ${domain} -> ${serverIP}`);
        return { pointing: true, method: "A" };
      }
    } catch (aError) {
      // A record not found
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
    // Get verification record
    const verification = await db.selectAll(
      "tbl_domain_verifications",
      "*",
      "tenant_id = ?",
      [tenantId]
    );

    if (!verification.length) {
      return { success: false, message: "No verification record found" };
    }

    const verificationData = verification[0];
    const { domain, verification_token, verification_status } = verificationData;

    // Skip if already fully verified
    if (verification_status === "verified") {
      return { success: true, status: "verified", message: "Already verified" };
    }

    // Step 1: Check TXT record (ownership)
    const ownershipCheck = await verifyDomainOwnership(domain, verification_token);

    if (!ownershipCheck.verified) {
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

    // Step 2: Check if domain is pointing (CNAME/A)
    const pointingCheck = await checkDomainPointing(domain);

    let newStatus = "partially_verified"; // TXT verified, but not pointing
    let updateData = {
      verification_status: newStatus,
      last_check_at: timestamp,
      updated_at: timestamp,
    };

    if (pointingCheck.pointing) {
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
    const userEmail = settings[0]?.email_id;

    // Send notification
    if (userEmail) {
      await sendDomainNotification(userEmail, domain, newStatus);
    }

    console.log(`✅ Verification check complete: ${domain} - ${newStatus}`);

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
    console.log("🔄 Starting auto-verification of pending domains...");

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

    console.log(`📋 Found ${pendingVerifications.length} domains to check`);

    let verifiedCount = 0;

    for (const verification of pendingVerifications) {
      try {
        const result = await performVerificationCheck(verification.tenant_id);
        if (result.status === "verified") {
          verifiedCount++;
        }
      } catch (error) {
        console.error(`❌ Error checking ${verification.domain}:`, error.message);
      }
    }

    console.log(`✅ Auto-verification complete: ${verifiedCount}/${pendingVerifications.length} verified`);

    return { checked: pendingVerifications.length, verified: verifiedCount };
  } catch (error) {
    console.error("❌ Auto-verification error:", error);
    return { checked: 0, verified: 0 };
  }
};

/**
 * Manual verification trigger (for user/admin button)
 */
const manualVerifyDomain = async (tenantId) => {
  try {
    console.log(`🔄 Manual verification triggered for tenant ${tenantId}`);
    
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