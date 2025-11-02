const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");
const { getDefaultHomePageData } = require("../utils/defaultPagesData"); // ✅ IMPORT DEFAULT DATA
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
    
    // Map field names to appropriate folders
    switch (file.fieldname) {
      case "hero_banner_image":
        subFolder = "homepage_hero_banners";
        break;
      case "welcome_section_image":
        subFolder = "homepage_welcome";
        break;
      case "about_section_image":
        subFolder = "homepage_about";
        break;
      case "history_section_image":
        subFolder = "homepage_history";
        break;
      case "video_section_file":
        subFolder = "homepage_videos";
        break;
      case "help_section_image":
        subFolder = "homepage_help";
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
    
    // Image size validation
    if (["image/jpeg", "image/jpg", "image/png"].includes(file.mimetype) && file.size > 4 * 1024 * 1024) {
      return cb(new Error("Image files must be 4MB or less"));
    }
    
    // Video size validation
    if (file.mimetype === "video/mp4" && file.size > 50 * 1024 * 1024) {
      return cb(new Error("MP4 files must be 50MB or less"));
    }
    
    cb(null, true);
  },
}).fields([
  { name: "hero_banner_image", maxCount: 1 },
  { name: "welcome_section_image", maxCount: 1 },
  { name: "about_section_image", maxCount: 1 },
  { name: "history_section_image", maxCount: 1 },
  { name: "video_section_file", maxCount: 1 },
  { name: "help_section_image", maxCount: 1 },
]);

// ✅ Helper function to handle file uploads
const handleFileUploads = async (req, tenantId, existingPage = null) => {
  const uploadedFiles = {};
  
  if (!req.files) return uploadedFiles;

  const fileFields = [
    { field: "hero_banner_image", folder: "homepage_hero_banners", existingUrl: "hero_banner_image_url" },
    { field: "welcome_section_image", folder: "homepage_welcome", existingUrl: "welcome_section_image_url" },
    { field: "about_section_image", folder: "homepage_about", existingUrl: "about_section_image_url" },
    { field: "history_section_image", folder: "homepage_history", existingUrl: "history_section_image_url" },
    { field: "video_section_file", folder: "homepage_videos", existingUrl: "video_section_file_url" },
    { field: "help_section_image", folder: "homepage_help", existingUrl: "help_section_image_url" },
  ];

  for (const { field, folder, existingUrl } of fileFields) {
    if (req.files[field]) {
      const file = req.files[field][0];
      
      // Delete old file if updating
      if (existingPage && existingPage[existingUrl]) {
        await deleteFromS3(existingPage[existingUrl]);
      }
      
      // Upload new file
      uploadedFiles[existingUrl] = await uploadToS3(file, `tenant_${tenantId}/${folder}`);
      safeUnlink(file.path);
    }
  }

  return uploadedFiles;
};

// ✅ Add Home Page (Creates only if doesn't exist)
const AddHomePage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;

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

      // ✅ Get default values and merge with request body
      const defaults = getDefaultHomePageData();
      
      const homePageData = {
        tenant_id: tenantId,
        
        // Hero Section
        hero_section_title: req.body.hero_section_title || defaults.hero_section_title,
        hero_section_content: req.body.hero_section_content || defaults.hero_section_content,
        hero_banner_image_url: defaults.hero_banner_image_url,
        
        // Welcome Section
        welcome_section_title: req.body.welcome_section_title || defaults.welcome_section_title,
        welcome_section_content: req.body.welcome_section_content || defaults.welcome_section_content,
        welcome_section_image_url: defaults.welcome_section_image_url,
        
        // About Section
        about_section_title: req.body.about_section_title || defaults.about_section_title,
        about_section_content: req.body.about_section_content || defaults.about_section_content,
        about_section_image_url: defaults.about_section_image_url,
        
        // History Section
        history_section_title: req.body.history_section_title || defaults.history_section_title,
        history_section_content: req.body.history_section_content || defaults.history_section_content,
        history_section_image_url: defaults.history_section_image_url,
        
        // Video Section
        video_section_title: req.body.video_section_title || defaults.video_section_title,
        video_section_youtube_url: req.body.video_section_youtube_url || defaults.video_section_youtube_url,
        video_section_file_url: defaults.video_section_file_url,
        
        // Help Section
        help_section_title: req.body.help_section_title || defaults.help_section_title,
        help_section_content: req.body.help_section_content || defaults.help_section_content,
        help_section_image_url: defaults.help_section_image_url,
      };

      // ✅ Handle file uploads (will override default image URLs)
      const uploadedFiles = await handleFileUploads(req, tenantId);
      Object.assign(homePageData, uploadedFiles);

      const result = await db.insert("tbl_home_pages", homePageData);
      res.status(201).json({ 
        message: "Home page added successfully", 
        page_id: result.insert_id,
        data: homePageData 
      });
    } catch (err) {
      console.error("Error in AddHomePage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// ✅ OPTIMIZED: Update Home Page (Smart Partial Updates with Auto-Creation)
const UpdateHomePage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingPage = await db.select("tbl_home_pages", "*", `tenant_id = ${tenantId}`);
      
      // ✅ IF NO PAGE EXISTS, CREATE ONE WITH DEFAULTS
      if (!existingPage) {
        const defaults = getDefaultHomePageData();
        
        const homePageData = {
          tenant_id: tenantId,
          
          // Merge defaults with provided values
          hero_section_title: req.body.hero_section_title || defaults.hero_section_title,
          hero_section_content: req.body.hero_section_content || defaults.hero_section_content,
          hero_banner_image_url: defaults.hero_banner_image_url,
          
          welcome_section_title: req.body.welcome_section_title || defaults.welcome_section_title,
          welcome_section_content: req.body.welcome_section_content || defaults.welcome_section_content,
          welcome_section_image_url: defaults.welcome_section_image_url,
          
          about_section_title: req.body.about_section_title || defaults.about_section_title,
          about_section_content: req.body.about_section_content || defaults.about_section_content,
          about_section_image_url: defaults.about_section_image_url,
          
          history_section_title: req.body.history_section_title || defaults.history_section_title,
          history_section_content: req.body.history_section_content || defaults.history_section_content,
          history_section_image_url: defaults.history_section_image_url,
          
          video_section_title: req.body.video_section_title || defaults.video_section_title,
          video_section_youtube_url: req.body.video_section_youtube_url || defaults.video_section_youtube_url,
          video_section_file_url: defaults.video_section_file_url,
          
          help_section_title: req.body.help_section_title || defaults.help_section_title,
          help_section_content: req.body.help_section_content || defaults.help_section_content,
          help_section_image_url: defaults.help_section_image_url,
        };

        // Handle file uploads for new record
        const uploadedFiles = await handleFileUploads(req, tenantId);
        Object.assign(homePageData, uploadedFiles);

        const result = await db.insert("tbl_home_pages", homePageData);
        return res.status(201).json({ 
          message: "Home page created successfully", 
          page_id: result.insert_id,
          data: homePageData 
        });
      }

      // ✅ PAGE EXISTS - SMART UPDATE (only update fields that are provided)
      const homePageData = {};

      // Only update fields that are explicitly provided
      const textFields = [
        "hero_section_title", "hero_section_content",
        "welcome_section_title", "welcome_section_content",
        "about_section_title", "about_section_content",
        "history_section_title", "history_section_content",
        "video_section_title", "video_section_youtube_url",
        "help_section_title", "help_section_content"
      ];

      textFields.forEach(field => {
        if (req.body[field] !== undefined) {
          homePageData[field] = req.body[field] || null;
        }
      });

      // Handle file uploads (with old file deletion)
      const uploadedFiles = await handleFileUploads(req, tenantId, existingPage);
      Object.assign(homePageData, uploadedFiles);

      // Only update if there's something to update
      if (Object.keys(homePageData).length > 0) {
        await db.update("tbl_home_pages", homePageData, `tenant_id = ${tenantId}`);
      }

      res.json({ 
        message: "Home page updated successfully", 
        data: homePageData 
      });
    } catch (err) {
      console.error("Error in UpdateHomePage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// ✅ Get Home Page (Returns empty object if not found)
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