// routes/publicTenantRoutes.js
const express = require("express");
const router = express.Router();
const {
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
  getSliderBannersBySlug
} = require("../controllers/publicTenantController.js");



// Get all site data for a tenant
router.get("/site/:slug", getTenantSiteData);


router.get("/site/:slug/product-page", getProductPageBySlug);
router.get("/site/:slug/opportunity-page", getOpportunityPageBySlug);
router.get("/site/:slug/joinus-page", getJoinUsPageBySlug);
router.get("/site/:slug/contactus", getAllContactUsBySlug);
router.get("/site/:slug/products", getProductsBySlug);
router.get("/site/:slug/product/:id", getProductBySlug);
router.get("/site/:slug/categories", getCategoriesBySlug);
router.get("/site/:slug/blogs", getBlogsBySlug);
router.get("/site/:slug/blog/:id", getBlogBySlug);
router.get("/site/:slug/footer/social-links", getSocialLinksBySlug);
router.get("/site/:slug/footer/disclaimers", getDisclaimersBySlug);
router.get("/site/:slug/about-product-page", getAboutProductPageBySlug);
router.get("/site/:slug/home-page", getHomePageBySlug);
router.get("/site/:slug/slider-banners", getSliderBannersBySlug);


module.exports = router;