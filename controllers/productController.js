const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");

// Configure multer for temporary local storage
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

const AddProduct = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId } = req.params;
    const { category_id, name, title, price, price_description, availability, status, youtube_link, instructions, description } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      if (!category_id || !name || !price || !title) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "Category, name, price, and title are required",
        });
      }

      const safeName = name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const folder = `products/${safeName}_${tenantId}`;

      const imageUrl = req.files["image"] ? await uploadToS3(req.files["image"][0], folder) : null;
      const bannerImageUrl = req.files["banner_image"] ? await uploadToS3(req.files["banner_image"][0], folder) : null;
      const guidePdfUrl = req.files["guide_pdf"] ? await uploadToS3(req.files["guide_pdf"][0], folder) : null;
      const videoUrl = req.files["video"] ? await uploadToS3(req.files["video"][0], folder) : youtube_link || null;

      const productData = {
        tenant_id: tenantId,
        category_id,
        name,
        description: description || null,
        price,
        status: status || "active",
        video_url: videoUrl,
        title,
        price_description: price_description || null,
        availability: availability || "in_stock",
        instructions: instructions || null,
        image_url: imageUrl,
        banner_image_url: bannerImageUrl,
        guide_pdf_url: guidePdfUrl,
      };

      const result = await db.insert("tbl_products", productData);
      const productId = result.insert_id;

      res.status(201).json({ message: "Product added", product_id: productId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

const GetProducts = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const products = await db.queryAll(`
      SELECT p.*, c.name AS category_name
      FROM tbl_products p
      LEFT JOIN tbl_categories c ON p.category_id = c.id
      WHERE p.tenant_id = '${tenantId}'
    `);

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

const UpdateProduct = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId, productId } = req.params;
    const { category_id, name, title, price, price_description, availability, status, youtube_link, instructions, description } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const folder = `products/product_${productId}`;
      const updateData = {};
      if (category_id) updateData.category_id = category_id;
      if (name) updateData.name = name;
      if (title) updateData.title = title;
      if (price) updateData.price = price;
      if (price_description !== undefined) updateData.price_description = price_description;
      if (availability) updateData.availability = availability;
      if (status) updateData.status = status;
      if (youtube_link !== undefined) updateData.video_url = youtube_link;
      if (instructions !== undefined) updateData.instructions = instructions;
      if (description !== undefined) updateData.description = description;

      if (req.files["image"]) updateData.image_url = await uploadToS3(req.files["image"][0], folder);
      if (req.files["banner_image"]) updateData.banner_image_url = await uploadToS3(req.files["banner_image"][0], folder);
      if (req.files["guide_pdf"]) updateData.guide_pdf_url = await uploadToS3(req.files["guide_pdf"][0], folder);
      if (req.files["video"]) updateData.video_url = await uploadToS3(req.files["video"][0], folder);

      if (Object.keys(updateData).length > 0) {
        await db.update("tbl_products", updateData, `id = ${productId} AND tenant_id = ${tenantId}`);
      }

      res.json({ message: "Product updated" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

const DeleteProduct = async (req, res) => {
  const { tenantId, productId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const product = await db.select("tbl_products", "*", `id = ${productId} AND tenant_id = ${tenantId}`);
    if (product) {
      if (product.image_url) await deleteFromS3(product.image_url);
      if (product.banner_image_url) await deleteFromS3(product.banner_image_url);
      if (product.guide_pdf_url) await deleteFromS3(product.guide_pdf_url);
      if (product.video_url && !product.video_url.includes("youtube")) await deleteFromS3(product.video_url);
    }

    await db.delete("tbl_products", `id = ${productId} AND tenant_id = ${tenantId}`);
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddProduct,
  GetProducts,
  UpdateProduct,
  DeleteProduct,
};