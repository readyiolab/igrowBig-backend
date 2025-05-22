// // controllers/publicTenantController.js
// const db = require("../config/db");
// const getTenantBySlugInternal = async (slug) => {
//   console.log("getTenantBySlugInternal called with slug:", slug);
//   try {
//     const tenant = await db.select("tbl_tenants", "*", "slug = ?", [slug]);
//     console.log("Raw db.select result for tbl_tenants:", tenant);
//     if (!tenant) {
//       console.log("No tenant found for slug:", slug);
//       throw new Error("TENANT_NOT_FOUND");
//     }
//     console.log("Returning tenant:", tenant);
//     return tenant;
//   } catch (error) {
//     console.error("Error in getTenantBySlugInternal:", error);
//     throw error;
//   }
// };

// const getTenantByDomainInternal = async (host) => {
//   console.log("getTenantByDomainInternal called with host:", host);
//   try {
//     let tenant = null;

//     // Normalize host (remove www and port numbers for consistency)
//     const normalizedHost = host.replace(/^www\./, "").split(":")[0];

//     if (normalizedHost === "begrat.com" || normalizedHost === "stage.begrat.com" || normalizedHost.includes("localhost")) {
//       // Main domain or localhost: rely on slug-based lookup
//       return null;
//     }

//     // Check if it's a subdomain (e.g., pooja.begrat.com)
//     if (normalizedHost.endsWith(".begrat.com")) {
//       const subdomain = normalizedHost.split(".")[0];
//       tenant = await db.select("tbl_tenants", "*", "domain = ?", [`${subdomain}.begrat.com`]);
//     } else {
//       // Check for custom domain in tbl_settings
//       const settings = await db.select(
//         "tbl_settings",
//         "*",
//         "primary_domain_name = ? AND dns_status = ?",
//         [normalizedHost, "verified"]
//       );
//       if (settings) {
//         tenant = await db.select("tbl_tenants", "*", "id = ?", [settings.tenant_id]);
//       }
//     }

//     console.log("Raw db.select result for tbl_tenants by domain:", tenant);
//     if (!tenant) {
//       console.log("No tenant found for host:", host);
//       throw new Error("TENANT_NOT_FOUND");
//     }
//     console.log("Returning tenant:", tenant);
//     return tenant;
//   } catch (error) {
//     console.error("Error in getTenantByDomainInternal:", error);
//     throw error;
//   }
// };

// const getTenantSiteData = async (req, res) => {
//   try {
//     const { slug } = req.params;
//     const host = req.headers.host || "";
//     console.log("getTenantSiteData called with slug:", slug, "and host:", host);

//     let tenant = null;

//     // Try slug first
//     if (slug) {
//       try {
//         tenant = await getTenantBySlugInternal(slug);
//       } catch (error) {
//         if (error.message !== "TENANT_NOT_FOUND") {
//           throw error;
//         }
//       }
//     }

//     // If no tenant found by slug, try domain
//     if (!tenant) {
//       tenant = await getTenantByDomainInternal(host);
//     }

//     if (!tenant || !tenant.id) {
//       console.log("Invalid tenant data:", tenant);
//       throw new Error("TENANT_NOT_FOUND");
//     }

//     const tenantId = tenant.id;
//     console.log("Using tenantId:", tenantId);

//     // Fetch data from all required tables
//     const homePage = await db.select("tbl_home_pages", "*", "tenant_id = ?", [tenantId]);
//     const categories = await db.selectAll("tbl_categories", "*", "tenant_id = ?", [tenantId]);
//     const products = await db.selectAll("tbl_products", "*", "tenant_id = ?", [tenantId]);
//     const productPage = await db.select("tbl_product_page", "*", "tenant_id = ?", [tenantId]);
//     const opportunityPage = await db.select("tbl_opportunity_page", "*", "tenant_id = ?", [tenantId]);
//     const joinUsPage = await db.select("tbl_joinus_page", "*", "tenant_id = ?", [tenantId]);
//     const contactUs = await db.select("tbl_contactus_page", "*", "tenant_id = ?", [tenantId]);
//     const blogs = await db.selectAll("tbl_blogs", "*", "tenant_id = ?", [tenantId]);
//     const blogBanners = await db.selectAll("tbl_blog_page_banners", "*", "tenant_id = ?", [tenantId]);
//     const footerDisclaimers = await db.selectAll("tbl_footer_disclaimers", "*", "tenant_id = ?", [tenantId]);
//     const footerSocialLinks = await db.selectAll("tbl_footer_social_links", "*", "tenant_id = ?", [tenantId]);
//     const sliderBanners = await db.selectAll("tbl_slider_banners", "*", "tenant_id = ?", [tenantId]);
//     const tenantSetting = await db.selectAll("tbl_settings", "*","tenant_id = ?", [tenantId])

//     res.json({
//       tenant: {
//         tenant_id: tenant.id,
//         store_name: tenant.store_name,
//         template_id: tenant.template_id,
//         slug: tenant.slug,
//         site_title: tenant.site_title,
//         domain: tenant.domain,
//       },
//       site_data: {
//         home: homePage || {},
//         categories: categories || [],
//         products: products || [],
//         product_page: productPage || {},
//         opportunity: opportunityPage || {},
//         join_us: joinUsPage || {},
//         contact: contactUs || {},
//         blog: blogs || [],
//         blog_banners: blogBanners || [],
//         footer_disclaimers: footerDisclaimers || [],
//         footer_social_links: footerSocialLinks || [],
//         slider_banners: sliderBanners || [],
//         tenant_Setting : tenantSetting || []
//       },
//     });
//   } catch (error) {
//     console.error("Error in getTenantSiteData:", error);
//     if (error.message === "TENANT_NOT_FOUND") {
//       return res.status(404).json({ error: "TENANT_NOT_FOUND" });
//     }
//     res.status(500).json({ error: "SERVER_ERROR", message: error.message });
//   }
// };

const db = require("../config/db");

const getTenantBySlugInternal = async (slug) => {
  console.log("getTenantBySlugInternal called with slug:", slug);
  try {
    const tenant = await db.select("tbl_tenants", "*", "slug = ?", [slug]);
    console.log("Raw db.select result for tbl_tenants:", tenant);
    if (!tenant || tenant.length === 0) {
      console.log("No tenant found for slug:", slug);
      throw new Error("TENANT_NOT_FOUND");
    }
    console.log("Returning tenant:", tenant);
    return tenant;
  } catch (error) {
    console.error("Error in getTenantBySlugInternal:", error);
    throw error;
  }
};

const getTenantByDomainInternal = async (host) => {
  console.log("getTenantByDomainInternal called with host:", host);
  try {
    let tenant = null;
    const normalizedHost = host.replace(/^www\./, "").split(":")[0];
    console.log("Normalized host:", normalizedHost);

    // Allow tenant lookup for localhost in development
    if (process.env.NODE_ENV === "development" && normalizedHost.includes("localhost")) {
      // Option 1: Hardcode a tenant for testing
      tenant = await db.select("tbl_tenants", "*", "slug = ?", ["by-domain"]);
      // Option 2: Allow domain-based lookup for localhost
      // tenant = await db.select("tbl_tenants", "*", "domain = ?", [host]);
    } else if (
      normalizedHost === "igrowbig.com" 
      
    ) {
      console.log("Main domain, returning null");
      return null;
    }

    if (!tenant && normalizedHost.endsWith(".igrowbig.com")) {
      const subdomain = normalizedHost.split(".")[0];
      tenant = await db.select("tbl_tenants", "*", "domain = ?", [
        `${subdomain}.igrowbig.com`,
      ]);
    } else if (!tenant) {
      const settings = await db.select(
        "tbl_settings",
        "*",
        "primary_domain_name = ? AND dns_status = ?",
        [normalizedHost, "verified"]
      );
      if (settings && settings.tenant_id) {
        tenant = await db.select("tbl_tenants", "*", "id = ?", [
          settings.tenant_id,
        ]);
      }
    }

    console.log("Raw db.select result for tbl_tenants by domain:", tenant);
    if (!tenant) {
      console.log("No tenant found for host:", host);
      throw new Error("TENANT_NOT_FOUND");
    }
    console.log("Returning tenant:", tenant);
    return tenant;
  } catch (error) {
    console.error("Error in getTenantByDomainInternal:", error);
    throw error;
  }
};

const getTenantSiteData = async (req, res) => {
  try {
    const { slug } = req.params || {};
    const host = req.headers.host || "";
    console.log("getTenantSiteData called with slug:", slug, "and host:", host);

    let tenant = null;

    if (slug) {
      try {
        tenant = await getTenantBySlugInternal(slug);
      } catch (error) {
        if (error.message !== "TENANT_NOT_FOUND") {
          throw error;
        }
      }
    }

    if (!tenant) {
      try {
        tenant = await getTenantByDomainInternal(host);
      } catch (error) {
        if (error.message === "TENANT_NOT_FOUND") {
          return res.redirect("http://igrowbig.com");
        }
        throw error;
      }
    }

    if (!tenant || !tenant.id) {
      console.log("Invalid tenant data:", tenant);
      throw new Error("TENANT_NOT_FOUND");
    }

    const tenantId = tenant.id;
    console.log("Using tenantId:", tenantId);

    const homePage = await db.select("tbl_home_pages", "*", "tenant_id = ?", [
      tenantId,
    ]);
    const categories = await db.selectAll(
      "tbl_categories",
      "*",
      "tenant_id = ?",
      [tenantId]
    );
    const products = await db.selectAll("tbl_products", "*", "tenant_id = ?", [
      tenantId,
    ]);
    const productpage = await db.select("tbl_product_page", "*", "tenant_id = ?", [
      tenantId,
    ]);
    const opportunityPage = await db.select(
      "tbl_opportunity_page",
      "*",
      "tenant_id = ?",
      [tenantId]
    );
    const joinUsPage = await db.select("tbl_joinus_page", "*", "tenant_id = ?", [
      tenantId,
    ]);
    const contactUs = await db.select("tbl_contactus_page", "*", "tenant_id = ?", [
      tenantId,
    ]);
    const blogs = await db.selectAll("tbl_blogs", "*", "tenant_id = ?", [
      tenantId,
    ]);
    const blogBanners = await db.selectAll(
      "tbl_blog_page_banners",
      "*",
      "tenant_id = ?",
      [tenantId]
    );
    const footerDisclaimers = await db.selectAll(
      "tbl_footer_disclaimers",
      "*",
      "tenant_id = ?",
      [tenantId]
    );
    const footerSocialLinks = await db.selectAll(
      "tbl_footer_social_links",
      "*",
      "tenant_id = ?",
      [tenantId]
    );
    const sliderBanners = await db.selectAll(
      "tbl_slider_banners",
      "*",
      "tenant_id = ?",
      [tenantId]
    );
    const tenantSetting = await db.selectAll(
      "tbl_settings",
      "*",
      "tenant_id = ?",
      [tenantId]
    );

    res.json({
      tenant: {
        tenant_id: tenant.id,
        store_name: tenant.store_name,
        template_id: tenant.template_id || 1,
        slug: tenant.slug,
        site_title: tenant.site_title,
        domain: tenant.domain,
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
        tenant_Setting: tenantSetting || [],
      },
    });
  } catch (error) {
    console.error("Error in getTenantSiteData:", error);
    if (error.message === "TENANT_NOT_FOUND") {
      return res.redirect("http://begrat.com");
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

const Bydomain = async (req, res) => {
  try {
    const hostname = req.get("Host");
    console.log("Fetching tenant for domain:", hostname);

    const settings = await db.selectAll(
      "tbl_settings",
      "*",
      "primary_domain_name = ? AND dns_status = ?",
      [hostname, "verified"]
    );

    if (settings.length === 0) {
      return res.status(404).json({
        error: "TENANT_NOT_FOUND",
        message: "No tenant found for this domain",
      });
    }

    const tenant = await db.selectAll(
      "tbl_tenants",
      "*",
      "id = ?",
      [settings[0].tenant_id]
    );

    if (tenant.length === 0) {
      return res.status(404).json({
        error: "TENANT_NOT_FOUND",
        message: "Tenant record not found",
      });
    }

    res.status(200).json({
      tenant: {
        id: tenant[0].id,
        slug: tenant[0].slug,
        template_id: tenant[0].template_id,
        domain: tenant[0].domain,
        store_name: tenant[0].store_name,
      },
      settings: settings[0],
    });
  } catch (error) {
    console.error("SiteByDomain Error:", error.stack);
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};




// Get product page by slug
const getProductPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const [productPage] = await db.select(
      "tbl_product_page",
      "*",
      "tenant_id = ?",
      [tenant.id]
    );
    res.json({
      template_id: tenant.template_id,
      product_page: productPage || {},
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get opportunity page by slug
const getOpportunityPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const [opportunityPage] = await db.select(
      "tbl_opportunity_page",
      "*",
      "tenant_id = ?",
      [tenant.id]
    );
    res.json({
      template_id: tenant.template_id,
      opportunity: opportunityPage || {},
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get join-us page by slug
const getJoinUsPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const [joinUsPage] = await db.select(
      "tbl_joinus_page",
      "*",
      "tenant_id = ?",
      [tenant.id]
    );
    res.json({
      template_id: tenant.template_id,
      join_us: joinUsPage || {},
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get contact-us page by slug
const getAllContactUsBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const [contactUs] = await db.select("tbl_contactus", "*", "tenant_id = ?", [
      tenant.id,
    ]);
    res.json({
      template_id: tenant.template_id,
      contact: contactUs || {},
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get products by slug
const getProductsBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const products = await db.select("tbl_products", "*", "tenant_id = ?", [
      tenant.id,
    ]);
    res.json({
      template_id: tenant.template_id,
      products: products || [],
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get categories by slug
const getCategoriesBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const categories = await db.select("tbl_categories", "*", "tenant_id = ?", [
      tenant.id,
    ]);
    res.json({
      template_id: tenant.template_id,
      categories: categories || [],
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get blogs by slug
const getBlogsBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const blogs = await db.select("tbl_blogs", "*", "tenant_id = ?", [
      tenant.id,
    ]);
    res.json({
      template_id: tenant.template_id,
      blog: blogs || [],
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get footer social links by slug
const getSocialLinksBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const socialLinks = await db.select(
      "tbl_social_links",
      "*",
      "tenant_id = ?",
      [tenant.id]
    );
    res.json({
      template_id: tenant.template_id,
      social_links: socialLinks || [],
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get footer disclaimers by slug
const getDisclaimersBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const disclaimers = await db.select(
      "tbl_disclaimers",
      "*",
      "tenant_id = ?",
      [tenant.id]
    );
    res.json({
      template_id: tenant.template_id,
      disclaimers: disclaimers || [],
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get about product page by slug
const getAboutProductPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const [aboutProductPage] = await db.select(
      "tbl_about_product_page",
      "*",
      "tenant_id = ?",
      [tenant.id]
    );
    res.json({
      template_id: tenant.template_id,
      about_product: aboutProductPage || {},
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get home page by slug
const getHomePageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const [homePage] = await db.select("tbl_home_page", "*", "tenant_id = ?", [
      tenant.id,
    ]);
    res.json({
      template_id: tenant.template_id,
      home: homePage || {},
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get slider banners by slug
const getSliderBannersBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const sliderBanners = await db.select(
      "tbl_slider_banners",
      "*",
      "tenant_id = ?",
      [tenant.id]
    );
    res.json({
      template_id: tenant.template_id,
      slider_banners: sliderBanners || [],
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get single product by slug and product ID
const getProductBySlug = async (req, res) => {
  try {
    const { slug, id } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const [product] = await db.select(
      "tbl_products",
      "*",
      "tenant_id = ? AND id = ?",
      [tenant.id, id]
    );
    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }
    res.json({
      template_id: tenant.template_id,
      product,
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

// Get single blog by slug and blog ID
const getBlogBySlug = async (req, res) => {
  try {
    const { slug, id } = req.params;
    const tenant = await getTenantBySlugInternal(slug);
    const [blog] = await db.select(
      "tbl_blogs",
      "*",
      "tenant_id = ? AND id = ?",
      [tenant.id, id]
    );
    if (!blog) {
      return res.status(404).json({ error: "BLOG_NOT_FOUND" });
    }
    res.json({
      template_id: tenant.template_id,
      blog,
    });
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      return res.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    res.status(500).json({ error: "SERVER_ERROR", message: error.message });
  }
};

module.exports = {
  getTenantBySlugInternal, // Export for potential reuse
  getTenantSiteData,
  getProductPageBySlug,
  getOpportunityPageBySlug,
  getJoinUsPageBySlug,
  getAllContactUsBySlug,
  getProductsBySlug,
  getProductBySlug,
  getCategoriesBySlug,
  getBlogsBySlug,
  getBlogBySlug,
  getSocialLinksBySlug,
  getDisclaimersBySlug,
  getAboutProductPageBySlug,
  getHomePageBySlug,
  getSliderBannersBySlug,
  Bydomain
};