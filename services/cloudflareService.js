const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const axios = require("axios");
const dns = require("dns").promises;
const db = require("../config/db");

// ✅ FIXED: Only need API Token and Zone ID (no email needed for tokens)
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const rootDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";

// Validate credentials on startup
console.log("🔍 Cloudflare Config Check:");
console.log({
  zoneId: CLOUDFLARE_ZONE_ID ? "✓ SET" : "✗ MISSING",
  apiToken: CLOUDFLARE_API_TOKEN
    ? `✓ SET (${CLOUDFLARE_API_TOKEN.substring(0, 10)}...)`
    : "✗ MISSING",
  rootDomain: rootDomain,
});

if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
  console.error("❌ CRITICAL: Missing Cloudflare credentials!");
  console.error("Required: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID");
}

// ✅ FIXED: Single axios instance with Bearer token authentication
const cfApi = axios.create({
  baseURL: "https://api.cloudflare.com/client/v4",
  headers: {
    Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

/**
 * 🔍 Check if DNS record exists
 */
async function cfRecordExists(name) {
  if (!CLOUDFLARE_ZONE_ID) {
    console.error("❌ Cannot check DNS: ZONE_ID is undefined");
    return false;
  }

  try {
    const response = await cfApi.get(
      `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
      {
        params: { name },
      }
    );

    return response.data.result && response.data.result.length > 0;
  } catch (err) {
    console.error("❌ cfRecordExists Error:", err.response?.status);
    console.error("Response:", JSON.stringify(err.response?.data, null, 2));
    return false;
  }
}

/**
 * ➕ Add subdomain CNAME record
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
      console.error(
        "❌ Cloudflare API returned errors:",
        cnameResponse.data.errors
      );
      return { success: false, error: cnameResponse.data.errors };
    }
  } catch (err) {
    console.error(
      "❌ Cloudflare addSubdomain Error:",
      err.response?.status,
      err.response?.data
    );
    return {
      success: false,
      error: err.response?.data || err.message,
    };
  }
}

/**
 * ➕ Add verification TXT record
 */
async function addVerificationTxtRecord(subdomain, token) {
  const txtRecordName = `_igrowbig-verification.${subdomain}.${rootDomain}`;

  try {
    // Check if TXT record already exists
    const exists = await cfRecordExists(txtRecordName);
    if (exists) {
      console.log(
        `✅ Verification TXT record already exists: ${txtRecordName}`
      );
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
      console.log(
        `✅ Cloudflare TXT verification record added: ${txtRecordName}`
      );
      return { success: true, data: txtResponse.data.result };
    } else {
      console.error("❌ Failed to add TXT record:", txtResponse.data.errors);
      return { success: false, error: txtResponse.data.errors };
    }
  } catch (err) {
    console.error(
      "❌ addVerificationTxtRecord Error:",
      err.response?.status,
      err.response?.data
    );
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * 🗑️ Delete DNS record
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
      {
        params: { name },
      }
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
    console.error(
      "❌ deleteSubdomain Error:",
      err.response?.status,
      err.response?.data
    );
    return false;
  }
}

/**
 * 🧪 Test Cloudflare connection
 */
async function testConnection() {
  try {
    const response = await cfApi.get(`/zones/${CLOUDFLARE_ZONE_ID}`);
    console.log("✅ Cloudflare connection successful!");
    console.log("Zone:", response.data.result.name);
    return true;
  } catch (err) {
    console.error(
      "❌ Cloudflare connection failed:",
      err.response?.status,
      err.response?.data
    );
    return false;
  }
}

/**
 * 🔐 Add custom hostname with SSL
 */
async function addCustomHostnameWithSSL(domain) {
  try {
    console.log(`🔐 Adding custom hostname with SSL: ${domain}`);

    // ✅ FIXED: Only check for token and zone ID
    if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN) {
      throw new Error("Missing Cloudflare credentials (API Token or Zone ID)");
    }

    const payload = {
      hostname: domain,
      ssl: {
        method: "txt", // Verification method
        type: "dv", // Domain Validation SSL
        settings: {
          min_tls_version: "1.2",
          tls_1_3: "on",
          http2: "on",
        },
        wildcard: false,
      },
    };

    const response = await cfApi.post(
      `/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`,
      payload
    );

    if (response.data.success) {
      const result = response.data.result;

      console.log(`✅ Custom hostname added successfully!`);
      console.log(`   Domain: ${domain}`);
      console.log(`   SSL Status: ${result.ssl.status}`);
      console.log(
        `   Certificate Authority: ${
          result.ssl.certificate_authority || "Let's Encrypt"
        }`
      );

      // Extract verification details
      const txtRecord = result.ssl.validation_records?.[0] || null;

      return {
        success: true,
        hostname_id: result.id,
        ssl_status: result.ssl.status,
        verification: {
          method: "TXT",
          name: txtRecord?.txt_name || `_acme-challenge.${domain}`,
          value: txtRecord?.txt_value || "Will be provided",
        },
        certificate: {
          status: result.ssl.status,
          issuer: result.ssl.certificate_authority || "Let's Encrypt",
          validation_type: result.ssl.type,
        },
        status: result.status,
      };
    }

    return {
      success: false,
      error: response.data.errors,
      message: "Failed to add custom hostname",
    };
  } catch (err) {
    console.error("❌ addCustomHostnameWithSSL Error:", err.response?.data || err.message);

    // Handle authentication errors
    if (err.response?.data?.errors?.[0]?.code === 10000 || 
        err.response?.data?.errors?.[0]?.code === 10001) {
      console.error("❌ Authentication failed!");
      console.error("   Please verify:");
      console.error("   1. CLOUDFLARE_API_TOKEN is correct");
      console.error("   2. Token has 'SSL and Certificates:Edit' permission");
      console.error("   3. Token is not expired");
      console.error("   4. CLOUDFLARE_ZONE_ID matches your domain");
      
      return {
        success: false,
        error: [{
          code: err.response.data.errors[0].code,
          message: "Authentication failed: Invalid API Token or insufficient permissions"
        }],
        message: "Failed to authenticate with Cloudflare. Please verify your API Token has 'SSL and Certificates:Edit' permission.",
      };
    }

    // Handle "already exists" error
    if (err.response?.data?.errors?.[0]?.code === 1414) {
      console.log("ℹ️ Custom hostname already exists, fetching status...");
      return await getCustomHostnameStatus(domain);
    }

    return {
      success: false,
      error: err.response?.data?.errors || [{ code: 0, message: err.message }],
      message: "Failed to add custom hostname",
    };
  }
}

/**
 * 🔍 Check SSL certificate status for custom domain
 */
async function getCustomHostnameStatus(domain) {
  try {
    const response = await cfApi.get(
      `/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames`,
      { params: { hostname: domain } }
    );

    if (response.data.result?.[0]) {
      const hostname = response.data.result[0];
      const ssl = hostname.ssl;

      console.log(`📊 SSL Status for ${domain}:`, ssl.status);

      return {
        success: true,
        hostname_id: hostname.id,
        ssl_status: ssl.status,
        ssl_active: ssl.status === "active",
        verification: {
          method: "TXT",
          name:
            ssl.validation_records?.[0]?.txt_name ||
            `_acme-challenge.${domain}`,
          value: ssl.validation_records?.[0]?.txt_value || null,
        },
        certificate: {
          status: ssl.status,
          issuer: ssl.certificate_authority || "Let's Encrypt",
          expires_on: ssl.expires_on || null,
        },
        status: hostname.status,
      };
    }

    return {
      success: false,
      error: "Custom hostname not found in Cloudflare",
    };
  } catch (err) {
    console.error("❌ getCustomHostnameStatus Error:", err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data?.errors || [{ code: 0, message: err.message }],
    };
  }
}

/**
 * 🔄 Poll for SSL activation
 */
async function waitForSSLActivation(domain, maxAttempts = 20, interval = 15000) {
  console.log(`⏳ Waiting for SSL activation for ${domain}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await getCustomHostnameStatus(domain);

    if (status.success) {
      console.log(
        `   Attempt ${attempt}/${maxAttempts} - SSL Status: ${status.ssl_status}`
      );

      if (status.ssl_status === "active") {
        console.log(`✅ SSL is ACTIVE for ${domain}!`);
        return { success: true, ssl_active: true, attempts: attempt };
      }

      if (status.ssl_status === "pending_validation") {
        console.log(`   ⏳ Waiting for customer to add TXT record...`);
      }

      if (status.ssl_status === "pending_deployment") {
        console.log(`   ⏳ Certificate issued, deploying to edge...`);
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  console.log(`⚠️ SSL activation timeout for ${domain}`);
  return {
    success: false,
    ssl_active: false,
    attempts: maxAttempts,
    message: "SSL activation timeout - check verification TXT record",
  };
}

/**
 * 🗑️ Delete custom hostname
 */
async function deleteCustomHostname(domain) {
  try {
    const statusResult = await getCustomHostnameStatus(domain);

    if (!statusResult.success || !statusResult.hostname_id) {
      return { success: true, message: "Hostname not found" };
    }

    await cfApi.delete(
      `/zones/${CLOUDFLARE_ZONE_ID}/custom_hostnames/${statusResult.hostname_id}`
    );

    console.log(`🗑️ Deleted custom hostname: ${domain}`);
    return { success: true };
  } catch (err) {
    console.error("❌ deleteCustomHostname Error:", err.response?.data || err.message);
    return { success: false, error: err.response?.data?.errors || [{ code: 0, message: err.message }] };
  }
}

/**
 * 🔍 Manual domain verification
 */
async function manualVerifyDomain(req, res) {
  try {
    const { tenantId } = req.params;

    const settings = await db.selectAll(
      "tbl_settings",
      "primary_domain_name, dns_verification_txt, email_id",
      "tenant_id = ?",
      [tenantId]
    );

    if (!settings || settings.length === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const domain = settings[0].primary_domain_name;
    const expectedTxt = settings[0].dns_verification_txt;
    const email = settings[0].email_id;

    console.log(
      `🔍 Manual verification for tenant ${tenantId}, domain: ${domain}`
    );

    const result = {
      domain,
      tenant_id: tenantId,
      checks: {},
      verified: false,
    };

    // Check Cloudflare API directly
    try {
      // Check CNAME in Cloudflare
      const cfCnameResponse = await cfApi.get(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        { params: { name: domain } }
      );

      result.checks.cloudflare_cname = {
        found: cfCnameResponse.data.result.length > 0,
        records: cfCnameResponse.data.result.map((r) => r.name),
      };

      // Check TXT in Cloudflare
      const txtName = `_igrowbig-verification.${domain}`;
      const cfTxtResponse = await cfApi.get(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        { params: { name: txtName } }
      );

      result.checks.cloudflare_txt = {
        found: cfTxtResponse.data.result.length > 0,
        matches: cfTxtResponse.data.result.some(
          (r) => r.content === expectedTxt
        ),
      };

      // Verify based on Cloudflare records
      if (
        result.checks.cloudflare_cname?.found ||
        result.checks.cloudflare_txt?.matches
      ) {
        result.verified = true;

        const now = new Date().toISOString().slice(0, 19).replace("T", " ");

        await db.update(
          "tbl_settings",
          { dns_status: "verified", updated_at: now },
          "tenant_id = ?",
          [tenantId]
        );

        await db.update("tbl_tenants", { domain }, "id = ?", [tenantId]);

        result.message = "✅ Domain verified successfully via Cloudflare API!";
        console.log(`✅ Manual verification successful for ${domain}`);
      } else {
        result.message = "❌ DNS records not found in Cloudflare.";
        console.log(`❌ Manual verification failed for ${domain}`);
      }
    } catch (err) {
      result.checks.error = err.message;
      result.message = "❌ Error checking Cloudflare API.";
      console.error(
        `❌ Cloudflare API error:`,
        err.response?.status,
        err.response?.data
      );
    }

    res.json(result);
  } catch (error) {
    console.error("Manual verification error:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * 🔍 Debug DNS records
 */
async function debugDNS(req, res) {
  try {
    const { subdomain } = req.params;
    const rootDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
    const fullDomain = `${subdomain}.${rootDomain}`;
    const txtDomain = `_igrowbig-verification.${fullDomain}`;

    const results = {
      domain: fullDomain,
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // Check Cloudflare API for CNAME records
    try {
      const cfResponse = await cfApi.get(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        {
          params: { name: fullDomain },
        }
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

    // Check TXT record in Cloudflare
    try {
      const cfTxtResponse = await cfApi.get(
        `/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
        {
          params: { name: txtDomain },
        }
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

    // Check DNS resolution for CNAME
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

    // Check DNS resolution for A records
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

    // Check TXT record
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

    // Summary
    results.summary = {
      cloudflare_setup: results.checks.cloudflare_cname?.found || false,
      dns_resolving:
        results.checks.dns_a?.found || results.checks.dns_cname?.found || false,
      txt_record_created: results.checks.cloudflare_txt?.found || false,
      txt_record_propagated: results.checks.dns_txt?.found || false,
      ready_for_verification:
        (results.checks.dns_a?.found || results.checks.dns_cname?.found) &&
        results.checks.dns_txt?.found,
    };

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  addSubdomain,
  cfRecordExists,
  deleteSubdomain,
  addVerificationTxtRecord,
  testConnection,
  debugDNS,
  manualVerifyDomain,
  addCustomHostnameWithSSL,
  getCustomHostnameStatus,
  waitForSSLActivation,
  deleteCustomHostname,
};