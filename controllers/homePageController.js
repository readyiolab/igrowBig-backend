const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3"); // Adjust path as needed
require("dotenv").config();

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

      if (
        !welcome_description ||
        !introduction_content ||
        !about_company_title ||
        !about_company_content_1 ||
        !why_network_marketing_title ||
        !why_network_marketing_content ||
        !opportunity_video_header_title ||
        !support_content
      ) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "All required fields must be provided",
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

      // Handle file uploads to S3
      if (req.files) {
        if (req.files.introduction_image) {
          const file = req.files.introduction_image[0];
          homePageData.introduction_image_url = await uploadToS3(file, "homepage_introduction");
        }
        if (req.files.about_company_image) {
          const file = req.files.about_company_image[0];
          homePageData.about_company_image_url = await uploadToS3(file, "homepage_about");
        }
        if (req.files.opportunity_video) {
          const file = req.files.opportunity_video[0];
          homePageData.opportunity_video_url = await uploadToS3(file, "homepage_opportunity");
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

// Update Home Page
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

    console.log("Request Headers:", req.headers);
    console.log("Tenant ID:", tenantId);
    if (!checkTenantAuth(req, tenantId)) {
      console.log("checkTenantAuth failed");
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingPage = await db.select("tbl_home_pages", "*", `tenant_id = ${tenantId}`);
      const homePageData = {
        welcome_description: welcome_description || existingPage?.welcome_description || "Default welcome",
        introduction_content: introduction_content || existingPage?.introduction_content || "Default introduction",
        about_company_title: about_company_title || existingPage?.about_company_title || "About Us",
        about_company_content_1: about_company_content_1 || existingPage?.about_company_content_1 || "Default content",
        about_company_content_2: about_company_content_2 || existingPage?.about_company_content_2 || null,
        why_network_marketing_title: why_network_marketing_title || existingPage?.why_network_marketing_title || "Why Network Marketing",
        why_network_marketing_content: why_network_marketing_content || existingPage?.why_network_marketing_content || "Default why content",
        opportunity_video_header_title: opportunity_video_header_title || existingPage?.opportunity_video_header_title || "Opportunity Video",
        opportunity_video_url: youtube_link || existingPage?.opportunity_video_url || null,
        support_content: support_content || existingPage?.support_content || "Default support",
      };

      // Handle file uploads to S3 and delete old files if replaced
      if (req.files) {
        if (req.files.introduction_image) {
          const file = req.files.introduction_image[0];
          if (existingPage?.introduction_image_url) {
            await deleteFromS3(existingPage.introduction_image_url);
          }
          homePageData.introduction_image_url = await uploadToS3(file, "homepage_introduction");
        }
        if (req.files.about_company_image) {
          const file = req.files.about_company_image[0];
          if (existingPage?.about_company_image_url) {
            await deleteFromS3(existingPage.about_company_image_url);
          }
          homePageData.about_company_image_url = await uploadToS3(file, "homepage_about");
        }
        if (req.files.opportunity_video) {
          const file = req.files.opportunity_video[0];
          if (existingPage?.opportunity_video_url && !youtube_link) {
            await deleteFromS3(existingPage.opportunity_video_url);
          }
          homePageData.opportunity_video_url = await uploadToS3(file, "homepage_opportunity");
        }
      }

      if (existingPage) {
        await db.update("tbl_home_pages", homePageData, `tenant_id = ${tenantId}`);
        res.json({ message: "Home page updated", data: homePageData });
      } else {
        homePageData.tenant_id = tenantId;
        const result = await db.insert("tbl_home_pages", homePageData);
        res.status(201).json({ message: "Home page created", page_id: result.insert_id });
      }
    } catch (err) {
      console.error("Error in UpdateHomePage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Get Home Page
// const GetHomePage = async (req, res) => {
//   const { tenantId } = req.params;
//   if (!checkTenantAuth(req, tenantId)) {
//     return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
//   }

//   try {
//     const page = await db.select("tbl_home_pages", "*", `tenant_id = ${tenantId}`);
//     if (!page) {
//       return res.status(404).json({ error: "PAGE_NOT_FOUND", message: "Home page not found" });
//     }
//     res.json(page);
//   } catch (err) {
//     console.error("Error in GetHomePage:", err);
//     res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
//   }
// };

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