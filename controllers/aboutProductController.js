const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3 } = require("../services/awsS3");

// Configure multer for temporary local storage (cleaned up after S3 upload)
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
  { name: "banner_image", maxCount: 1 },
  { name: "video_file", maxCount: 1 },
]);

const UpdateAboutProductPage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId } = req.params;
    const { banner_content, about_products, video_header_title, video_overview, youtube_link } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      if (!video_header_title) {
        return res.status(400).json({
          error: "MISSING_FIELD",
          message: "Video header title is required",
        });
      }

      const folder = `about-product/${tenantId}`;
      const updateData = {
        banner_content: banner_content || null,
        about_products: about_products || null,
        video_header_title,
        video_overview: video_overview || null,
        youtube_link: youtube_link || null,
      };

      if (req.files["banner_image"]) {
        updateData.banner_image_url = await uploadToS3(req.files["banner_image"][0], folder);
      }
      if (req.files["video_file"]) {
        if (path.extname(req.files["video_file"][0].originalname).toLowerCase() !== ".mp4") {
          return res.status(400).json({
            error: "INVALID_FILE",
            message: "Video must be in MP4 format",
          });
        }
        updateData.video_file_url = await uploadToS3(req.files["video_file"][0], folder);
      }

      const existingPage = await db.select("tbl_about_product_pages", "*", `tenant_id = ${tenantId}`);
      if (existingPage) {
        await db.update("tbl_about_product_pages", updateData, `tenant_id = ${tenantId}`);
        res.json({ message: "About Product page updated" });
      } else {
        updateData.tenant_id = tenantId;
        const result = await db.insert("tbl_about_product_pages", updateData);
        res.status(201).json({
          message: "About Product page created",
          page_id: result.insert_id,
        });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

const GetAboutProductPage = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const page = await db.select("tbl_about_product_pages", "*", `tenant_id = ${tenantId}`);
    if (!page) {
      return res.status(404).json({
        error: "PAGE_NOT_FOUND",
        message: "About Product page not found",
      });
    }
    res.json(page);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  UpdateAboutProductPage,
  GetAboutProductPage,
};