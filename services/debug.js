// Add this to your adminRoutes.js or create a new debug route

const dns = require("dns").promises;
const axios = require("axios");
const db = require("../config/db");

/**
 * Manual verification trigger endpoint
 * POST /api/admin/verify-domain/:tenantId
 */
async function manualVerifyDomain(req, res) {
  try {
    const { tenantId } = req.params;
    
    // Get tenant domain from settings
    const settings = await db.selectAll(
      "tbl_settings",
      "primary_domain_name, dns_verification_txt",
      "tenant_id = ?",
      [tenantId]
    );

    if (!settings || settings.length === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const domain = settings[0].primary_domain_name;
    const expectedTxt = settings[0].dns_verification_txt;
    const rootDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";

    console.log(`🔍 Manual verification for tenant ${tenantId}, domain: ${domain}`);

    const result = {
      domain,
      tenant_id: tenantId,
      checks: {},
      verified: false,
    };

    // Check TXT record
    try {
      const txtName = `_igrowbig-verification.${domain}`;
      const txtRecords = await dns.resolveTxt(txtName);
      const flattened = txtRecords.flat().map(String);
      result.checks.txt = {
        found: true,
        records: flattened,
        matches: flattened.some((r) => r === expectedTxt || r.includes(expectedTxt)),
      };
    } catch (err) {
      result.checks.txt = {
        found: false,
        error: err.code || err.message,
      };
    }

    // Check DNS resolution
    try {
      const aRecords = await dns.resolve4(domain);
      result.checks.dns = {
        found: true,
        records: aRecords,
        type: "A",
      };
    } catch (aErr) {
      try {
        const cnameRecords = await dns.resolveCname(domain);
        result.checks.dns = {
          found: true,
          records: cnameRecords,
          type: "CNAME",
        };
      } catch (cnameErr) {
        result.checks.dns = {
          found: false,
          error: cnameErr.code || cnameErr.message,
        };
      }
    }

    // Determine if verified
    if (result.checks.txt?.matches || result.checks.dns?.found) {
      result.verified = true;

      // Update database
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await db.update(
        "tbl_settings",
        { dns_status: "verified", updated_at: now },
        "tenant_id = ?",
        [tenantId]
      );

      await db.update("tbl_tenants", { domain }, "id = ?", [tenantId]);

      result.message = "✅ Domain verified successfully!";
      console.log(`✅ Manual verification successful for ${domain}`);
    } else {
      result.message = "❌ Domain not verified yet. DNS may still be propagating.";
      console.log(`❌ Manual verification failed for ${domain}`);
    }

    res.json(result);
  } catch (error) {
    console.error("Manual verification error:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Debug endpoint to check DNS records for a subdomain
 * GET /api/admin/debug-dns/:subdomain
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

    // 1. Check Cloudflare API for records
    try {
      const cfResponse = await axios.get(
        `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`,
        {
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          params: {
            name: fullDomain,
          },
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
      const cfTxtResponse = await axios.get(
        `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/dns_records`,
        {
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          params: {
            name: txtDomain,
          },
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

    // 2. Check DNS resolution for CNAME
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

    // 3. Check DNS resolution for A records (Cloudflare proxy)
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

    // 4. Check TXT record
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

    // 5. Summary
    results.summary = {
      cloudflare_setup: results.checks.cloudflare_cname?.found || false,
      dns_resolving: results.checks.dns_a?.found || results.checks.dns_cname?.found || false,
      txt_record_created: results.checks.cloudflare_txt?.found || false,
      txt_record_propagated: results.checks.dns_txt?.found || false,
      ready_for_verification: (results.checks.dns_a?.found || results.checks.dns_cname?.found) && results.checks.dns_txt?.found,
    };

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = { debugDNS, manualVerifyDomain };

// In your adminRoutes.js, add:
// router.get('/debug-dns/:subdomain', debugDNS);
// router.post('/verify-domain/:tenantId', manualVerifyDomain);