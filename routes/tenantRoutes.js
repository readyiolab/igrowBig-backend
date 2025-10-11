const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/authMiddleware");

// Import controllers
const { GetTenant, UpdateTenant } = require("../controllers/tenantController");
const {
  AddProduct,
  GetProducts,
  UpdateProduct,
  DeleteProduct,
} = require("../controllers/productController");
const {
  AddProductPage,
  GetProductPage,
  UpdateProductPage,
  DeleteProductPage,
} = require("../controllers/productPageController");
const {
  AddOrUpdateOpportunityPage,
  GetOpportunityPage,
  DeleteOpportunityPage,
} = require("../controllers/opportunityPageController");
const {
  GetJoinUsPage,
  DeleteJoinUsPage,
  AddOrUpdateJoinUsPage,
} = require("../controllers/joinusPageController");
const {
  AddContactUs,
  UpdateContactUs,
  GetAllContactUs,
  DeleteContactUs,
} = require("../controllers/contactusController");
const {
  GetSocialLinks,
  UpsertSocialLinks,
  DeleteSocialLinks,
  GetDisclaimers,
  UpsertDisclaimers,
  DeleteDisclaimers,
} = require("../controllers/footerController");
const {
  AddCategory,
  UpdateCategory,
  DeleteCategory,
  GetCategories,
} = require("../controllers/categoryController");
const {
  AddBlog,
  GetBlogs,
  UpdateBlog,
  DeleteBlog,
  AddBlogBanner,
  UpdateBlogBanner,
  DeleteBlogBanner,
} = require("../controllers/blogController");
const {
  UpdateAboutProductPage,
  GetAboutProductPage,
} = require("../controllers/aboutProductController");
const {
  AddHomePage,
  UpdateHomePage,
  GetHomePage,
} = require("../controllers/homePageController");
const {
  AddSliderBanner,
  GetSliderBanners,
  UpdateSliderBanner,
  DeleteSliderBanner,
} = require("../controllers/sliderController");
const {
  UpdateSettings,
  GetSettings,
} = require("../controllers/settingsController");
const {
  GetTenantNotifications,
  GetNotification,
  MarkNotificationRead,
  MarkAllNotificationsRead,
} = require("../controllers/tenantNotificationsController");
const { GetTenantTrainings } = require("../controllers/GetTenantTrainings");
const {
  AddSubscriber,
  GetSubscribers,
} = require("../controllers/TenantSubscriberController");

// Import verification service
const {
  manualVerifyDomain,
  getVerificationStatus,
} = require("../services/domainVerificationService");

// ==================== CORE TENANT ROUTES ====================
router.get("/:tenantId", authenticateUser, GetTenant);
router.put("/:tenantId", authenticateUser, UpdateTenant);

// ==================== PRODUCT PAGE ROUTES ====================
router.post("/:tenantId/product-page", authenticateUser, AddProductPage);
router.get("/:tenantId/product-page", authenticateUser, GetProductPage);
router.put("/:tenantId/product-page", authenticateUser, UpdateProductPage);
router.delete("/:tenantId/product-page", authenticateUser, DeleteProductPage);

// ==================== OPPORTUNITY PAGE ROUTES ====================
router.post("/:tenantId/opportunity-page", authenticateUser, AddOrUpdateOpportunityPage);
router.get("/:tenantId/opportunity-page", authenticateUser, GetOpportunityPage);
router.put("/:tenantId/opportunity-page", authenticateUser, AddOrUpdateOpportunityPage);
router.delete("/:tenantId/opportunity-page", authenticateUser, DeleteOpportunityPage);

// ==================== JOIN US PAGE ROUTES ====================
router.post("/:tenantId/joinus-page", authenticateUser, AddOrUpdateJoinUsPage);
router.get("/:tenantId/joinus-page", authenticateUser, GetJoinUsPage);
router.delete("/:tenantId/joinus-page", authenticateUser, DeleteJoinUsPage);

// ==================== CONTACT US PAGE ROUTES ====================
router.post("/:tenantId/contactus", authenticateUser, AddContactUs);
router.put("/:tenantId/contactus/:id", authenticateUser, UpdateContactUs);
router.get("/:tenantId/contactus", authenticateUser, GetAllContactUs);
router.delete("/:tenantId/contactus/:id", authenticateUser, DeleteContactUs);

// ==================== PRODUCT ROUTES ====================
router.post("/:tenantId/products", authenticateUser, AddProduct);
router.get("/:tenantId/products", authenticateUser, GetProducts);
router.put("/:tenantId/products/:productId", authenticateUser, UpdateProduct);
router.delete("/:tenantId/products/:productId", authenticateUser, DeleteProduct);

// ==================== CATEGORY ROUTES ====================
router.post("/:tenantId/categories", authenticateUser, AddCategory);
router.get("/:tenantId/categories", authenticateUser, GetCategories);
router.put("/:tenantId/categories/:categoryId", authenticateUser, UpdateCategory);
router.delete("/:tenantId/categories/:categoryId", authenticateUser, DeleteCategory);

// ==================== BLOG ROUTES ====================
router.post("/:tenantId/blogs", authenticateUser, AddBlog);
router.get("/:tenantId/blogs", authenticateUser, GetBlogs);
router.put("/:tenantId/blogs/:blogId", authenticateUser, UpdateBlog);
router.delete("/:tenantId/blogs/:blogId", authenticateUser, DeleteBlog);
router.post("/:tenantId/blogs/:blogId/banners", authenticateUser, AddBlogBanner);
router.put("/:tenantId/blogs/:blogId/banners/:bannerId", authenticateUser, UpdateBlogBanner);
router.delete("/:tenantId/blogs/:blogId/banners/:bannerId", authenticateUser, DeleteBlogBanner);

// ==================== FOOTER ROUTES ====================
router.get("/:tenantId/footer/social-links", authenticateUser, GetSocialLinks);
router.post("/:tenantId/footer/social-links", authenticateUser, UpsertSocialLinks);
router.delete("/:tenantId/footer/social-links", authenticateUser, DeleteSocialLinks);
router.get("/:tenantId/footer/disclaimers", authenticateUser, GetDisclaimers);
router.post("/:tenantId/footer/disclaimers", authenticateUser, UpsertDisclaimers);
router.delete("/:tenantId/footer/disclaimers", authenticateUser, DeleteDisclaimers);

// ==================== ABOUT PRODUCT PAGE ROUTES ====================
router.put("/:tenantId/about-product-page", authenticateUser, UpdateAboutProductPage);
router.get("/:tenantId/about-product-page", authenticateUser, GetAboutProductPage);

// ==================== HOME PAGE ROUTES ====================
router.post("/:tenantId/home-page", authenticateUser, AddHomePage);
router.put("/:tenantId/home-page", authenticateUser, UpdateHomePage);
router.get("/:tenantId/home-page", authenticateUser, GetHomePage);

// ==================== SLIDER BANNER ROUTES ====================
router.post("/:tenantId/slider-banners", authenticateUser, AddSliderBanner);
router.get("/:tenantId/slider-banners", authenticateUser, GetSliderBanners);
router.put("/:tenantId/slider-banners/:bannerId", authenticateUser, UpdateSliderBanner);
router.delete("/:tenantId/slider-banners/:bannerId", authenticateUser, DeleteSliderBanner);

// ==================== SETTINGS ROUTES ====================
router.put("/:tenantId/settings", authenticateUser, UpdateSettings);
router.get("/:tenantId/settings", authenticateUser, GetSettings);

// Manual domain verification (USER)
router.post("/:tenantId/verify-domain", authenticateUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const normalizedTenantId = parseInt(tenantId, 10);

    if (isNaN(normalizedTenantId)) {
      return res.status(400).json({
        error: "INVALID_TENANT_ID",
        message: "Invalid tenant ID",
      });
    }

    // Check if user owns this tenant
    if (req.user.tenant_id !== normalizedTenantId) {
      return res.status(403).json({
        error: "UNAUTHORIZED",
        message: "You don't have access to this tenant",
      });
    }

    console.log(`🔄 [USER] Manual verification for tenant ${normalizedTenantId}`);

    const result = await manualVerifyDomain(normalizedTenantId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || "Verification failed",
        status: result.status,
        reason: result.reason,
      });
    }

    let message = "";
    if (result.status === "verified") {
      message = "✅ Domain fully verified and live! Your custom domain is now active.";
    } else if (result.status === "partially_verified") {
      message = "⚠️ Domain ownership verified, but domain is not pointing to our platform yet. Please add CNAME or A record.";
    } else if (result.status === "pending") {
      message = "⏳ TXT record not found yet. Please add the TXT record to your DNS and try again in a few minutes.";
    }

    res.status(200).json({
      success: true,
      message,
      status: result.status,
      ownership_verified: result.ownership_verified,
      pointing_verified: result.pointing_verified,
    });
  } catch (error) {
    console.error("[USER] VerifyDomain Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to verify domain",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Get verification status (USER)
router.get("/:tenantId/domain-verification-status", authenticateUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const normalizedTenantId = parseInt(tenantId, 10);

    if (isNaN(normalizedTenantId)) {
      return res.status(400).json({
        error: "INVALID_TENANT_ID",
        message: "Invalid tenant ID",
      });
    }

    // Check if user owns this tenant
    if (req.user.tenant_id !== normalizedTenantId) {
      return res.status(403).json({
        error: "UNAUTHORIZED",
        message: "You don't have access to this tenant",
      });
    }

    const status = await getVerificationStatus(normalizedTenantId);

    res.status(200).json({
      success: true,
      verification: status,
    });
  } catch (error) {
    console.error("[USER] GetVerificationStatus Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to get verification status",
    });
  }
});

// ==================== TRAINING ROUTES ====================
router.get("/:tenantId/trainings", authenticateUser, GetTenantTrainings);

// ==================== NOTIFICATION ROUTES ====================
router.get("/:tenantId/notifications", authenticateUser, GetTenantNotifications);
router.get("/:tenantId/notifications/:notificationId", authenticateUser, GetNotification);
router.post("/:tenantId/notifications/read", authenticateUser, MarkNotificationRead);
router.post("/:tenantId/notifications/read-all", authenticateUser, MarkAllNotificationsRead);

// ==================== SUBSCRIBER ROUTES ====================
router.post("/:tenantId/subscribers", authenticateUser, AddSubscriber);
router.get("/:tenantId/subscribers", authenticateUser, GetSubscribers);

module.exports = router;