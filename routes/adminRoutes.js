const express = require("express");
const router = express.Router();

// Import controllers
const {
  AdminSignup,
  AdminLogin,
  CreateUser,
  ResetUserPassword,
  SendTenantNotification,
  GetAllTenantUsers,
  GetAllTenantMessages,
  GetTenantSettings,
  UpdateTenantSettings,
  UpdateUserStatus,
  CreateCategory,
  GetAllCategories,
  UpdateCategory,
  DeleteCategory,
  CreateTraining,
  GetAllTrainings,
  UpdateTraining,
  DeleteTraining,
  AdminchangePassword,
  DeleteTenantLogo,
  GetDomainLogs,
} = require("../controllers/adminController");

// Import domain verification handlers
const {
  manualVerifyDomain,
  debugDNS,
  checkCustomDomain,
  retryVerification,
} = require("../controllers/domainVerificationController");

const { authenticateAdmin } = require("../middleware/authMiddleware");

// ==================== AUTHENTICATION ROUTES ====================
router.post("/signup", AdminSignup);
router.post("/login", AdminLogin);
router.put("/admin-change-password", authenticateAdmin, AdminchangePassword);

// ==================== USER MANAGEMENT ROUTES ====================
router.post("/create-user", authenticateAdmin, CreateUser);
router.put("/user-status", authenticateAdmin, UpdateUserStatus);
router.post("/reset-user-password", authenticateAdmin, ResetUserPassword);
router.get("/tenant-users", authenticateAdmin, GetAllTenantUsers);

// ==================== SETTINGS ROUTES ====================
router.get("/settings/:tenantId", authenticateAdmin, GetTenantSettings);
router.put("/settings/:tenantId", authenticateAdmin, UpdateTenantSettings);
router.delete("/settings/:tenantId/logo", authenticateAdmin, DeleteTenantLogo);
router.get("/settings/:tenantId/domain-logs", authenticateAdmin, GetDomainLogs);

// ==================== DOMAIN VERIFICATION ROUTES ====================
// Manual verification trigger
router.post("/verify-domain/:tenantId", authenticateAdmin, manualVerifyDomain);

// Debug DNS records for subdomain
router.get("/debug-dns/:subdomain", authenticateAdmin, debugDNS);

// Check custom domain status
router.get("/check-domain/:domain", authenticateAdmin, checkCustomDomain);

// Retry failed verification
router.post("/retry-verification/:tenantId", authenticateAdmin, retryVerification);

// ==================== COMMUNICATION ROUTES ====================
router.post("/notifications", authenticateAdmin, SendTenantNotification);
router.get("/messages", authenticateAdmin, GetAllTenantMessages);

// ==================== TRAINING ROUTES ====================
router.post("/training", authenticateAdmin, CreateTraining);
router.get("/training", authenticateAdmin, GetAllTrainings);
router.put("/training/:trainingId", authenticateAdmin, UpdateTraining);
router.delete("/training/:trainingId", authenticateAdmin, DeleteTraining);

// Training categories
router.post("/training/categories", authenticateAdmin, CreateCategory);
router.get("/training/categories", authenticateAdmin, GetAllCategories);
router.put("/training/categories/:categoryId", authenticateAdmin, UpdateCategory);
router.delete("/training/categories/:categoryId", authenticateAdmin, DeleteCategory);

module.exports = router;