const db = require("../config/db");

async function tenantResolver(req, res, next) {
  try {
    const hostname = req.get("host");
    const path = req.path;
    let tenant;

    // Check for custom domain
    const customDomain = await db.selectAll(
      "tbl_tenants",
      "*",
      "custom_domain = ? AND custom_domain_status = 'verified'",
      [hostname]
    );
    if (customDomain.length > 0) {
      req.tenant = customDomain[0];
      return next();
    }

    // Check for slug-based URL
    const slugMatch = path.match(/^\/([^\/]+)/);
    const slug = slugMatch ? slugMatch[1] : null;
    if (slug && hostname.includes(process.env.BASE_DOMAIN || "igrowbig.com")) {
      const tenantData = await db.selectAll("tbl_tenants", "*", "slug = ?", [slug]);
      if (tenantData.length > 0) {
        req.tenant = tenantData[0];
        // Redirect to custom domain if verified
        if (
          tenantData[0].custom_domain &&
          tenantData[0].custom_domain_status === "verified"
        ) {
          const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
          const redirectUrl = `${protocol}://${tenantData[0].custom_domain}${req.originalUrl.replace(`/${slug}`, "")}`;
          return res.redirect(301, redirectUrl);
        }
        return next();
      }
    }

    // Main site or error
    if (hostname.includes(process.env.BASE_DOMAIN || "igrowbig.com") && !slug) {
      req.tenant = null;
      return next();
    }

    res.status(404).json({ error: "TENANT_NOT_FOUND", message: "Tenant not found" });
  } catch (error) {
    console.error("TenantResolver Error:", error.stack);
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
}

module.exports = tenantResolver;