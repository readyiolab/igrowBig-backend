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
}).single("image");

const AddSliderBanner = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    console.log("AddBanner - req.body:", req.body);
    console.log("AddBanner - req.file:", req.file);

    const { tenantId } = req.params;
    const { text, image_url } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const folder = `slider-banners/tenant_${tenantId}`;
      let finalImageUrl = image_url?.trim() || null;

      if (!finalImageUrl && req.file) {
        finalImageUrl = await uploadToS3(req.file, folder);
      }

      if (!finalImageUrl) {
        return res.status(400).json({
          error: "MISSING_FIELD",
          message: "Either an image file or an image URL is required",
        });
      }

      const sliderData = {
        tenant_id: tenantId,
        image_url: finalImageUrl,
        description: text || null,
      };

      const result = await db.insert("tbl_slider_banners", sliderData);
      res.status(201).json({ message: "Slider banner added", banner_id: result.insert_id });
    } catch (err) {
      console.error("Error in AddSliderBanner:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Server error" });
    }
  });
};

const UpdateSliderBanner = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId, bannerId } = req.params;
    const { text, image_url } = req.body;

    console.log("UpdateBanner - tenantId:", tenantId, "bannerId:", bannerId);
    console.log("UpdateBanner - req.body:", req.body);
    console.log("UpdateBanner - req.file:", req.file);

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingBanner = await db.select(
        "tbl_slider_banners",
        "*",
        `id = ${bannerId} AND tenant_id = ${tenantId}`
      );

      console.log("UpdateBanner - existingBanner:", existingBanner);

      // Handle both single object and array cases
      const banner = Array.isArray(existingBanner)
        ? existingBanner[0]
        : existingBanner;

      if (!banner) {
        return res.status(404).json({
          error: "BANNER_NOT_FOUND",
          message: "Slider banner not found",
        });
      }

      const folder = `slider-banners/tenant_${tenantId}`;
      let finalImageUrl = banner.image_url;

      if (req.file) {
        if (banner.image_url && banner.image_url.includes("amazonaws.com")) {
          await deleteFromS3(banner.image_url);
        }
        finalImageUrl = await uploadToS3(req.file, folder);
      } else if (image_url?.trim()) {
        if (banner.image_url && banner.image_url.includes("amazonaws.com")) {
          await deleteFromS3(banner.image_url);
        }
        finalImageUrl = image_url.trim();
      }

      const updateData = {};
      if (text !== undefined) updateData.description = text;
      if (finalImageUrl !== banner.image_url) updateData.image_url = finalImageUrl;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "NO_DATA", message: "No data provided to update" });
      }

      await db.update(
        "tbl_slider_banners",
        updateData,
        `id = ${bannerId} AND tenant_id = ${tenantId}`
      );
      res.json({ message: "Slider banner updated" });
    } catch (err) {
      console.error("Error in UpdateSliderBanner:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Server error" });
    }
  });
};

const DeleteSliderBanner = async (req, res) => {
  const { tenantId, bannerId } = req.params;

  console.log("DeleteBanner - tenantId:", tenantId, "bannerId:", bannerId);

  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const banner = await db.select(
      "tbl_slider_banners",
      "*",
      `id = ${bannerId} AND tenant_id = ${tenantId}`
    );

    console.log("DeleteBanner - banner:", banner);

    // Handle both single object and array cases
    const bannerData = Array.isArray(banner) ? banner[0] : banner;

    if (!bannerData) {
      return res.status(404).json({
        error: "BANNER_NOT_FOUND",
        message: "Slider banner not found",
      });
    }

    if (bannerData.image_url && bannerData.image_url.includes("amazonaws.com")) {
      await deleteFromS3(bannerData.image_url);
    }

    await db.delete(
      "tbl_slider_banners",
      `id = ${bannerId} AND tenant_id = ${tenantId}`
    );
    res.json({ message: "Slider banner deleted" });
  } catch (err) {
    console.error("Error in DeleteSliderBanner:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Server error" });
  }
};

const GetSliderBanners = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const banners = await db.selectAll(
      "tbl_slider_banners",
      "*",
      `tenant_id = ${tenantId}`,
      "ORDER BY uploaded_on DESC"
    );
    console.log("GetSliderBanners - banners:", banners);
    res.json(
      banners.map((banner) => ({
        id: banner.id,
        image_url: banner.image_url,
        text: banner.description,
        created_at: banner.uploaded_on,
      }))
    );
  } catch (err) {
    console.error("Error in GetSliderBanners:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: err.message || "Server error" });
  }
};

module.exports = {
  AddSliderBanner,
  GetSliderBanners,
  UpdateSliderBanner,
  DeleteSliderBanner,
};