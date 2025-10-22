const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");
require("dotenv").config();

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
      case "introduction_image":
        subFolder = "homepage_introduction";
        break;
      case "about_company_image":
        subFolder = "homepage_about";
        break;
      case "opportunity_video":
        subFolder = "homepage_opportunity";
        break;
      default:
        subFolder = "homepage_misc";
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
  { name: "introduction_image", maxCount: 1 },
  { name: "about_company_image", maxCount: 1 },
  { name: "opportunity_video", maxCount: 1 },
]);

// ✅ DEFAULT VALUES for required fields
const getDefaultValues = () => ({
  welcome_description: "Welcome to our platform",
  introduction_content: "Learn more about our opportunity",
  about_company_title: "About Our Company",
  about_company_content_1: "We are committed to excellence",
  about_company_content_2: "",
  why_network_marketing_title: "Why Network Marketing",
  why_network_marketing_content: "Discover the benefits of network marketing",
  opportunity_video_header_title: "Watch Our Opportunity Video",
  opportunity_video_url: "",
  support_content: "Contact us for support",
});

// Add Home Page
const AddHomePage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const {
      welcome_description,
      introduction_content,
      about_company_title,
      about_company_content_1,
      about_company_content_2,
      why_network_marketing_title,
      why_network_marketing_content,
      opportunity_video_header_title,
      youtube_link,
      support_content,
    } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingPage = await db.select("tbl_home_pages", "*", `tenant_id = ${tenantId}`);
      if (existingPage) {
        return res.status(400).json({
          error: "PAGE_EXISTS",
          message: "Home page already exists for this tenant. Use update instead.",
        });
      }

      const homePageData = {
        tenant_id: tenantId,
        welcome_description,
        introduction_content,
        about_company_title,
        about_company_content_1,
        about_company_content_2: about_company_content_2 || null,
        why_network_marketing_title,
        why_network_marketing_content,
        opportunity_video_header_title,
        opportunity_video_url: youtube_link || null,
        support_content,
      };

      if (req.files) {
        if (req.files.introduction_image) {
          const file = req.files.introduction_image[0];
          homePageData.introduction_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_introduction`);
          safeUnlink(file.path);
        }
        if (req.files.about_company_image) {
          const file = req.files.about_company_image[0];
          homePageData.about_company_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_about`);
          safeUnlink(file.path);
        }
        if (req.files.opportunity_video) {
          const file = req.files.opportunity_video[0];
          homePageData.opportunity_video_url = await uploadToS3(file, `tenant_${tenantId}/homepage_opportunity`);
          safeUnlink(file.path);
        }
      }

      const result = await db.insert("tbl_home_pages", homePageData);
      res.status(201).json({ message: "Home page added", page_id: result.insert_id });
    } catch (err) {
      console.error("Error in AddHomePage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// ✅ UPDATED: Update Home Page (Smart Partial Updates)
const UpdateHomePage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const {
      welcome_description,
      introduction_content,
      about_company_title,
      about_company_content_1,
      about_company_content_2,
      why_network_marketing_title,
      why_network_marketing_content,
      opportunity_video_header_title,
      youtube_link,
      support_content,
    } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingPage = await db.select("tbl_home_pages", "*", `tenant_id = ${tenantId}`);
      
      // ✅ IF NO PAGE EXISTS, CREATE ONE WITH DEFAULTS
      if (!existingPage) {
        const defaults = getDefaultValues();
        const homePageData = {
          tenant_id: tenantId,
          // Use provided values OR defaults (never empty/null for required fields)
          welcome_description: welcome_description || defaults.welcome_description,
          introduction_content: introduction_content || defaults.introduction_content,
          about_company_title: about_company_title || defaults.about_company_title,
          about_company_content_1: about_company_content_1 || defaults.about_company_content_1,
          about_company_content_2: about_company_content_2 || null,
          why_network_marketing_title: why_network_marketing_title || defaults.why_network_marketing_title,
          why_network_marketing_content: why_network_marketing_content || defaults.why_network_marketing_content,
          opportunity_video_header_title: opportunity_video_header_title || defaults.opportunity_video_header_title,
          opportunity_video_url: youtube_link || null,
          support_content: support_content || defaults.support_content,
        };

        // Handle file uploads for new record
        if (req.files) {
          if (req.files.introduction_image) {
            const file = req.files.introduction_image[0];
            homePageData.introduction_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_introduction`);
            safeUnlink(file.path);
          }
          if (req.files.about_company_image) {
            const file = req.files.about_company_image[0];
            homePageData.about_company_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_about`);
            safeUnlink(file.path);
          }
          if (req.files.opportunity_video) {
            const file = req.files.opportunity_video[0];
            homePageData.opportunity_video_url = await uploadToS3(file, `tenant_${tenantId}/homepage_opportunity`);
            safeUnlink(file.path);
          }
        }

        const result = await db.insert("tbl_home_pages", homePageData);
        return res.status(201).json({ 
          message: "Home page created successfully", 
          page_id: result.insert_id,
          data: homePageData 
        });
      }

      // ✅ PAGE EXISTS - SMART UPDATE (only update fields that are provided)
      const homePageData = {};

      // Only update fields that are actually provided in the request
      if (welcome_description !== undefined) homePageData.welcome_description = welcome_description;
      if (introduction_content !== undefined) homePageData.introduction_content = introduction_content;
      if (about_company_title !== undefined) homePageData.about_company_title = about_company_title;
      if (about_company_content_1 !== undefined) homePageData.about_company_content_1 = about_company_content_1;
      if (about_company_content_2 !== undefined) homePageData.about_company_content_2 = about_company_content_2 || null;
      if (why_network_marketing_title !== undefined) homePageData.why_network_marketing_title = why_network_marketing_title;
      if (why_network_marketing_content !== undefined) homePageData.why_network_marketing_content = why_network_marketing_content;
      if (opportunity_video_header_title !== undefined) homePageData.opportunity_video_header_title = opportunity_video_header_title;
      if (youtube_link !== undefined) homePageData.opportunity_video_url = youtube_link || null;
      if (support_content !== undefined) homePageData.support_content = support_content;

      // Handle file uploads
      if (req.files) {
        if (req.files.introduction_image) {
          const file = req.files.introduction_image[0];
          if (existingPage.introduction_image_url) {
            await deleteFromS3(existingPage.introduction_image_url);
          }
          homePageData.introduction_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_introduction`);
          safeUnlink(file.path);
        }
        if (req.files.about_company_image) {
          const file = req.files.about_company_image[0];
          if (existingPage.about_company_image_url) {
            await deleteFromS3(existingPage.about_company_image_url);
          }
          homePageData.about_company_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_about`);
          safeUnlink(file.path);
        }
        if (req.files.opportunity_video) {
          const file = req.files.opportunity_video[0];
          if (existingPage.opportunity_video_url && !youtube_link && !existingPage.opportunity_video_url.includes("youtube")) {
            await deleteFromS3(existingPage.opportunity_video_url);
          }
          homePageData.opportunity_video_url = await uploadToS3(file, `tenant_${tenantId}/homepage_opportunity`);
          safeUnlink(file.path);
        }
      }

      // Only update if there's something to update
      if (Object.keys(homePageData).length > 0) {
        await db.update("tbl_home_pages", homePageData, `tenant_id = ${tenantId}`);
      }

      res.json({ message: "Home page updated successfully", data: homePageData });
    } catch (err) {
      console.error("Error in UpdateHomePage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Get Home Page
const GetHomePage = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const page = await db.select("tbl_home_pages", "*", `tenant_id = ${tenantId}`);
    if (!page) {
      return res.status(200).json({});
    }
    res.json(page);
  } catch (err) {
    console.error("Error in GetHomePage:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddHomePage,
  UpdateHomePage,
  GetHomePage,
};