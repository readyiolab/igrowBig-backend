const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");
const { getDefaultProductPageData } = require("../utils/defaultPageData"); // ✅ IMPORT from single source

// ✅ Safe file deletion helper
const safeUnlink = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted local file: ${filePath}`);
    }
  } catch (err) {
    console.error("Error deleting local file:", err);
  }
};

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadBaseDir = path.join(__dirname, "../uploads");
    let subFolder;
    
    switch (file.fieldname) {
      case "banner_section_image":
        subFolder = "product_page_banners";
        break;
      case "about_section_image":
        subFolder = "product_page_about";
        break;
      case "video_section_file":
        subFolder = "product_page_videos";
        break;
      default:
        subFolder = "product_page_misc";
    }
    
    const uploadDir = path.join(uploadBaseDir, subFolder);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (!extname || !mimetype) {
      return cb(new Error("Only JPEG/JPG/PNG images or MP4 videos allowed"));
    }
    
    if (["image/jpeg", "image/jpg", "image/png"].includes(file.mimetype) && file.size > 4 * 1024 * 1024) {
      return cb(new Error("Image files must be 4MB or less"));
    }
    
    if (file.mimetype === "video/mp4" && file.size > 50 * 1024 * 1024) {
      return cb(new Error("MP4 files must be 50MB or less"));
    }
    
    cb(null, true);
  },
}).fields([
  { name: "banner_section_image", maxCount: 1 },
  { name: "about_section_image", maxCount: 1 },
  { name: "video_section_file", maxCount: 1 },
]);

// Add Product Page
const AddProductPage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const {
      banner_section_title,
      banner_section_content,
      about_section_title,
      about_section_content,
      video_section_title,
      video_section_content,
      video_section_youtube_url,
    } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingPage = await db.select("tbl_product_page", "*", `tenant_id = ${tenantId}`);
      if (existingPage) {
        return res.status(400).json({
          error: "PAGE_EXISTS",
          message: "Product page already exists for this tenant. Use update instead.",
        });
      }

      const productPageData = {
        tenant_id: tenantId,
        banner_section_title,
        banner_section_content,
        about_section_title,
        about_section_content,
        video_section_title,
        video_section_content,
        video_section_youtube_url: video_section_youtube_url || null,
      };

      // Handle file uploads
      if (req.files) {
        if (req.files.banner_section_image) {
          const file = req.files.banner_section_image[0];
          productPageData.banner_section_image_url = await uploadToS3(file, `tenant_${tenantId}/product_page_banners`);
          safeUnlink(file.path);
        }
        if (req.files.about_section_image) {
          const file = req.files.about_section_image[0];
          productPageData.about_section_image_url = await uploadToS3(file, `tenant_${tenantId}/product_page_about`);
          safeUnlink(file.path);
        }
        if (req.files.video_section_file) {
          const file = req.files.video_section_file[0];
          productPageData.video_section_file_url = await uploadToS3(file, `tenant_${tenantId}/product_page_videos`);
          safeUnlink(file.path);
        }
      }

      const result = await db.insert("tbl_product_page", productPageData);
      res.status(201).json({ 
        message: "Product page added successfully", 
        page_id: result.insert_id,
        data: productPageData 
      });
    } catch (err) {
      console.error("Error in AddProductPage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// ✅ OPTIMIZED: Update Product Page (Using shared defaults)
const UpdateProductPage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const {
      banner_section_title,
      banner_section_content,
      about_section_title,
      about_section_content,
      video_section_title,
      video_section_content,
      video_section_youtube_url,
    } = req.body;

    console.log("Request body:", req.body);
    console.log("Files:", req.files);

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingPage = await db.select("tbl_product_page", "*", `tenant_id = ${tenantId}`);
      
      // ✅ IF NO PAGE EXISTS, CREATE ONE WITH DEFAULTS FROM SHARED SOURCE
      if (!existingPage) {
        const defaults = getDefaultProductPageData(); // ✅ Use shared defaults
        const productPageData = {
          tenant_id: tenantId,
          banner_section_title: banner_section_title || defaults.banner_section_title,
          banner_section_content: banner_section_content || defaults.banner_section_content,
          about_section_title: about_section_title || defaults.about_section_title,
          about_section_content: about_section_content || defaults.about_section_content,
          video_section_title: video_section_title || defaults.video_section_title,
          video_section_content: video_section_content || defaults.video_section_content,
          video_section_youtube_url: video_section_youtube_url || defaults.video_section_youtube_url || null,
        };

        // Handle file uploads for new record
        if (req.files) {
          if (req.files.banner_section_image) {
            const file = req.files.banner_section_image[0];
            productPageData.banner_section_image_url = await uploadToS3(file, `tenant_${tenantId}/product_page_banners`);
            safeUnlink(file.path);
          }
          if (req.files.about_section_image) {
            const file = req.files.about_section_image[0];
            productPageData.about_section_image_url = await uploadToS3(file, `tenant_${tenantId}/product_page_about`);
            safeUnlink(file.path);
          }
          if (req.files.video_section_file) {
            const file = req.files.video_section_file[0];
            productPageData.video_section_file_url = await uploadToS3(file, `tenant_${tenantId}/product_page_videos`);
            safeUnlink(file.path);
          }
        }

        const result = await db.insert("tbl_product_page", productPageData);
        return res.status(201).json({ 
          message: "Product page created successfully", 
          page_id: result.insert_id,
          data: productPageData 
        });
      }

      // ✅ PAGE EXISTS - SMART UPDATE (only update fields that are provided)
      const productPageData = {};

      if (banner_section_title !== undefined) {
        productPageData.banner_section_title = banner_section_title;
      }
      if (banner_section_content !== undefined) {
        productPageData.banner_section_content = banner_section_content;
      }
      if (about_section_title !== undefined) {
        productPageData.about_section_title = about_section_title;
      }
      if (about_section_content !== undefined) {
        productPageData.about_section_content = about_section_content;
      }
      if (video_section_title !== undefined) {
        productPageData.video_section_title = video_section_title;
      }
      if (video_section_content !== undefined) {
        productPageData.video_section_content = video_section_content;
      }
      if (video_section_youtube_url !== undefined) {
        productPageData.video_section_youtube_url = video_section_youtube_url || null;
      }

      // Handle file uploads
      if (req.files) {
        if (req.files.banner_section_image) {
          const file = req.files.banner_section_image[0];
          if (existingPage.banner_section_image_url) {
            await deleteFromS3(existingPage.banner_section_image_url);
          }
          productPageData.banner_section_image_url = await uploadToS3(file, `tenant_${tenantId}/product_page_banners`);
          safeUnlink(file.path);
        }
        if (req.files.about_section_image) {
          const file = req.files.about_section_image[0];
          if (existingPage.about_section_image_url) {
            await deleteFromS3(existingPage.about_section_image_url);
          }
          productPageData.about_section_image_url = await uploadToS3(file, `tenant_${tenantId}/product_page_about`);
          safeUnlink(file.path);
        }
        if (req.files.video_section_file) {
          const file = req.files.video_section_file[0];
          if (existingPage.video_section_file_url && !video_section_youtube_url) {
            await deleteFromS3(existingPage.video_section_file_url);
          }
          productPageData.video_section_file_url = await uploadToS3(file, `tenant_${tenantId}/product_page_videos`);
          safeUnlink(file.path);
        }
      }

      // Only update if there's something to update
      if (Object.keys(productPageData).length > 0) {
        await db.update("tbl_product_page", productPageData, `tenant_id = ${tenantId}`);
      }

      res.json({ 
        message: "Product page updated successfully", 
        data: productPageData 
      });
    } catch (err) {
      console.error("Error in UpdateProductPage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Get Product Page
const GetProductPage = async (req, res) => {
  const { tenantId } = req.params;
  
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const page = await db.select("tbl_product_page", "*", `tenant_id = ${tenantId}`);
    
    if (!page) {
      return res.status(200).json({});
    }
    
    res.json(page);
  } catch (err) {
    console.error("Error in GetProductPage:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Delete Product Page
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

    // Delete all associated images/videos from S3
    if (page.banner_section_image_url) {
      await deleteFromS3(page.banner_section_image_url);
    }
    if (page.about_section_image_url) {
      await deleteFromS3(page.about_section_image_url);
    }
    if (page.video_section_file_url && !page.video_section_youtube_url) {
      await deleteFromS3(page.video_section_file_url);
    }

    await db.delete("tbl_product_page", `tenant_id = ${tenantId}`);
    res.json({ message: "Product page deleted successfully" });
  } catch (err) {
    console.error("Error in DeleteProductPage:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddProductPage,
  GetProductPage,
  UpdateProductPage,
  DeleteProductPage,
};