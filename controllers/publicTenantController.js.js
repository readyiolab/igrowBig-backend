const db = require("../config/db");

/**
 * ✅ PRIMARY: Get tenant by ANY domain (subdomain or custom domain)
 * Checks: tbl_tenants.domain, tbl_tenants.custom_domain, tbl_settings.primary_domain_name
 */
async function Bydomain(req, res) {
  try {
    // Get the requesting hostname - prioritize X-Tenant-Domain header for cross-domain API calls
    let hostname = req.get("X-Tenant-Domain")?.toLowerCase() || 
                   req.get("host")?.toLowerCase() || 
                   req.get("x-forwarded-host")?.toLowerCase();
    
    if (!hostname) {
      return res.status(400).json({
        error: "MISSING_HOSTNAME",
        message: "Could not determine hostname from request",
      });
    }

    console.log(`🔍 [Bydomain] Incoming request for hostname: ${hostname}`);
    console.log(`🔍 [Bydomain] X-Tenant-Domain header: ${req.get("X-Tenant-Domain") || "not set"}`);
    console.log(`🔍 [Bydomain] Host header: ${req.get("host") || "not set"}`);

    const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
    
    // Remove port if present (for localhost:3000)
    const cleanHostname = hostname.split(':')[0];

    // ========== CHECK 1: Main Domain (Landing Page) ==========
    // Only reject if it's actually the main domain AND no X-Tenant-Domain header
    const isMainDomain = [
      baseDomain,
      `www.${baseDomain}`,
      "localhost"
    ].includes(cleanHostname);

    if (isMainDomain && !req.get("X-Tenant-Domain")) {
      return res.status(400).json({
        error: "MAIN_DOMAIN",
        message: "This is the main domain, not a tenant site",
      });
    }

    let tenant = null;
    let matchType = null;

    // ========== CHECK 2: Subdomain (e.g., poojastore.igrowbig.com) ==========
    if (cleanHostname.endsWith(`.${baseDomain}`)) {
      const subdomain = cleanHostname.replace(`.${baseDomain}`, "");
      console.log(`🔍 [Bydomain] Checking subdomain: ${subdomain}`);

      const subdomainTenant = await db.selectAll(
        "tbl_tenants",
        "*",
        "domain = ?",
        [`${subdomain}.${baseDomain}`]
      );

      if (subdomainTenant && subdomainTenant.length > 0) {
        tenant = subdomainTenant[0];
        matchType = "subdomain";
        console.log(`✅ [Bydomain] Found tenant by subdomain: ${tenant.id}`);
      }
    }

    // ========== CHECK 3: Custom Domain from tbl_tenants (e.g., readyio.com) ==========
    if (!tenant) {
      console.log(`🔍 [Bydomain] Checking custom domain in tbl_tenants: ${cleanHostname}`);

      const customDomainTenant = await db.selectAll(
        "tbl_tenants",
        "*",
        "custom_domain = ? AND custom_domain_status = 'verified'",
        [cleanHostname]
      );

      if (customDomainTenant && customDomainTenant.length > 0) {
        tenant = customDomainTenant[0];
        matchType = "custom_domain";
        console.log(`✅ [Bydomain] Found tenant by custom_domain: ${tenant.id}`);
      }
    }

    // ========== CHECK 4: Custom Domain from tbl_settings (fallback) ==========
    if (!tenant) {
      console.log(`🔍 [Bydomain] Checking custom domain in tbl_settings: ${cleanHostname}`);

      const customDomainSettings = await db.query(
        `SELECT s.*, t.* 
         FROM tbl_settings s
         INNER JOIN tbl_tenants t ON s.tenant_id = t.id
         WHERE s.primary_domain_name = ? 
         AND s.dns_status = 'verified'`,
        [cleanHostname]
      );

      if (customDomainSettings && customDomainSettings.length > 0) {
        tenant = customDomainSettings[0];
        matchType = "custom_domain_settings";
        console.log(`✅ [Bydomain] Found tenant via tbl_settings: ${tenant.id}`);
      }
    }

    // ========== NOT FOUND ==========
    if (!tenant) {
      console.log(`❌ [Bydomain] No tenant found for hostname: ${cleanHostname}`);
      return res.status(404).json({
        error: "TENANT_NOT_FOUND",
        message: "No store found for this domain",
        hostname: cleanHostname,
        suggestion: "Please verify your domain is configured correctly",
      });
    }

    // ========== SUCCESS: Return Tenant Data ==========
    console.log(`✅ [Bydomain] Returning tenant data for: ${cleanHostname} (${matchType})`);

    return res.json({
      success: true,
      matchType,
      hostname: cleanHostname,
      tenant: {
        id: tenant.id,
        name: tenant.store_name || tenant.site_name,
        email: tenant.email,
        domain: tenant.domain,
        template_id: tenant.template_id,
        subdomain: tenant.domain,
        custom_domain: tenant.custom_domain || cleanHostname,
        custom_domain_status: tenant.custom_domain_status,
      },
    });
  } catch (error) {
    console.error("❌ [Bydomain] Error:", error);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to fetch tenant data",
      details: error.message,
    });
  }
}

/**
 * ✅ SECONDARY: Get full site data (for frontend rendering)
 */
async function getTenantSiteData(req, res) {
  try {
    const hostname = req.get("X-Tenant-Domain")?.toLowerCase() ||
                     req.get("host")?.toLowerCase() ||
                     req.get("x-forwarded-host")?.toLowerCase();

    if (!hostname) return res.status(400).json({ error: "Missing hostname" });

    const cleanHostname = hostname.split(':')[0];
    const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
    let tenantId = null;

    // ===== Determine tenantId =====
    if (cleanHostname.endsWith(`.${baseDomain}`)) {
      const subdomain = cleanHostname.replace(`.${baseDomain}`, "");
      const tenant = await db.selectAll("tbl_tenants", "id", "domain = ?", [`${subdomain}.${baseDomain}`]);
      if (tenant?.length) tenantId = tenant[0].id;
    }

    if (!tenantId) {
      const customTenant = await db.selectAll(
        "tbl_tenants",
        "id",
        "custom_domain = ? AND custom_domain_status = 'verified'",
        [cleanHostname]
      );
      if (customTenant?.length) tenantId = customTenant[0].id;
    }

    if (!tenantId) {
      const settings = await db.selectAll(
        "tbl_settings",
        "tenant_id",
        "primary_domain_name = ? AND dns_status = 'verified'",
        [cleanHostname]
      );
      if (settings?.length) tenantId = settings[0].tenant_id;
    }

    if (!tenantId) return res.status(404).json({ error: "Tenant not found" });

    // ===== Fetch all main site data in parallel =====
    const [
      tenant,
      settings,
      sliders,
      products,
      categories,
      blogs,
      homePage,
      aboutProductPage,
      productPage,
      joinUsPage,
      opportunityPage,
      socialLinks
    ] = await Promise.all([
      db.selectAll("tbl_tenants", "*", "id = ?", [tenantId]),
      db.selectAll("tbl_settings", "*", "tenant_id = ?", [tenantId]),
      db.selectAll("tbl_slider_banners", "*", "tenant_id = ?", [tenantId]),
      db.selectAll("tbl_products", "*", "tenant_id = ? AND status = 'active'", [tenantId]),
      db.selectAll("tbl_categories", "*", "tenant_id = ? AND status = 'active'", [tenantId]),
      db.selectAll("tbl_blogs", "*", "tenant_id = ? AND is_visible = 1", [tenantId]),
      db.select("tbl_home_pages", "*", `tenant_id = ${tenantId}`),
      db.select("tbl_about_product_pages", "*", `tenant_id = ${tenantId}`),
      db.select("tbl_product_page", "*", `tenant_id = ${tenantId}`),
      db.select("tbl_joinus_page", "*", `tenant_id = ${tenantId}`),
      db.select("tbl_opportunity_page", "*", `tenant_id = ${tenantId}`),
      db.selectAll("tbl_footer_social_links", "*", "tenant_id = ?", [tenantId]),
      db.selectAll("tbl_footer_disclaimers", "*", "tenant_id = ?", [tenantId]),
    ]);

    // ===== Fetch blog banners in parallel =====
    const blogBannerPromises = blogs.map(blog =>
      db.selectAll(
        "tbl_blog_page_banners",
        "*",
        `blog_id = ${blog.id} AND tenant_id = ${tenantId}`
      ).then(banners => {
        blog.banners = banners;
      })
    );

    await Promise.all(blogBannerPromises);

    // ===== Return full tenant site data =====
    return res.json({
      success: true,
      tenant: tenant[0],
      settings: settings[0],
      sliders,
      products,
      categories,
      blogs,
      homePage: homePage || {},
      aboutProductPage: aboutProductPage || {},
      productPage: productPage || {},
      joinUsPage: joinUsPage || {},
      opportunityPage: opportunityPage || {},
      socialLinks: socialLinks[0] || {},
    });

  } catch (error) {
    console.error("❌ [getTenantSiteData] Error:", error);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  Bydomain,
  getTenantSiteData,
};