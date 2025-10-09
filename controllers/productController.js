const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, "../Uploads/temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (!extname || !mimetype) {
      return cb(new Error("Only JPEG/JPG/PNG images, MP4 videos, or PDFs allowed"));
    }
    if (["image/jpeg", "image/jpg", "image/png"].includes(file.mimetype) && file.size > 4 * 1024 * 1024) {
      return cb(new Error("Image files must be 4MB or less"));
    }
    if (file.mimetype === "application/pdf" && file.size > 4 * 1024 * 1024) {
      return cb(new Error("PDF files must be 4MB or less"));
    }
    if (file.mimetype === "video/mp4" && file.size > 50 * 1024 * 1024) {
      return cb(new Error("MP4 files must be 50MB or less"));
    }
    cb(null, true);
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "banner_image", maxCount: 1 },
  { name: "guide_pdf", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

// ============================================
// GET ALL PRODUCTS FOR TENANT
// ============================================
const GetProducts = async (req, res) => {
  const { tenantId } = req.params;
  const { category_id, status, search } = req.query;

  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    let query = `
      SELECT p.*, c.name AS category_name
      FROM tbl_products p
      LEFT JOIN tbl_categories c ON p.category_id = c.id AND c.tenant_id = ?
      WHERE p.tenant_id = ?
    `;
    const params = [tenantId, tenantId];

    // Filter by category
    if (category_id) {
      query += ' AND p.category_id = ?';
      params.push(category_id);
    }

    // Filter by status
    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    // Search by name
    if (search) {
      query += ' AND p.name LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY p.created_at DESC';

    const products = await db.queryAll(query, params);

    res.json({
      status: true,
      data: products,
      count: products.length
    });
  } catch (err) {
    console.error('Error fetching tenant products:', err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// ============================================
// GET SINGLE PRODUCT BY ID (WITH ALL DETAILS)
// ============================================
const GetProductById = async (req, res) => {
  const { tenantId, productId } = req.params;

  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const product = await db.query(`
      SELECT 
        p.*,
        c.name AS category_name,
        gp.productName as global_product_name
      FROM tbl_products p
      LEFT JOIN tbl_categories c ON p.category_id = c.id AND c.tenant_id = ?
      LEFT JOIN tbl_products_global gp ON p.global_product_id = gp.id
      WHERE p.id = ? AND p.tenant_id = ?
    `, [tenantId, productId, tenantId]);

    if (!product) {
      return res.status(404).json({ 
        error: "PRODUCT_NOT_FOUND", 
        message: "Product not found" 
      });
    }

    res.json({ status: true, data: product });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// ============================================
// ADD NEW PRODUCT
// ============================================
const AddProduct = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId } = req.params;
    const { 
      category_id, name, title, your_price, base_price, preferred_customer_price,
      availability, status, buy_link, video_url, instructions, description 
    } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      // Validate required fields
      if (!category_id || !name || !title || !your_price || !base_price || !preferred_customer_price) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "Category, name, title, your_price, base_price, and preferred_customer_price are required",
        });
      }

      // Validate pricing fields are numeric
      if (isNaN(your_price) || isNaN(base_price) || isNaN(preferred_customer_price)) {
        return res.status(400).json({
          error: "INVALID_PRICES",
          message: "Your price, base price, and preferred customer price must be valid numbers"
        });
      }

      // Check if category belongs to this tenant
      const categoryCheck = await db.query(
        'SELECT id FROM tbl_categories WHERE id = ? AND tenant_id = ?',
        [category_id, tenantId]
      );
      if (!categoryCheck) {
        return res.status(400).json({
          error: "INVALID_CATEGORY",
          message: "Category not found or doesn't belong to this tenant"
        });
      }

      const safeName = name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const folder = `tenant_${tenantId}/products/${safeName}`;

      const imageUrl = req.files["image"] ? await uploadToS3(req.files["image"][0], folder) : null;
      const bannerImageUrl = req.files["banner_image"] ? await uploadToS3(req.files["banner_image"][0], folder) : null;
      const guidePdfUrl = req.files["guide_pdf"] ? await uploadToS3(req.files["guide_pdf"][0], folder) : null;
      const videoUrlUploaded = req.files["video"] ? await uploadToS3(req.files["video"][0], folder) : null;

      const productData = {
        tenant_id: tenantId,
        category_id,
        name,
        title,
        description: description || null,
        your_price: parseFloat(your_price),
        base_price: parseFloat(base_price),
        preferred_customer_price: parseFloat(preferred_customer_price),
        availability: availability || "in_stock",
        status: status || "active",
        buy_link: buy_link || null,
        video_url: videoUrlUploaded || video_url || null,
        instructions: instructions || null,
        image_url: imageUrl,
        banner_image_url: bannerImageUrl,
        guide_pdf_url: guidePdfUrl,
        is_visible: 1,
        created_at: new Date()
      };

      const result = await db.insert("tbl_products", productData);
      const productId = result.insert_id;

      res.status(201).json({ 
        status: true,
        message: "Product added successfully", 
        product_id: productId 
      });
    } catch (err) {
      console.error('Error adding product:', err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// ============================================
// UPDATE PRODUCT
// ============================================
const UpdateProduct = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId, productId } = req.params;
    const { 
      category_id, name, title, your_price, base_price, preferred_customer_price,
      availability, status, buy_link, video_url, instructions, description,
      is_visible
    } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      // Check if product exists and belongs to tenant
      const existingProduct = await db.query(
        'SELECT * FROM tbl_products WHERE id = ? AND tenant_id = ?',
        [productId, tenantId]
      );

      if (!existingProduct) {
        return res.status(404).json({
          error: "PRODUCT_NOT_FOUND",
          message: "Product not found or unauthorized"
        });
      }

      // If updating category, verify it belongs to tenant
      if (category_id) {
        const categoryCheck = await db.query(
          'SELECT id FROM tbl_categories WHERE id = ? AND tenant_id = ?',
          [category_id, tenantId]
        );
        if (!categoryCheck) {
          return res.status(400).json({
            error: "INVALID_CATEGORY",
            message: "Category not found or doesn't belong to this tenant"
          });
        }
      }

      const safeName = (name || existingProduct.name).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const folder = `tenant_${tenantId}/products/${safeName}`;

      const updateData = {};
      if (category_id) updateData.category_id = category_id;
      if (name) updateData.name = name;
      if (title) updateData.title = title;
      if (your_price !== undefined) updateData.your_price = parseFloat(your_price);
      if (base_price !== undefined) updateData.base_price = parseFloat(base_price);
      if (preferred_customer_price !== undefined) updateData.preferred_customer_price = parseFloat(preferred_customer_price);
      if (availability) updateData.availability = availability;
      if (status) updateData.status = status;
      if (buy_link !== undefined) updateData.buy_link = buy_link;
      if (video_url !== undefined) updateData.video_url = video_url;
      if (instructions !== undefined) updateData.instructions = instructions;
      if (description !== undefined) updateData.description = description;
      if (is_visible !== undefined) updateData.is_visible = is_visible;

      // Handle file uploads
      if (req.files["image"]) {
        if (existingProduct.image_url) await deleteFromS3(existingProduct.image_url);
        updateData.image_url = await uploadToS3(req.files["image"][0], folder);
      }
      if (req.files["banner_image"]) {
        if (existingProduct.banner_image_url) await deleteFromS3(existingProduct.banner_image_url);
        updateData.banner_image_url = await uploadToS3(req.files["banner_image"][0], folder);
      }
      if (req.files["guide_pdf"]) {
        if (existingProduct.guide_pdf_url) await deleteFromS3(existingProduct.guide_pdf_url);
        updateData.guide_pdf_url = await uploadToS3(req.files["guide_pdf"][0], folder);
      }
      if (req.files["video"]) {
        if (existingProduct.video_url && !existingProduct.video_url.includes('youtube')) {
          await deleteFromS3(existingProduct.video_url);
        }
        updateData.video_url = await uploadToS3(req.files["video"][0], folder);
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(
          "tbl_products", 
          updateData, 
          'id = ? AND tenant_id = ?',
          [productId, tenantId]
        );
      }

      res.json({ 
        status: true,
        message: "Product updated successfully" 
      });
    } catch (err) {
      console.error('Error updating product:', err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// ============================================
// DELETE PRODUCT
// ============================================
const DeleteProduct = async (req, res) => {
  const { tenantId, productId } = req.params;
  
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const product = await db.query(
      'SELECT * FROM tbl_products WHERE id = ? AND tenant_id = ?',
      [productId, tenantId]
    );

    if (!product) {
      return res.status(404).json({
        error: "PRODUCT_NOT_FOUND",
        message: "Product not found or unauthorized"
      });
    }

    // Delete associated files from S3
    if (product.image_url) await deleteFromS3(product.image_url);
    if (product.banner_image_url) await deleteFromS3(product.banner_image_url);
    if (product.guide_pdf_url) await deleteFromS3(product.guide_pdf_url);
    if (product.video_url && !product.video_url.includes("youtube")) {
      await deleteFromS3(product.video_url);
    }

    await db.delete("tbl_products", 'id = ? AND tenant_id = ?', [productId, tenantId]);
    
    res.json({ 
      status: true,
      message: "Product deleted successfully" 
    });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// ============================================
// TOGGLE PRODUCT VISIBILITY
// ============================================
const ToggleProductVisibility = async (req, res) => {
  const { tenantId, productId } = req.params;
  
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const product = await db.query(
      'SELECT is_visible FROM tbl_products WHERE id = ? AND tenant_id = ?',
      [productId, tenantId]
    );

    if (!product) {
      return res.status(404).json({
        error: "PRODUCT_NOT_FOUND",
        message: "Product not found"
      });
    }

    const newVisibility = product.is_visible ? 0 : 1;
    
    await db.update(
      "tbl_products",
      { is_visible: newVisibility },
      'id = ? AND tenant_id = ?',
      [productId, tenantId]
    );

    res.json({
      status: true,
      message: `Product ${newVisibility ? 'shown' : 'hidden'} successfully`,
      is_visible: newVisibility
    });
  } catch (err) {
    console.error('Error toggling visibility:', err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddProduct,
  GetProducts,
  GetProductById,
  UpdateProduct,
  DeleteProduct,
  ToggleProductVisibility
};