const db = require('../config/db');
const { checkTenantAuth } = require("../middleware/authMiddleware");

const GetTenantTrainings = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id; // Extract tenantId from JWT payload

    // Check if tenantId exists
    if (!tenantId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Tenant ID is missing from user data" });
    }

    // Check if user is authenticated for the tenant
    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    // Fetch trainings with category name
    const trainings = await db.queryAll(
      `
      SELECT t.*, c.name AS category_name
      FROM tbl_manage_training t
      LEFT JOIN tbl_training_categories c ON t.category_id = c.id
      WHERE t.status = 'ACTIVE'
      `
    );

    res.status(200).json({
      message: "Trainings retrieved successfully",
      trainings,
    });
  } catch (error) {
    console.error("GetTenantTrainings Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve trainings",
      details: error.message,
    });
  }
};

module.exports = { GetTenantTrainings };