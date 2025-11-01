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
  { name: "image_url", maxCount: 1 },
  { name: "banner_image_url", maxCount: 1 },
  { name: "guide_pdf_url", maxCount: 1 },
  { name: "productBanners", maxCount: 1 },
]);

const cleanupTempFiles = (files) => {
  if (!files) return;
  try {
    Object.values(files).flat().forEach(file => {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        console.log('Cleaned up temp file:', file.path);
      }
    });
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
};

const parseJsonField = (field) => {
  if (!field) return null;
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch {
      return field;
    }
  }
  return field;
};

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
      SELECT 
        p.*,
        c.name as category_name
      FROM tbl_products p
      LEFT JOIN tbl_categories c ON p.category_id = c.id
      WHERE p.tenant_id = ?
    `;
    const params = [tenantId];

    if (category_id) {
      query += ' AND p.category_id = ?';
      params.push(category_id);
    }

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND p.name LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY p.created_at DESC';

    const products = await db.queryAll(query, params);

    const parsedProducts = products.map(p => ({
      ...p,
      category_name: p.category_name || 'Uncategorized',
      keyIngredients: parseJsonField(p.keyIngredients),
      keyBenefits: parseJsonField(p.keyBenefits),
      cautionsAndDisclaimers: parseJsonField(p.cautionsAndDisclaimers),
    }));

    res.json({
      status: true,
      data: parsedProducts,
      count: parsedProducts.length
    });
  } catch (err) {
    console.error('Error fetching tenant products:', err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// ============================================
// GET SINGLE PRODUCT BY ID
// ============================================
const GetProductById = async (req, res) => {
  const { tenantId, productId } = req.params;

  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const product = await db.query(`
      SELECT p.*, c.name as category_name
      FROM tbl_products p
      LEFT JOIN tbl_categories c ON p.category_id = c.id
      WHERE p.id = ? AND p.tenant_id = ?
    `, [productId, tenantId]);

    if (!product) {
      return res.status(404).json({ 
        error: "PRODUCT_NOT_FOUND", 
        message: "Product not found" 
      });
    }

    product.keyIngredients = parseJsonField(product.keyIngredients);
    product.keyBenefits = parseJsonField(product.keyBenefits);
    product.cautionsAndDisclaimers = parseJsonField(product.cautionsAndDisclaimers);

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
    if (err) {
      cleanupTempFiles(req.files);
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const { 
      category_id, name, title, your_price, base_price, preferred_customer_price,
      availability, status, buy_link, video_url, instructions, description,
      keyIngredients, keyBenefits, cautionsAndDisclaimers, country, currency
    } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      cleanupTempFiles(req.files);
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    let imageUrl = null;
    let bannerImageUrl = null;
    let guidePdfUrl = null;
    let bannerUrl = null;

    try {
      if (!category_id || !name || !title || !your_price || !base_price || !preferred_customer_price) {
        throw new Error("Category, name, title, your_price, base_price, and preferred_customer_price are required");
      }

      if (isNaN(your_price) || isNaN(base_price) || isNaN(preferred_customer_price)) {
        throw new Error("Your price, base price, and preferred customer price must be valid numbers");
      }

      const categoryCheck = await db.query(
        'SELECT id FROM tbl_categories WHERE id = ? AND tenant_id = ?',
        [category_id, tenantId]
      );
      if (!categoryCheck) {
        throw new Error("Category not found or doesn't belong to this tenant");
      }

      const safeName = name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const folder = `tenant_${tenantId}/products/${safeName}`;

      // Upload files to S3 BEFORE cleaning up temp files
      if (req.files["image_url"] && req.files["image_url"][0]) {
        console.log('Uploading image...');
        imageUrl = await uploadToS3(req.files["image_url"][0], folder);
      }
      
      if (req.files["banner_image_url"] && req.files["banner_image_url"][0]) {
        console.log('Uploading banner image...');
        bannerImageUrl = await uploadToS3(req.files["banner_image_url"][0], folder);
      }
      
      if (req.files["guide_pdf_url"] && req.files["guide_pdf_url"][0]) {
        console.log('Uploading guide PDF...');
        guidePdfUrl = await uploadToS3(req.files["guide_pdf_url"][0], folder);
      }

      if (req.files["productBanners"] && req.files["productBanners"][0]) {
        console.log('Uploading product banner...');
        bannerUrl = await uploadToS3(req.files["productBanners"][0], folder);
      }

      const productData = {
        tenant_id: tenantId,
        category_id,
        name,
        title,
        description: description || null,
        fullDescription: description || null,
        your_price: parseFloat(your_price),
        base_price: parseFloat(base_price),
        preferred_customer_price: parseFloat(preferred_customer_price),
        availability: availability || "in_stock",
        status: status || "active",
        buy_link: buy_link || null,
        video_url: video_url || null,
        instructions: instructions || null,
        keyIngredients: keyIngredients ? JSON.stringify(parseJsonField(keyIngredients)) : null,
        keyBenefits: keyBenefits ? JSON.stringify(parseJsonField(keyBenefits)) : null,
        cautionsAndDisclaimers: cautionsAndDisclaimers ? JSON.stringify(parseJsonField(cautionsAndDisclaimers)) : null,
        image_url: imageUrl,
        banner_image_url: bannerImageUrl,
        guide_pdf_url: guidePdfUrl,
        productBanners: bannerUrl,
        is_visible: 1,
        country: country || null,
        currency: currency || null,
        created_at: new Date(),
        updated_at: new Date()
      };

      const result = await db.insert("tbl_products", productData);
      const productId = result.insert_id;

      // Clean up temp files AFTER successful upload
      cleanupTempFiles(req.files);

      res.status(201).json({ 
        status: true,
        message: "Product added successfully", 
        product_id: productId 
      });
    } catch (err) {
      console.error('Error adding product:', err);
      
      // Clean up S3 files if database insert fails
      try {
        if (imageUrl) await deleteFromS3(imageUrl);
        if (bannerImageUrl) await deleteFromS3(bannerImageUrl);
        if (guidePdfUrl) await deleteFromS3(guidePdfUrl);
        if (bannerUrl) await deleteFromS3(bannerUrl);
      } catch (cleanupErr) {
        console.error('Error cleaning up S3 files:', cleanupErr);
      }
      
      // Clean up temp files AFTER attempting S3 cleanup
      cleanupTempFiles(req.files);
      
      res.status(500).json({ 
        error: "SERVER_ERROR", 
        message: err.message || "Server error" 
      });
    }
  });
};

// ============================================
// UPDATE PRODUCT
// ============================================
const UpdateProduct = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      cleanupTempFiles(req.files);
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId, productId } = req.params;
    const { 
      category_id, name, title, your_price, base_price, preferred_customer_price,
      availability, status, buy_link, video_url, instructions, description,
      is_visible, keyIngredients, keyBenefits, cautionsAndDisclaimers, country, currency
    } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      cleanupTempFiles(req.files);
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    let newImageUrl = null;
    let newBannerImageUrl = null;
    let newGuidePdfUrl = null;
    let newBannerUrl = null;

    try {
      const existingProduct = await db.query(
        'SELECT * FROM tbl_products WHERE id = ? AND tenant_id = ?',
        [productId, tenantId]
      );

      if (!existingProduct) {
        throw new Error("Product not found or unauthorized");
      }

      if (category_id) {
        const categoryCheck = await db.query(
          'SELECT id FROM tbl_categories WHERE id = ? AND tenant_id = ?',
          [category_id, tenantId]
        );
        if (!categoryCheck) {
          throw new Error("Category not found or doesn't belong to this tenant");
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
      if (description !== undefined) {
        updateData.description = description;
        updateData.fullDescription = description;
      }
      if (is_visible !== undefined) updateData.is_visible = is_visible;
      if (keyIngredients !== undefined) updateData.keyIngredients = keyIngredients ? JSON.stringify(parseJsonField(keyIngredients)) : null;
      if (keyBenefits !== undefined) updateData.keyBenefits = keyBenefits ? JSON.stringify(parseJsonField(keyBenefits)) : null;
      if (cautionsAndDisclaimers !== undefined) updateData.cautionsAndDisclaimers = cautionsAndDisclaimers ? JSON.stringify(parseJsonField(cautionsAndDisclaimers)) : null;
      if (country) updateData.country = country;
      if (currency) updateData.currency = currency;
      updateData.updated_at = new Date();

      const safeDeleteFromS3 = async (url) => {
        if (!url) return;
        try {
          const isS3Url = url.includes('.s3.') || 
                         url.includes('digitaloceanspaces.com') || 
                         url.includes('amazonaws.com/');
          
          if (isS3Url) {
            await deleteFromS3(url);
          }
        } catch (error) {
          console.log('Could not delete file from S3:', error.message);
        }
      };

      // Upload new files to S3 BEFORE cleaning temp files
      if (req.files["image_url"] && req.files["image_url"][0]) {
        console.log('Uploading new image...');
        newImageUrl = await uploadToS3(req.files["image_url"][0], folder);
        await safeDeleteFromS3(existingProduct.image_url);
        updateData.image_url = newImageUrl;
      }
      
      if (req.files["banner_image_url"] && req.files["banner_image_url"][0]) {
        console.log('Uploading new banner image...');
        newBannerImageUrl = await uploadToS3(req.files["banner_image_url"][0], folder);
        await safeDeleteFromS3(existingProduct.banner_image_url);
        updateData.banner_image_url = newBannerImageUrl;
      }
      
      if (req.files["guide_pdf_url"] && req.files["guide_pdf_url"][0]) {
        console.log('Uploading new guide PDF...');
        newGuidePdfUrl = await uploadToS3(req.files["guide_pdf_url"][0], folder);
        await safeDeleteFromS3(existingProduct.guide_pdf_url);
        updateData.guide_pdf_url = newGuidePdfUrl;
      }

      if (req.files["productBanners"] && req.files["productBanners"][0]) {
        console.log('Uploading new product banner...');
        newBannerUrl = await uploadToS3(req.files["productBanners"][0], folder);
        await safeDeleteFromS3(existingProduct.productBanners);
        updateData.productBanners = newBannerUrl;
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(
          "tbl_products", 
          updateData, 
          'id = ? AND tenant_id = ?',
          [productId, tenantId]
        );
      }

      // Clean up temp files AFTER successful upload
      cleanupTempFiles(req.files);

      res.json({ 
        status: true,
        message: "Product updated successfully" 
      });
    } catch (err) {
      console.error('Error updating product:', err);
      
      // Clean up S3 files if update fails
      try {
        if (newImageUrl) await deleteFromS3(newImageUrl);
        if (newBannerImageUrl) await deleteFromS3(newBannerImageUrl);
        if (newGuidePdfUrl) await deleteFromS3(newGuidePdfUrl);
        if (newBannerUrl) await deleteFromS3(newBannerUrl);
      } catch (cleanupErr) {
        console.error('Error cleaning up S3 files:', cleanupErr);
      }
      
      // Clean up temp files AFTER attempting S3 cleanup
      cleanupTempFiles(req.files);
      
      res.status(500).json({ 
        error: "SERVER_ERROR", 
        message: err.message || "Server error" 
      });
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

    try {
      if (product.image_url) await deleteFromS3(product.image_url);
      if (product.banner_image_url) await deleteFromS3(product.banner_image_url);
      if (product.guide_pdf_url) await deleteFromS3(product.guide_pdf_url);
      if (product.productBanners) await deleteFromS3(product.productBanners);
    } catch (s3Error) {
      console.error('Error deleting S3 files:', s3Error);
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
      { is_visible: newVisibility, updated_at: new Date() },
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