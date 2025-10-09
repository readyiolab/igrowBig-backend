const db = require("../config/db");

const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";

async function domainRouting(req, res, next) {
  const hostname = req.hostname.toLowerCase();
  
  try {
    // Extract subdomain from hostname if it's a subdomain of baseDomain
    const isSubdomain = hostname.endsWith(`.${baseDomain}`);
    const subdomain = isSubdomain ? hostname.replace(`.${baseDomain}`, '') : null;
    
    // Query tenant by both subdomain and custom domain
    let tenant;
    if (isSubdomain && subdomain) {
      // Priority 1: Check subdomain match
      tenant = await db.selectAll("tbl_tenants", "*", "domain = ?", [`${subdomain}.${baseDomain}`]);
    } else {
      // Priority 2: Check custom domain match (handle both apex and www)
      const customDomainQuery = hostname.startsWith('www.') 
        ? hostname.substring(4) 
        : hostname;
      
      tenant = await db.selectAll(
        "tbl_tenants", 
        "*", 
        "custom_domain = ? OR custom_domain = ?", 
        [hostname, customDomainQuery]
      );
    }
    
    // If no tenant found, return 404
    if (!tenant || tenant.length === 0) {
      return res.status(404).json({ 
        error: "STORE_NOT_FOUND", 
        message: "The requested store does not exist" 
      });
    }
    
    const tenantData = tenant[0];
    
    // Get settings to check DNS status
    const settings = await db.selectAll("tbl_settings", "*", "tenant_id = ?", [tenantData.id]);
    const settingsData = settings.length > 0 ? settings[0] : null;
    
    // Case 1: Accessing via subdomain - always allow
    if (isSubdomain && hostname === tenantData.domain) {
      req.tenant = tenantData;
      req.settings = settingsData;
      return next();
    }
    
    // Case 2: Accessing via custom domain
    if (tenantData.custom_domain) {
      const isCustomDomain = 
        hostname === tenantData.custom_domain || 
        hostname === `www.${tenantData.custom_domain}`;
      
      if (isCustomDomain) {
        // Check if custom domain is verified
        if (settingsData?.dns_status === "verified" && tenantData.custom_domain_status === "verified") {
          req.tenant = tenantData;
          req.settings = settingsData;
          return next();
        } else {
          // Custom domain not verified - redirect to subdomain
          console.log(`⚠️ Custom domain ${hostname} not verified. Redirecting to subdomain.`);
          return res.redirect(301, `https://${tenantData.domain}`);
        }
      }
    }
    
    // Case 3: Accessing wrong domain - redirect to primary domain
    const primaryDomain = 
      tenantData.custom_domain && 
      settingsData?.dns_status === "verified" && 
      tenantData.custom_domain_status === "verified"
        ? tenantData.custom_domain
        : tenantData.domain;
    
    console.log(`⚠️ Wrong domain access: ${hostname}. Redirecting to ${primaryDomain}`);
    return res.redirect(301, `https://${primaryDomain}`);
    
  } catch (error) {
    console.error("❌ Domain routing error:", error);
    return res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Failed to process domain routing" 
    });
  }
}

module.exports = domainRouting;