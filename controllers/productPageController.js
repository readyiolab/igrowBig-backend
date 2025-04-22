const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");

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
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (!extname || !mimetype) {
      return cb(new Error("Only JPEG/JPG/PNG images allowed"));
    }
    cb(null, true);
  },
}).single("banner_image");

const AddProductPage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId } = req.params;
    const { banner_content, about_description, video_section_link } = req.body;

    console.log("Request body:", req.body);
    console.log("File:", req.file);

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const folder = `product-pages/tenant_${tenantId}`;
      let bannerImageUrl = null;
      if (req.file) {
        bannerImageUrl = await uploadToS3(req.file, folder);
      }

      const existingPage = await db.select("tbl_product_page", "*", `tenant_id = ${tenantId}`);
      const pageData = {
        tenant_id: tenantId,
        banner_image_url: bannerImageUrl || (existingPage ? existingPage.banner_image_url : null),
        banner_content: banner_content || (existingPage ? existingPage.banner_content : "Welcome to Our Products"),
        about_description: about_description || (existingPage ? existingPage.about_description : "Discover our amazing products."),
        video_section_link: video_section_link || (existingPage ? existingPage.video_section_link : ""),
      };

      let result;
      if (existingPage) {
        await db.update("tbl_product_page", pageData, `tenant_id = ${tenantId}`);
        result = { insert_id: existingPage.id };
      } else {
        result = await db.insert("tbl_product_page", pageData);
      }

      res.status(201).json({ message: "Product page added/updated", page_id: result.insert_id });
    } catch (err) {
      console.error("Error in AddProductPage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Server error" });
    }
  });
};

const GetProductPage = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    let page = await db.select("tbl_product_page", "*", `tenant_id = ${tenantId}`);
    if (!page) {
      // Create default entry if none exists
      const defaultPageData = {
        tenant_id: tenantId,
        banner_image_url: null,
        banner_content: "Welcome to Our Products",
        about_description: "Discover our amazing products.",
        video_section_link: "",
      };
      await db.insert("tbl_product_page", defaultPageData);
      page = defaultPageData; // Return the default data immediately
    }
    res.json(page);
  } catch (err) {
    console.error("Error in GetProductPage:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Server error" });
  }
};

const UpdateProductPage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId } = req.params;
    const { banner_content, about_description, video_section_link } = req.body;

    console.log("Request body:", req.body);
    console.log("File:", req.file);

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const folder = `product-pages/tenant_${tenantId}`;
      const existingPage = await db.select("tbl_product_page", "*", `tenant_id = ${tenantId}`);
      let bannerImageUrl = existingPage ? existingPage.banner_image_url : null;

      if (req.file) {
        if (existingPage && existingPage.banner_image_url && existingPage.banner_image_url.includes("amazonaws.com")) {
          await deleteFromS3(existingPage.banner_image_url);
        }
        bannerImageUrl = await uploadToS3(req.file, folder);
      }

      const updateData = {
        banner_content: banner_content !== undefined ? banner_content : (existingPage ? existingPage.banner_content : "Welcome to Our Products"),
        about_description: about_description !== undefined ? about_description : (existingPage ? existingPage.about_description : "Discover our amazing products."),
        video_section_link: video_section_link !== undefined ? video_section_link : (existingPage ? existingPage.video_section_link : ""),
        banner_image_url: bannerImageUrl,
      };

      if (existingPage) {
        await db.update("tbl_product_page", updateData, `tenant_id = ${tenantId}`);
      } else {
        updateData.tenant_id = tenantId;
        await db.insert("tbl_product_page", updateData);
      }

      res.json({ message: "Product page updated" });
    } catch (err) {
      console.error("Error in UpdateProductPage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Server error" });
    }
  });
};

const DeleteProductPage = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const page = await db.select("tbl_product_page", "*", `tenant_id = ${tenantId}`);
    if (!page) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Product page not found" });
    }

    if (page.banner_image_url && page.banner_image_url.includes("amazonaws.com")) {
      await deleteFromS3(page.banner_image_url);
    }

    await db.delete("tbl_product_page", `tenant_id = ${tenantId}`);
    res.json({ message: "Product page deleted" });
  } catch (err) {
    console.error("Error in DeleteProductPage:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Server error" });
  }
};

module.exports = {
  AddProductPage,
  GetProductPage,
  UpdateProductPage,
  DeleteProductPage,
};