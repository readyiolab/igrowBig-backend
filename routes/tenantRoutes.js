const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/authMiddleware");

// Import controllers with all methods
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
  AddOrUpdateBlogBanner,
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
  UpdateSubscriber,
  DeleteSubscriber,
} = require("../controllers/TenantSubscriberController");

// Core Tenant Routes
router.get("/:tenantId", authenticateUser, GetTenant);
router.put("/:tenantId", authenticateUser, UpdateTenant);

//product page routes
router.post("/:tenantId/product-page", authenticateUser, AddProductPage);
router.get("/:tenantId/product-page", authenticateUser, GetProductPage);
router.put("/:tenantId/product-page", authenticateUser, UpdateProductPage);
router.delete("/:tenantId/product-page", authenticateUser, DeleteProductPage);

// Opportunity page routes
router.post(
  "/:tenantId/opportunity-page",
  authenticateUser,
  AddOrUpdateOpportunityPage
);
router.get(
  "/:tenantId/opportunity-page",
  authenticateUser,
  GetOpportunityPage
);
router.put(
  "/:tenantId/opportunity-page",
  authenticateUser,
  AddOrUpdateOpportunityPage
);
router.delete(
  "/:tenantId/opportunity-page",
  authenticateUser,
  DeleteOpportunityPage
);

//join us page routes
router.post("/:tenantId/joinus-page", authenticateUser, AddOrUpdateJoinUsPage);
router.get("/:tenantId/joinus-page", authenticateUser, GetJoinUsPage);
router.delete("/:tenantId/joinus-page", authenticateUser, DeleteJoinUsPage);

//contact us page route
router.post("/:tenantId/contactus", authenticateUser, AddContactUs);
router.put("/:tenantId/contactus/:id", authenticateUser, UpdateContactUs);
router.get("/:tenantId/contactus", authenticateUser, GetAllContactUs);
router.delete("/:tenantId/contactus/:id", authenticateUser, DeleteContactUs);

// Product Routes
router.post("/:tenantId/products", authenticateUser, AddProduct);
router.get("/:tenantId/products", authenticateUser, GetProducts);
router.put("/:tenantId/products/:productId", authenticateUser, UpdateProduct);
router.delete(
  "/:tenantId/products/:productId",
  authenticateUser,
  DeleteProduct
);




// Category Routes
router.post("/:tenantId/categories", authenticateUser, AddCategory);
router.get("/:tenantId/categories", authenticateUser, GetCategories);
router.put(
  "/:tenantId/categories/:categoryId",
  authenticateUser,
  UpdateCategory
);
router.delete(
  "/:tenantId/categories/:categoryId",
  authenticateUser,
  DeleteCategory
);

// Blog Routes

router.post("/:tenantId/blogs", authenticateUser, AddBlog);
router.get("/:tenantId/blogs", authenticateUser, GetBlogs);
router.put("/:tenantId/blogs/:blogId", authenticateUser, UpdateBlog);
router.delete("/:tenantId/blogs/:blogId", authenticateUser, DeleteBlog);

router.post(
  "/:tenantId/blogs/:blogId/banners",
  authenticateUser,
  AddBlogBanner
);
router.put(
  "/:tenantId/blogs/:blogId/banners/:bannerId",
  authenticateUser,
  UpdateBlogBanner
);
router.delete(
  "/:tenantId/blogs/:blogId/banners/:bannerId",
  authenticateUser,
  DeleteBlogBanner
); // Add or update a banner for a blog

// Footer Social Links Routes
router.get("/:tenantId/footer/social-links", authenticateUser, GetSocialLinks);
router.post(
  "/:tenantId/footer/social-links",
  authenticateUser,
  UpsertSocialLinks
);
router.delete(
  "/:tenantId/footer/social-links",
  authenticateUser,
  DeleteSocialLinks
);

// Footer Disclaimers Routes
router.get("/:tenantId/footer/disclaimers", authenticateUser, GetDisclaimers);
router.post(
  "/:tenantId/footer/disclaimers",
  authenticateUser,
  UpsertDisclaimers
);
router.delete(
  "/:tenantId/footer/disclaimers",
  authenticateUser,
  DeleteDisclaimers
);

// About Product Page Routes
router.put(
  "/:tenantId/about-product-page",
  authenticateUser,
  UpdateAboutProductPage
);
router.get(
  "/:tenantId/about-product-page",
  authenticateUser,
  GetAboutProductPage
);

// Home Page Routes
router.post("/:tenantId/home-page", authenticateUser, AddHomePage);
router.put("/:tenantId/home-page", authenticateUser, UpdateHomePage);
router.get("/:tenantId/home-page", authenticateUser, GetHomePage);

// Slider Banner Routes
router.post("/:tenantId/slider-banners", authenticateUser, AddSliderBanner);
router.get("/:tenantId/slider-banners", authenticateUser, GetSliderBanners);
router.put(
  "/:tenantId/slider-banners/:bannerId",
  authenticateUser,
  UpdateSliderBanner
);
router.delete(
  "/:tenantId/slider-banners/:bannerId",
  authenticateUser,
  DeleteSliderBanner
);

// Settings Routes

router.put("/:tenantId/settings", authenticateUser, UpdateSettings);
router.get("/:tenantId/settings", authenticateUser, GetSettings);

//GetTraining
router.get("/:tenantId/trainings", authenticateUser, GetTenantTrainings);

// Get all notifications for authenticated tenant
router.get("/:tenantId/notifications", authenticateUser, GetTenantNotifications);

// Get specific notification
router.get("/:tenantId/notifications/:notificationId", authenticateUser, GetNotification);

// Mark a notification as read
router.post("/:tenantId/notifications/read", authenticateUser, MarkNotificationRead);

// Mark all notifications as read
router.post("/:tenantId/notifications/read-all", authenticateUser, MarkAllNotificationsRead);

//TenantSubscriber

router.post("/:tenantId/subscribers", authenticateUser, AddSubscriber);
router.get("/:tenantId/subscribers", authenticateUser, GetSubscribers);


module.exports = router;
