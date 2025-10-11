const db = require("../config/db");
const { 
  manualVerifyDomain: verifyDomainLogic, 
  checkTxtRecord, 
  checkDomainPointing,
  retryVerification: retryVerificationLogic 
} = require("../services/domainVerificationService");

/**
 * Manual domain verification endpoint
 * POST /api/admin/verify-domain/:tenantId
 */
async function manualVerifyDomain(req, res) {
  try {
    const { tenantId } = req.params;
    
    const settings = await db.selectAll(
      "tbl_settings",
      "primary_domain_name",
      "tenant_id = ?",
      [tenantId]
    );

    if (!settings || settings.length === 0) {
      return res.status(404).json({ 
        error: "TENANT_NOT_FOUND",
        message: "Tenant not found"
      });
    }

    const domain = settings[0].primary_domain_name;
    console.log(`🔍 Manual verification requested for tenant ${tenantId}: ${domain}`);
    
    const result = await verifyDomainLogic(tenantId, domain);

    res.json({
      success: result.verified,
      ...result
    });
  } catch (error) {
    console.error("Manual verification error:", error);
    res.status(500).json({ 
      error: "VERIFICATION_ERROR",
      message: error.message 
    });
  }
}

/**
 * Retry verification endpoint
 * POST /api/admin/retry-verification/:tenantId
 */
async function retryVerification(req, res) {
  try {
    const { tenantId } = req.params;
    
    const settings = await db.selectAll(
      "tbl_settings",
      "primary_domain_name, email_id",
      "tenant_id = ?",
      [tenantId]
    );

    if (!settings || settings.length === 0) {
      return res.status(404).json({ 
        error: "TENANT_NOT_FOUND",
        message: "Tenant not found"
      });
    }

    console.log(`🔄 Retry verification for tenant ${tenantId}`);

    const result = await retryVerificationLogic(
      tenantId, 
      settings[0].primary_domain_name,
      settings[0].email_id
    );

    res.json({
      success: true,
      message: "Verification restarted",
      token: result.token
    });
  } catch (error) {
    console.error("Retry verification error:", error);
    res.status(500).json({ 
      error: "RETRY_ERROR",
      message: error.message 
    });
  }
}

/**
 * Debug DNS records for a subdomain
 * GET /api/admin/debug-dns/:subdomain
 */
async function debugDNS(req, res) {
  try {
    const { subdomain } = req.params;
    const rootDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
    const fullDomain = `${subdomain}.${rootDomain}`;
    const txtDomain = `_igrowbig-verification.${fullDomain}`;

    console.log(`🔍 Debug DNS requested for: ${fullDomain}`);

    const results = {
      domain: fullDomain,
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // Import DNS module
    const dns = require('dns').promises;

    // 1. Check DNS resolution for CNAME
    try {
      const cnameRecords = await dns.resolveCname(fullDomain);
      results.checks.dns_cname = {
        found: true,
        records: cnameRecords,
      };
    } catch (err) {
      results.checks.dns_cname = {
        found: false,
        error: err.code || err.message,
      };
    }

    // 2. Check DNS resolution for A records
    try {
      const aRecords = await dns.resolve4(fullDomain);
      results.checks.dns_a = {
        found: true,
        records: aRecords,
        note: "Domain resolves to these IPs (likely Cloudflare proxy)",
      };
    } catch (err) {
      results.checks.dns_a = {
        found: false,
        error: err.code || err.message,
      };
    }

    // 3. Check TXT record resolution
    try {
      const txtRecords = await dns.resolveTxt(txtDomain);
      results.checks.dns_txt = {
        found: true,
        records: txtRecords.flat(),
      };
    } catch (err) {
      results.checks.dns_txt = {
        found: false,
        error: err.code || err.message,
      };
    }

    // 4. Summary
    results.summary = {
      dns_resolving: results.checks.dns_a?.found || results.checks.dns_cname?.found || false,
      txt_record_propagated: results.checks.dns_txt?.found || false,
      ready_for_verification: 
        (results.checks.dns_a?.found || results.checks.dns_cname?.found) && 
        results.checks.dns_txt?.found,
    };

    res.json(results);
  } catch (error) {
    console.error("Debug DNS error:", error);
    res.status(500).json({ 
      error: "DEBUG_ERROR",
      message: error.message 
    });
  }
}

/**
 * Check custom domain status
 * GET /api/admin/check-domain/:domain
 */
async function checkCustomDomain(req, res) {
  try {
    const { domain } = req.params;
    
    console.log(`🔍 Checking domain status: ${domain}`);

    // Find tenant by domain
    const settings = await db.selectAll(
      "tbl_settings",
      "tenant_id, primary_domain_name, dns_status, dns_verification_txt, last_verified_at",
      "primary_domain_name = ?",
      [domain]
    );

    if (!settings || settings.length === 0) {
      return res.status(404).json({ 
        error: "DOMAIN_NOT_FOUND",
        message: "Domain not found in system"
      });
    }

    const tenantId = settings[0].tenant_id;
    const expectedTxt = settings[0].dns_verification_txt;

    // Perform live DNS checks
    const txtCheck = await checkTxtRecord(domain, expectedTxt);
    const pointingCheck = await checkDomainPointing(domain);

    res.json({
      domain: domain,
      tenant_id: tenantId,
      current_status: settings[0].dns_status,
      last_verified: settings[0].last_verified_at,
      live_checks: {
        txt_verified: txtCheck.matches,
        txt_details: txtCheck,
        domain_pointing: pointingCheck.pointing,
        pointing_details: pointingCheck
      },
      verification_token: expectedTxt
    });
  } catch (error) {
    console.error("Check custom domain error:", error);
    res.status(500).json({ 
      error: "CHECK_ERROR",
      message: error.message 
    });
  }
}

module.exports = {
  manualVerifyDomain,
  retryVerification,
  debugDNS,
  checkCustomDomain
};