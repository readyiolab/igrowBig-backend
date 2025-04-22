const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");

// Configure Multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(__dirname, "../uploads/temp");
    try {
      await fs.mkdir(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (err) {
      cb(err);
    }
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
      return cb(new Error("Banner image must be JPEG/JPG/PNG"));
    }
    cb(null, true);
  },
}).single("joinus_image_banner");

const safeUnlink = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    console.warn(`Failed to delete file ${filePath}: ${err.message}`);
  }
};

// Add or Update Join Us Page
const AddOrUpdateJoinUsPage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err.message);
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const { image_banner_content, section_content_1, section_content_2, section_content_3 } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingPageResult = await db.select("tbl_joinus_page", "*", `tenant_id = ${tenantId}`);
      const existingPage = Array.isArray(existingPageResult) ? existingPageResult[0] : existingPageResult;

      const folder = `joinus/tenant_${tenantId}`;
      let joinusImageBannerUrl = existingPage?.joinus_image_banner_url || null;

      if (req.file) {
        if (existingPage?.joinus_image_banner_url) {
          await deleteFromS3(existingPage.joinus_image_banner_url);
        }
        joinusImageBannerUrl = await uploadToS3(req.file, folder);
        await safeUnlink(req.file.path);
      }

      const pageData = {
        tenant_id: tenantId,
        joinus_image_banner_url: joinusImageBannerUrl,
        image_banner_content: image_banner_content || existingPage?.image_banner_content || null,
        section_content_1: section_content_1 || existingPage?.section_content_1 || null,
        section_content_2: section_content_2 || existingPage?.section_content_2 || null,
        section_content_3: section_content_3 || existingPage?.section_content_3 || null,
      };

      if (existingPage) {
        await db.update("tbl_joinus_page", pageData, `tenant_id = ${tenantId}`);
        return res.status(200).json({ message: "Join Us page updated", page_id: existingPage.id });
      }

      const result = await db.insert("tbl_joinus_page", pageData);
      return res.status(201).json({ message: "Join Us page created", page_id: result.insert_id });
    } catch (err) {
      console.error("Error in AddOrUpdateJoinUsPage:", err);
      return res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Get Join Us Page
const GetJoinUsPage = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const pageResult = await db.select("tbl_joinus_page", "*", `tenant_id = ${tenantId}`);
    const page = Array.isArray(pageResult) ? pageResult[0] : pageResult || {};
    return res.status(200).json(page);
  } catch (err) {
    console.error("Error in GetJoinUsPage:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Delete Join Us Page
const DeleteJoinUsPage = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const pageResult = await db.select("tbl_joinus_page", "*", `tenant_id = ${tenantId}`);
    const page = Array.isArray(pageResult) ? pageResult[0] : pageResult;
    if (!page) {
      return res.status(200).json({ message: "No Join Us page to delete" });
    }

    if (page.joinus_image_banner_url) {
      try {
        await deleteFromS3(page.joinus_image_banner_url);
      } catch (s3Err) {
        console.warn(`Failed to delete S3 file: ${s3Err.message}`);
      }
    }

    await db.delete("tbl_joinus_page", `tenant_id = ${tenantId}`);
    return res.status(200).json({ message: "Join Us page deleted" });
  } catch (err) {
    console.error("Error in DeleteJoinUsPage:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddOrUpdateJoinUsPage,
  GetJoinUsPage,
  DeleteJoinUsPage,
};