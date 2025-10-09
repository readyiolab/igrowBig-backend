const db = require("../config/db");

/**
 * Get tenant by domain (subdomain or custom domain)
 * No slug needed - domain-based only
 */
const Bydomain = async (req, res) => {
  try {
    // Get hostname from request headers
    let hostname = req.get("Host") || req.get("X-Forwarded-Host") || "";
    
    // Remove port if present (localhost:5173 → localhost)
    hostname = hostname.split(":")[0].toLowerCase();
    
    console.log("🔍 Bydomain called with hostname:", hostname);

    // ========== CHECK 1: Main Domain ==========
    const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
    if (hostname === baseDomain || hostname === `www.${baseDomain}` || hostname === "localhost") {
      console.log("❌ Main domain detected, no tenant lookup");
      return res.status(404).json({
        error: "MAIN_DOMAIN",
        message: "This is the main platform domain",
      });
    }

    let tenant = null;
    let settings = null;

    // ========== CHECK 2: Subdomain (pritibeauty.igrowbig.com) ==========
    if (hostname.endsWith(`.${baseDomain}`)) {
      const subdomain = hostname.replace(`.${baseDomain}`, "");
      console.log("🔍 Checking subdomain:", subdomain);

      // Query with FULL subdomain (e.g., pritibeauty.igrowbig.com)
      const fullSubdomain = `${subdomain}.${baseDomain}`;
      
      console.log("🔍 Looking for domain:", fullSubdomain);
      
      tenant = await db.selectAll("tbl_tenants", "*", "domain = ?", [fullSubdomain]);
      
      if (tenant.length > 0) {
        console.log("✅ Tenant found by subdomain:", {
          id: tenant[0].id,
          domain: tenant[0].domain,
          template_id: tenant[0].template_id
        });
        
        // Get settings for this tenant
        settings = await db.selectAll("tbl_settings", "*", "tenant_id = ?", [tenant[0].id]);
      } else {
        console.log("❌ No tenant found for subdomain:", fullSubdomain);
      }
    }

    // ========== CHECK 3: Custom Domain (mycustomstore.com) ==========
    if (!tenant || tenant.length === 0) {
      console.log("🔍 Checking custom domain:", hostname);
      
      settings = await db.selectAll(
        "tbl_settings",
        "*",
        "primary_domain_name = ? AND dns_status = ?",
        [hostname, "verified"]
      );

      if (settings.length > 0) {
        console.log("✅ Settings found for custom domain");
        
        tenant = await db.selectAll("tbl_tenants", "*", "id = ?", [settings[0].tenant_id]);
        
        if (tenant.length > 0) {
          console.log("✅ Tenant found by custom domain:", tenant[0].id);
        }
      }
    }

    // ========== CHECK 4: Not Found ==========
    if (!tenant || tenant.length === 0) {
      console.log("❌ No tenant found for hostname:", hostname);
      return res.status(404).json({
        error: "TENANT_NOT_FOUND",
        message: "No store found for this domain",
        hostname: hostname,
        debug: {
          checked_subdomain: hostname.endsWith(`.${baseDomain}`),
          checked_custom_domain: true
        }
      });
    }

    // ========== SUCCESS: Return Tenant Data ==========
    const tenantData = tenant[0];
    const settingsData = settings && settings.length > 0 ? settings[0] : null;

    console.log("✅ Returning tenant data:", {
      id: tenantData.id,
      store_name: tenantData.store_name,
      template_id: tenantData.template_id,
      domain: tenantData.domain
    });

    res.status(200).json({
      tenant: {
        id: tenantData.id,
        template_id: parseInt(tenantData.template_id) || 1,
        domain: tenantData.domain,
        custom_domain: tenantData.custom_domain || null,
        custom_domain_status: tenantData.custom_domain_status || "pending",
        store_name: tenantData.store_name,
        user_id: tenantData.user_id,
      },
      settings: settingsData || {},
    });
  } catch (error) {
    console.error("❌ Bydomain Error:", error.stack);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: error.message 
    });
  }
};

/**
 * Get full tenant site data (all content)
 */
const getTenantSiteData = async (req, res) => {
  try {
    let hostname = req.get("Host") || req.get("X-Forwarded-Host") || "";
    hostname = hostname.split(":")[0].toLowerCase();
    
    console.log("🔍 getTenantSiteData called with hostname:", hostname);

    const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
    
    // Check if main domain
    if (hostname === baseDomain || hostname === `www.${baseDomain}` || hostname === "localhost") {
      return res.status(404).json({
        error: "MAIN_DOMAIN",
        message: "This is the main platform domain",
      });
    }

    let tenant = null;

    // Check subdomain
    if (hostname.endsWith(`.${baseDomain}`)) {
      const subdomain = hostname.replace(`.${baseDomain}`, "");
      const fullSubdomain = `${subdomain}.${baseDomain}`;
      
      tenant = await db.selectAll("tbl_tenants", "*", "domain = ?", [fullSubdomain]);
    }

    // Check custom domain
    if (!tenant || tenant.length === 0) {
      const settings = await db.selectAll(
        "tbl_settings",
        "*",
        "primary_domain_name = ? AND dns_status = ?",
        [hostname, "verified"]
      );

      if (settings.length > 0) {
        tenant = await db.selectAll("tbl_tenants", "*", "id = ?", [settings[0].tenant_id]);
      }
    }

    if (!tenant || tenant.length === 0) {
      console.log("❌ No tenant found for hostname:", hostname);
      return res.status(404).json({
        error: "TENANT_NOT_FOUND",
        message: "No store found for this domain",
      });
    }

    const tenantData = tenant[0];
    const tenantId = tenantData.id;

    console.log("✅ Fetching site data for tenant:", tenantId);

    // Fetch all site data
    const [homePage] = await db.selectAll("tbl_home_pages", "*", "tenant_id = ?", [tenantId]);
    const categories = await db.selectAll("tbl_categories", "*", "tenant_id = ?", [tenantId]);
    const products = await db.selectAll("tbl_products", "*", "tenant_id = ?", [tenantId]);
    const [productpage] = await db.selectAll("tbl_product_page", "*", "tenant_id = ?", [tenantId]);
    const [opportunityPage] = await db.selectAll("tbl_opportunity_page", "*", "tenant_id = ?", [tenantId]);
    const [joinUsPage] = await db.selectAll("tbl_joinus_page", "*", "tenant_id = ?", [tenantId]);
    const [contactUs] = await db.selectAll("tbl_contactus_page", "*", "tenant_id = ?", [tenantId]);
    const blogs = await db.selectAll("tbl_blogs", "*", "tenant_id = ?", [tenantId]);
    const blogBanners = await db.selectAll("tbl_blog_page_banners", "*", "tenant_id = ?", [tenantId]);
    const footerDisclaimers = await db.selectAll("tbl_footer_disclaimers", "*", "tenant_id = ?", [tenantId]);
    const footerSocialLinks = await db.selectAll("tbl_footer_social_links", "*", "tenant_id = ?", [tenantId]);
    const sliderBanners = await db.selectAll("tbl_slider_banners", "*", "tenant_id = ?", [tenantId]);
    const [tenantSetting] = await db.selectAll("tbl_settings", "*", "tenant_id = ?", [tenantId]);

    res.status(200).json({
      tenant: {
        tenant_id: tenantData.id,
        store_name: tenantData.store_name,
        template_id: parseInt(tenantData.template_id) || 1,
        domain: tenantData.domain,
        custom_domain: tenantData.custom_domain,
      },
      site_data: {
        home: homePage || {},
        categories: categories || [],
        products: products || [],
        product_page: productpage || {},
        opportunity: opportunityPage || {},
        join_us: joinUsPage || {},
        contact: contactUs || {},
        blog: blogs || [],
        blog_banners: blogBanners || [],
        footer_disclaimers: footerDisclaimers || [],
        footer_social_links: footerSocialLinks || [],
        slider_banners: sliderBanners || [],
        tenant_setting: tenantSetting || {},
      },
    });
  } catch (error) {
    console.error("❌ getTenantSiteData Error:", error.stack);
    res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: error.message 
    });
  }
};

module.exports = {
  Bydomain,
  getTenantSiteData,
};