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

// Multer configuration
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for all files
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "banner_image" || file.fieldname === "page_image") {
      const filetypes = /jpeg|jpg|png/;
      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = filetypes.test(file.mimetype);
      if (!extname || !mimetype) {
        return cb(new Error("Banner and page images must be JPEG/JPG/PNG"));
      }
      if (file.size > 4 * 1024 * 1024) {
        return cb(new Error("Banner and page images must be 4MB or less"));
      }
    } else if (file.fieldname === "video_section") {
      if (file.mimetype !== "video/mp4") {
        return cb(new Error("Video must be in MP4 format"));
      }
      if (file.size > 50 * 1024 * 1024) {
        return cb(new Error("Video must be 50MB or less"));
      }
    } else if (file.fieldname === "plan_document") {
      if (file.mimetype !== "application/pdf") {
        return cb(new Error("Plan document must be a PDF"));
      }
      if (file.size > 4 * 1024 * 1024) {
        return cb(new Error("Plan document must be 4MB or less"));
      }
    }
    cb(null, true);
  },
}).fields([
  { name: "banner_image", maxCount: 1 },
  { name: "page_image", maxCount: 1 },
  { name: "video_section", maxCount: 1 },
  { name: "plan_document", maxCount: 1 },
]);

// Add or Update Opportunity Page
const AddOrUpdateOpportunityPage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId } = req.params;
    const { banner_content, welcome_message, page_content, header_title, video_section_link, update_type } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const folder = `opportunity/tenant_${tenantId}`;
      // Fetch existing page, handle non-array or null result
      const result = await db.select("tbl_opportunity_page", "*", `tenant_id = ${tenantId}`);
      const existingPage = Array.isArray(result) ? result[0] : result || null;

      // Helper function to safely delete local file
      const safeUnlink = (filePath) => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (unlinkErr) {
          console.warn(`Failed to delete file ${filePath}: ${unlinkErr.message}`);
        }
      };

      let bannerImageUrl = existingPage?.banner_image_url || null;
      if (req.files?.["banner_image"]) {
        if (existingPage?.banner_image_url) await deleteFromS3(existingPage.banner_image_url);
        bannerImageUrl = await uploadToS3(req.files["banner_image"][0], folder);
        safeUnlink(req.files["banner_image"][0].path);
      }

      let pageImageUrl = existingPage?.page_image_url || null;
      if (req.files?.["page_image"]) {
        if (existingPage?.page_image_url) await deleteFromS3(existingPage.page_image_url);
        pageImageUrl = await uploadToS3(req.files["page_image"][0], folder);
        safeUnlink(req.files["page_image"][0].path);
      }

      let videoSectionUrl = video_section_link || existingPage?.video_section_link || null;
      if (req.files?.["video_section"]) {
        if (existingPage?.video_section_link && !video_section_link && !existingPage.video_section_link?.includes("youtube")) {
          await deleteFromS3(existingPage.video_section_link);
        }
        videoSectionUrl = await uploadToS3(req.files["video_section"][0], folder);
        safeUnlink(req.files["video_section"][0].path);
      }

      let planDocumentUrl = existingPage?.plan_document_url || null;
      if (req.files?.["plan_document"]) {
        if (existingPage?.plan_document_url) await deleteFromS3(existingPage.plan_document_url);
        planDocumentUrl = await uploadToS3(req.files["plan_document"][0], folder);
        safeUnlink(req.files["plan_document"][0].path);
      }

      // If update_type is plan_document_only, only update the plan document
      if (update_type === "plan_document_only") {
        if (!existingPage) {
          const pageData = { tenant_id: tenantId, plan_document_url: planDocumentUrl };
          const result = await db.insert("tbl_opportunity_page", pageData);
          return res.status(201).json({ message: "Plan document created", page_id: result.insert_id });
        }
        await db.update(
          "tbl_opportunity_page",
          { plan_document_url: planDocumentUrl },
          `tenant_id = ${tenantId}`
        );
        return res.status(200).json({ message: "Plan document updated" });
      }

      // Full page update or creation
      const pageData = {
        tenant_id: tenantId,
        banner_image_url: bannerImageUrl,
        banner_content: banner_content || existingPage?.banner_content || null,
        welcome_message: welcome_message || existingPage?.welcome_message || null,
        page_content: page_content || existingPage?.page_content || null,
        page_image_url: pageImageUrl,
        header_title: header_title || existingPage?.header_title || "NHT Global Compensation Plan",
        video_section_link: videoSectionUrl,
        plan_document_url: planDocumentUrl,
      };

      if (existingPage) {
        await db.update("tbl_opportunity_page", pageData, `tenant_id = ${tenantId}`);
        res.status(200).json({ message: "Opportunity page updated", page_id: existingPage.id });
      } else {
        const result = await db.insert("tbl_opportunity_page", pageData);
        res.status(201).json({ message: "Opportunity page created", page_id: result.insert_id });
      }
    } catch (err) {
      console.error("Error in AddOrUpdateOpportunityPage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Get Opportunity Page
const GetOpportunityPage = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const result = await db.select("tbl_opportunity_page", "*", `tenant_id = ${tenantId}`);
    const page = Array.isArray(result) ? result[0] : result || null;
    if (!page) {
      return res.status(200).json({});
    }
    res.status(200).json(page);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Delete Opportunity Page
const DeleteOpportunityPage = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const result = await db.select("tbl_opportunity_page", "*", `tenant_id = ${tenantId}`);
    const page = Array.isArray(result) ? result[0] : result || null;
    if (!page) {
      return res.status(200).json({ message: "No opportunity page to delete" });
    }

    const filesToDelete = [
      page.banner_image_url,
      page.page_image_url,
      page.video_section_link && !page.video_section_link.includes("youtube") ? page.video_section_link : null,
      page.plan_document_url,
    ].filter(Boolean);

    for (const fileUrl of filesToDelete) {
      await deleteFromS3(fileUrl);
    }

    await db.delete("tbl_opportunity_page", `tenant_id = ${tenantId}`);
    res.status(200).json({ message: "Opportunity page deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddOrUpdateOpportunityPage,
  GetOpportunityPage,
  DeleteOpportunityPage,
};