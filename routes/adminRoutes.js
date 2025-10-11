const express = require("express");
const router = express.Router();

// Import services
const {
  manualVerifyDomain: manualVerifyDomainService,
  getVerificationStatus,
} = require("../services/domainVerificationService");

const { 
  debugDNS, 
  manualVerifyDomain: cloudflareManualVerify 
} = require('../services/cloudflareService');

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
  GetDomainLogs 
} = require("../controllers/adminController");

const { authenticateAdmin } = require("../middleware/authMiddleware");

// ==================== DOMAIN VERIFICATION ROUTES ====================

// Manual domain verification (using domainVerificationService)
router.post('/settings/:tenantId/verify-domain', authenticateAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const normalizedTenantId = parseInt(tenantId, 10);

    if (isNaN(normalizedTenantId)) {
      return res.status(400).json({
        error: "INVALID_TENANT_ID",
        message: "Invalid tenant ID",
      });
    }

    console.log(`🔄 [ADMIN] Manual verification for tenant ${normalizedTenantId}`);

    const result = await manualVerifyDomainService(normalizedTenantId);

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
      message = "✅ Domain fully verified and live!";
    } else if (result.status === "partially_verified") {
      message = "⚠️ Domain ownership verified, but not pointing yet.";
    } else if (result.status === "pending") {
      message = "⏳ TXT record not found yet.";
    }

    res.status(200).json({
      success: true,
      message,
      status: result.status,
      ownership_verified: result.ownership_verified,
      pointing_verified: result.pointing_verified,
    });
  } catch (error) {
    console.error("[ADMIN] VerifyDomain Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to verify domain",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Get verification status
router.get('/settings/:tenantId/verification-status', authenticateAdmin, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const normalizedTenantId = parseInt(tenantId, 10);

    if (isNaN(normalizedTenantId)) {
      return res.status(400).json({
        error: "INVALID_TENANT_ID",
        message: "Invalid tenant ID",
      });
    }

    const status = await getVerificationStatus(normalizedTenantId);

    res.status(200).json({
      success: true,
      verification: status,
    });
  } catch (error) {
    console.error("[ADMIN] GetVerificationStatus Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to get verification status",
    });
  }
});

// Debug DNS (uses cloudflareService.debugDNS which already has req,res)
router.get('/debug-dns/:subdomain', authenticateAdmin, debugDNS);

// Cloudflare manual verify (already has req,res signature)
router.post('/cloudflare-verify/:tenantId', authenticateAdmin, cloudflareManualVerify);

// ==================== ADMIN AUTH ROUTES ====================
router.post("/signup", AdminSignup);
router.post("/login", AdminLogin);
router.put("/admin-change-password", authenticateAdmin, AdminchangePassword);

// ==================== USER MANAGEMENT ROUTES ====================
router.post("/create-user", authenticateAdmin, CreateUser);
router.put("/user-status", authenticateAdmin, UpdateUserStatus);
router.post("/reset-user-password", authenticateAdmin, ResetUserPassword);
router.get("/tenant-users", authenticateAdmin, GetAllTenantUsers);

// ==================== TENANT MANAGEMENT ROUTES ====================
router.post("/notifications", authenticateAdmin, SendTenantNotification);
router.get("/messages", authenticateAdmin, GetAllTenantMessages);
router.get("/settings/:tenantId", authenticateAdmin, GetTenantSettings);
router.put("/settings/:tenantId", authenticateAdmin, UpdateTenantSettings);
router.get("/settings/:tenantId/domain-logs", authenticateAdmin, GetDomainLogs);
router.delete("/settings/:tenantId/logo", authenticateAdmin, DeleteTenantLogo);

// ==================== TRAINING ROUTES ====================
router.post("/training", authenticateAdmin, CreateTraining);
router.get("/training", authenticateAdmin, GetAllTrainings);
router.put("/training/:trainingId", authenticateAdmin, UpdateTraining);
router.delete("/training/:trainingId", authenticateAdmin, DeleteTraining);

// ==================== TRAINING CATEGORY ROUTES ====================
router.post("/training/categories", authenticateAdmin, CreateCategory);
router.get("/training/categories", authenticateAdmin, GetAllCategories);
router.put("/training/categories/:categoryId", authenticateAdmin, UpdateCategory);
router.delete("/training/categories/:categoryId", authenticateAdmin, DeleteCategory);

module.exports = router;