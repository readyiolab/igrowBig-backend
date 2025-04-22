const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");

// Configure multer for temporary local storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, "../uploads/temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error("Only JPEG/JPG/PNG images allowed"));
  },
}).single("image");

// Add Category
const AddCategory = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const tenantId = parseInt(req.params.tenantId, 10);
    const { name, description, status } = req.body;

    console.log("Parsed Tenant ID:", tenantId);

    // Validate tenant ID
    if (isNaN(tenantId)) {
      return res.status(400).json({
        error: "INVALID_TENANT_ID",
        message: "Invalid tenant ID provided",
      });
    }

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      // Explicit tenant existence check
      const tenantCheck = await db.select("tbl_tenants", "*", `id = ${tenantId}`);
      if (!tenantCheck) {
        return res.status(404).json({
          error: "TENANT_NOT_FOUND",
          message: `Tenant with ID ${tenantId} does not exist`,
        });
      }

      if (!name) {
        return res.status(400).json({
          error: "MISSING_FIELD",
          message: "Category name is required",
        });
      }

      // Prepare folder name dynamically
      const safeName = name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const folder = `categories/${safeName}_${tenantId}`;

      // Upload to S3 if file exists
      let imageUrl = null;
      if (req.file) {
        imageUrl = await uploadToS3(req.file, folder);
        // Clean up temporary file
        const tempFilePath = req.file.path;
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      }

      const categoryData = {
        tenant_id: tenantId,
        name,
        description: description || null,
        image_url: imageUrl,
        status: status ? status.toLowerCase() : "active",
      };

      console.log("Prepared Category Data:", categoryData);

      const result = await db.insert("tbl_categories", categoryData);

      res.status(201).json({ message: "Category added", category_id: result.insert_id });
    } catch (err) {
      console.error("Detailed Error:", err);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Server error",
        errorDetails: err.message,
      });
    }
  });
};

// Get Categories
const GetCategories = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const categories = await db.selectAll("tbl_categories", "*", `tenant_id = ${tenantId}`);
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Update Category
const UpdateCategory = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId, categoryId } = req.params;
    const { name, description, status } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingCategory = await db.select(
        "tbl_categories",
        "*",
        `id = ${categoryId} AND tenant_id = ${tenantId}`
      );
      if (!existingCategory) {
        return res.status(404).json({ error: "CATEGORY_NOT_FOUND", message: "Category not found" });
      }

      // Prepare folder name dynamically
      const safeName = (name || existingCategory.name).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const folder = `categories/${safeName}_${tenantId}`;

      const updateData = {
        name: name || existingCategory.name,
        description: description !== undefined ? description : existingCategory.description,
        status: status ? status.toLowerCase() : existingCategory.status,
      };

      if (req.file) {
        // Delete old image from S3 if it exists
        if (existingCategory.image_url) {
          await deleteFromS3(existingCategory.image_url);
        }
        // Upload new image to S3
        updateData.image_url = await uploadToS3(req.file, folder);
        // Clean up temporary file
        const tempFilePath = req.file.path;
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      }

      console.log("Updating category with data:", updateData);

      const result = await db.update(
        "tbl_categories",
        updateData,
        `id = ${categoryId} AND tenant_id = ${tenantId}`
      );

      if (!result.affected_rows) {
        return res.status(500).json({ error: "UPDATE_FAILED", message: "No rows updated" });
      }

      const updatedCategory = await db.select(
        "tbl_categories",
        "*",
        `id = ${categoryId} AND tenant_id = ${tenantId}`
      );
      res.json({ message: "Category updated", category: updatedCategory });
    } catch (err) {
      console.error("Error updating category:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error", details: err.message });
    }
  });
};

// Delete Category
const DeleteCategory = async (req, res) => {
  const { tenantId, categoryId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const category = await db.select(
      "tbl_categories",
      "*",
      `id = ${categoryId} AND tenant_id = ${tenantId}`
    );
    if (!category) {
      return res.status(404).json({ error: "CATEGORY_NOT_FOUND", message: "Category not found" });
    }

    // Delete image from S3 if it exists
    if (category.image_url) {
      await deleteFromS3(category.image_url);
    }

    await db.delete("tbl_categories", `id = ${categoryId} AND tenant_id = ${tenantId}`);
    res.json({ message: "Category deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddCategory,
  UpdateCategory,
  DeleteCategory,
  GetCategories,
};