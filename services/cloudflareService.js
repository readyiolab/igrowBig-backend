const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const axios = require("axios");
const dns = require("dns").promises;
const db = require("../config/db");

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const rootDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";

// Validate credentials on startup
console.log("🔍 Cloudflare Config Check:");
console.log({
  zoneId: CLOUDFLARE_ZONE_ID ? "✓ SET" : "✗ MISSING",
  apiToken: CLOUDFLARE_API_TOKEN ? `✓ SET (${CLOUDFLARE_API_TOKEN.substring(0, 10)}...)` : "✗ MISSING",
  tokenLength: CLOUDFLARE_API_TOKEN?.length || 0,
  rootDomain: rootDomain,
});

if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
  console.error("❌ CRITICAL: Missing Cloudflare credentials!");
}

const cfApi = axios.create({
  baseURL: "https://api.cloudflare.com/client/v4",
  headers: {
    "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

/**
 * Check if DNS record exists in Cloudflare
 */
async function cfRecordExists(name) {
  if (!CLOUDFLARE_ZONE_ID) {
    console.error("❌ Cannot check DNS: ZONE_ID is undefined");
    return false;
  }

  try {
    const response = await cfApi.get(
      `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
      { params: { name } }
    );

    return response.data.result && response.data.result.length > 0;
  } catch (err) {
    console.error("❌ cfRecordExists Error:", err.response?.status);
    console.error("Response:", JSON.stringify(err.response?.data, null, 2));
    return false;
  }
}

/**
 * Add subdomain CNAME record to Cloudflare
 */
async function addSubdomain(subdomain, verificationToken = null) {
  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
    console.warn("⚠️ Missing Cloudflare credentials. Skipping DNS creation.");
    return { success: false, error: "Missing Cloudflare credentials" };
  }

  const recordName = `${subdomain}.${rootDomain}`;

  try {
    // Check if record already exists
    const exists = await cfRecordExists(recordName);
    if (exists) {
      console.log(`✅ Subdomain already exists: ${recordName}`);
      
      // Still add TXT record if verification token provided
      if (verificationToken) {
        await addVerificationTxtRecord(subdomain, verificationToken);
      }
      
      return { success: true, alreadyExists: true };
    }

    // Create CNAME record
    const cnamePayload = {
      type: "CNAME",
      name: recordName,
      content: rootDomain,
      ttl: 1, // Auto TTL
      proxied: true,
    };

    const cnameResponse = await cfApi.post(
      `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
      cnamePayload
    );

    if (cnameResponse.data.success) {
      console.log(`✅ Cloudflare CNAME added: ${recordName}`);
      
      // Add verification TXT record if token provided
      if (verificationToken) {
        await addVerificationTxtRecord(subdomain, verificationToken);
      }
      
      return { success: true, data: cnameResponse.data.result };
    } else {
      console.error("❌ Cloudflare API returned errors:", cnameResponse.data.errors);
      return { success: false, error: cnameResponse.data.errors };
    }
  } catch (err) {
    console.error("❌ Cloudflare addSubdomain Error:", err.response?.status, err.response?.data);
    return {
      success: false,
      error: err.response?.data || err.message,
    };
  }
}

/**
 * Add verification TXT record to Cloudflare
 */
async function addVerificationTxtRecord(subdomain, token) {
  const txtRecordName = `_igrowbig-verification.${subdomain}.${rootDomain}`;
  
  try {
    // Check if TXT record already exists
    const exists = await cfRecordExists(txtRecordName);
    if (exists) {
      console.log(`✅ Verification TXT record already exists: ${txtRecordName}`);
      return { success: true, alreadyExists: true };
    }

    const txtPayload = {
      type: "TXT",
      name: txtRecordName,
      content: token,
      ttl: 1,
    };

    const txtResponse = await cfApi.post(
      `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
      txtPayload
    );

    if (txtResponse.data.success) {
      console.log(`✅ Cloudflare TXT verification record added: ${txtRecordName}`);
      return { success: true, data: txtResponse.data.result };
    } else {
      console.error("❌ Failed to add TXT record:", txtResponse.data.errors);
      return { success: false, error: txtResponse.data.errors };
    }
  } catch (err) {
    console.error("❌ addVerificationTxtRecord Error:", err.response?.status, err.response?.data);
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Delete DNS record from Cloudflare
 */
async function deleteSubdomain(name) {
  if (!CLOUDFLARE_ZONE_ID) {
    console.error("❌ Cannot delete DNS: ZONE_ID is undefined");
    return false;
  }

  try {
    // Find the record
    const response = await cfApi.get(
      `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
      { params: { name } }
    );

    if (response.data.result && response.data.result.length > 0) {
      const recordId = response.data.result[0].id;

      // Delete the record
      await cfApi.delete(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${recordId}`
      );

      console.log(`🗑️ Deleted Cloudflare record: ${name}`);
      return true;
    }

    console.log(`⚠️ Record not found: ${name}`);
    return false;
  } catch (err) {
    console.error("❌ deleteSubdomain Error:", err.response?.status, err.response?.data);
    return false;
  }
}

/**
 * Test Cloudflare API connection
 */
async function testConnection() {
  try {
    const response = await cfApi.get(`/zones/${CLOUDFLARE_ZONE_ID}`);
    console.log("✅ Cloudflare connection successful!");
    console.log("Zone:", response.data.result.name);
    return true;
  } catch (err) {
    console.error("❌ Cloudflare connection failed:", err.response?.status, err.response?.data);
    return false;
  }
}

/**
 * Manual domain verification endpoint (for admin use)
 * This checks both Cloudflare records AND uses the verification service
 */
async function manualVerifyDomain(req, res) {
  try {
    const { tenantId } = req.params;
    const { manualVerifyDomain: verifyDomainLogic } = require("./domainVerificationService");
    
    // Get domain info from database
    const settings = await db.selectAll(
      "tbl_settings",
      "primary_domain_name, dns_verification_txt, dns_status",
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
    const expectedTxt = settings[0].dns_verification_txt;
    const currentStatus = settings[0].dns_status;

    console.log(`🔍 Manual verification for tenant ${tenantId}, domain: ${domain}`);

    // Use the verification service logic
    const result = await verifyDomainLogic(tenantId, domain);

    // Also check Cloudflare records for additional info
    const cloudflareChecks = {};
    
    try {
      // Check CNAME in Cloudflare
      const cfCnameResponse = await cfApi.get(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        { params: { name: domain } }
      );

      cloudflareChecks.cloudflare_cname = {
        found: cfCnameResponse.data.result.length > 0,
        records: cfCnameResponse.data.result.map(r => ({
          type: r.type,
          name: r.name,
          content: r.content
        })),
      };

      // Check TXT in Cloudflare
      const txtName = `_igrowbig-verification.${domain}`;
      const cfTxtResponse = await cfApi.get(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        { params: { name: txtName } }
      );

      cloudflareChecks.cloudflare_txt = {
        found: cfTxtResponse.data.result.length > 0,
        matches: cfTxtResponse.data.result.some(r => r.content === expectedTxt),
        records: cfTxtResponse.data.result.map(r => r.content),
      };
    } catch (err) {
      cloudflareChecks.error = err.message;
    }

    res.json({
      success: result.verified,
      domain: domain,
      tenant_id: tenantId,
      previous_status: currentStatus,
      current_status: result.verified ? "verified" : (result.txt_verified ? "partially_verified" : "pending"),
      verification: {
        txt_verified: result.txt_verified,
        domain_pointing: result.domain_pointing,
      },
      cloudflare_info: cloudflareChecks,
      message: result.message,
      timestamp: new Date().toISOString()
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
 * Debug DNS records for a subdomain
 * GET /api/admin/debug-dns/:subdomain
 */
async function debugDNS(req, res) {
  try {
    const { subdomain } = req.params;
    const fullDomain = `${subdomain}.${rootDomain}`;
    const txtDomain = `_igrowbig-verification.${fullDomain}`;

    const results = {
      domain: fullDomain,
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // 1. Check Cloudflare API for CNAME records
    try {
      const cfResponse = await cfApi.get(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        { params: { name: fullDomain } }
      );

      results.checks.cloudflare_cname = {
        found: cfResponse.data.result.length > 0,
        records: cfResponse.data.result.map((r) => ({
          type: r.type,
          name: r.name,
          content: r.content,
          proxied: r.proxied,
          ttl: r.ttl,
        })),
      };
    } catch (err) {
      results.checks.cloudflare_cname = {
        error: err.message,
      };
    }

    // 2. Check Cloudflare API for TXT records
    try {
      const cfTxtResponse = await cfApi.get(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        { params: { name: txtDomain } }
      );

      results.checks.cloudflare_txt = {
        found: cfTxtResponse.data.result.length > 0,
        records: cfTxtResponse.data.result.map((r) => ({
          type: r.type,
          name: r.name,
          content: r.content,
        })),
      };
    } catch (err) {
      results.checks.cloudflare_txt = {
        error: err.message,
      };
    }

    // 3. Check DNS resolution for CNAME
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

    // 4. Check DNS resolution for A records
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

    // 5. Check TXT record resolution
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

    // 6. Summary
    results.summary = {
      cloudflare_setup: results.checks.cloudflare_cname?.found || false,
      dns_resolving: results.checks.dns_a?.found || results.checks.dns_cname?.found || false,
      txt_record_created: results.checks.cloudflare_txt?.found || false,
      txt_record_propagated: results.checks.dns_txt?.found || false,
      ready_for_verification: 
        (results.checks.dns_a?.found || results.checks.dns_cname?.found) && 
        results.checks.dns_txt?.found,
    };

    res.json(results);
  } catch (error) {
    res.status(500).json({ 
      error: "DEBUG_ERROR",
      message: error.message 
    });
  }
}

module.exports = {
  addSubdomain,
  cfRecordExists,
  deleteSubdomain,
  testConnection,
  addVerificationTxtRecord,
  debugDNS,
  manualVerifyDomain,
};