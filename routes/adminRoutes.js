const express = require("express");
const router = express.Router();
const { AdminSignup, AdminLogin, CreateUser, ResetUserPassword, SendTenantNotification,GetAllTenantUsers,GetAllTenantMessages,GetTenantSettings,UpdateTenantSettings, UpdateUserStatus, CreateCategory, GetAllCategories, UpdateCategory, DeleteCategory, CreateTraining, GetAllTrainings, UpdateTraining, DeleteTraining, AdminchangePassword,DeleteTenantLogo, GetDomainLogs } = require("../controllers/adminController");
const { authenticateAdmin } = require("../middleware/authMiddleware");

router.post("/signup", AdminSignup);
router.post("/login", AdminLogin);
router.put("/admin-change-password", authenticateAdmin, AdminchangePassword);
router.post("/create-user", authenticateAdmin, CreateUser); // Protect admin-only actions
router.put("/user-status", authenticateAdmin, UpdateUserStatus);
router.post("/reset-user-password", authenticateAdmin, ResetUserPassword); // Protect admin-only actions
router.post("/notifications", authenticateAdmin, SendTenantNotification); // Protect notification route
router.get("/tenant-users", authenticateAdmin, GetAllTenantUsers);
router.get("/messages", authenticateAdmin, GetAllTenantMessages); // New route
router.get("/settings/:tenantId", authenticateAdmin, GetTenantSettings); // New route
router.put("/settings/:tenantId", authenticateAdmin, UpdateTenantSettings);
// Get domain logs
router.get('/settings/:tenantId/domain-logs', authenticateAdmin, GetDomainLogs);
router.delete("/settings/:tenantId/logo", DeleteTenantLogo);

router.post("/training",authenticateAdmin, CreateTraining);
router.get("/training",authenticateAdmin, GetAllTrainings);
router.put("/training/:trainingId",authenticateAdmin, UpdateTraining);
router.delete("/training/:trainingId",authenticateAdmin ,DeleteTraining);

router.post("/training/categories",authenticateAdmin ,CreateCategory);
router.get("/training/categories",authenticateAdmin, GetAllCategories);
router.put("/training/categories/:categoryId",authenticateAdmin ,UpdateCategory);
router.delete("/training/categories/:categoryId",authenticateAdmin, DeleteCategory);





module.exports = router;