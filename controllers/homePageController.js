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

// ✅ DEFAULT VALUES for required fields
const getDefaultValues = () => ({
  // Hero Section (Slider Banner)
  hero_section_title: "Welcome to NHT Global",
  hero_section_content: "Transform your life with our opportunity",
  
  // Welcome Section
  welcome_section_title: "Welcome",
  welcome_section_content: "Welcome to our platform where dreams become reality",
  
  // About NHT Global Section
  about_section_title: "About NHT Global",
  about_section_content: "Learn about our company and mission",
  
  // History of NHT Global Section
  history_section_title: "History of NHT Global",
  history_section_content: "Discover our journey and legacy",
  
  // Video Section
  video_section_title: "Watch NHT Global Video",
  video_section_youtube_url: "",
  
  // How Get Dream Life Can Help Section
  help_section_title: "How Get Dream Life Can Help",
  help_section_content: "Discover how we can help you achieve your dreams",
});

// Add Home Page
const AddHomePage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const {
      // Hero Section
      hero_section_title,
      hero_section_content,
      
      // Welcome Section
      welcome_section_title,
      welcome_section_content,
      
      // About Section
      about_section_title,
      about_section_content,
      
      // History Section
      history_section_title,
      history_section_content,
      
      // Video Section
      video_section_title,
      video_section_youtube_url,
      
      // Help Section
      help_section_title,
      help_section_content,
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
        
        // Hero Section
        hero_section_title,
        hero_section_content,
        
        // Welcome Section
        welcome_section_title,
        welcome_section_content,
        
        // About Section
        about_section_title,
        about_section_content,
        
        // History Section
        history_section_title,
        history_section_content,
        
        // Video Section
        video_section_title,
        video_section_youtube_url: video_section_youtube_url || null,
        
        // Help Section
        help_section_title,
        help_section_content,
      };

      // Handle file uploads
      if (req.files) {
        if (req.files.hero_banner_image) {
          const file = req.files.hero_banner_image[0];
          homePageData.hero_banner_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_hero_banners`);
          safeUnlink(file.path);
        }
        if (req.files.welcome_section_image) {
          const file = req.files.welcome_section_image[0];
          homePageData.welcome_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_welcome`);
          safeUnlink(file.path);
        }
        if (req.files.about_section_image) {
          const file = req.files.about_section_image[0];
          homePageData.about_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_about`);
          safeUnlink(file.path);
        }
        if (req.files.history_section_image) {
          const file = req.files.history_section_image[0];
          homePageData.history_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_history`);
          safeUnlink(file.path);
        }
        if (req.files.video_section_file) {
          const file = req.files.video_section_file[0];
          homePageData.video_section_file_url = await uploadToS3(file, `tenant_${tenantId}/homepage_videos`);
          safeUnlink(file.path);
        }
        if (req.files.help_section_image) {
          const file = req.files.help_section_image[0];
          homePageData.help_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_help`);
          safeUnlink(file.path);
        }
      }

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

// ✅ UPDATED: Update Home Page (Smart Partial Updates)
const UpdateHomePage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const {
      // Hero Section
      hero_section_title,
      hero_section_content,
      
      // Welcome Section
      welcome_section_title,
      welcome_section_content,
      
      // About Section
      about_section_title,
      about_section_content,
      
      // History Section
      history_section_title,
      history_section_content,
      
      // Video Section
      video_section_title,
      video_section_youtube_url,
      
      // Help Section
      help_section_title,
      help_section_content,
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
          
          // Hero Section
          hero_section_title: hero_section_title || defaults.hero_section_title,
          hero_section_content: hero_section_content || defaults.hero_section_content,
          
          // Welcome Section
          welcome_section_title: welcome_section_title || defaults.welcome_section_title,
          welcome_section_content: welcome_section_content || defaults.welcome_section_content,
          
          // About Section
          about_section_title: about_section_title || defaults.about_section_title,
          about_section_content: about_section_content || defaults.about_section_content,
          
          // History Section
          history_section_title: history_section_title || defaults.history_section_title,
          history_section_content: history_section_content || defaults.history_section_content,
          
          // Video Section
          video_section_title: video_section_title || defaults.video_section_title,
          video_section_youtube_url: video_section_youtube_url || null,
          
          // Help Section
          help_section_title: help_section_title || defaults.help_section_title,
          help_section_content: help_section_content || defaults.help_section_content,
        };

        // Handle file uploads for new record
        if (req.files) {
          if (req.files.hero_banner_image) {
            const file = req.files.hero_banner_image[0];
            homePageData.hero_banner_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_hero_banners`);
            safeUnlink(file.path);
          }
          if (req.files.welcome_section_image) {
            const file = req.files.welcome_section_image[0];
            homePageData.welcome_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_welcome`);
            safeUnlink(file.path);
          }
          if (req.files.about_section_image) {
            const file = req.files.about_section_image[0];
            homePageData.about_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_about`);
            safeUnlink(file.path);
          }
          if (req.files.history_section_image) {
            const file = req.files.history_section_image[0];
            homePageData.history_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_history`);
            safeUnlink(file.path);
          }
          if (req.files.video_section_file) {
            const file = req.files.video_section_file[0];
            homePageData.video_section_file_url = await uploadToS3(file, `tenant_${tenantId}/homepage_videos`);
            safeUnlink(file.path);
          }
          if (req.files.help_section_image) {
            const file = req.files.help_section_image[0];
            homePageData.help_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_help`);
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

      // Hero Section
      if (hero_section_title !== undefined) homePageData.hero_section_title = hero_section_title;
      if (hero_section_content !== undefined) homePageData.hero_section_content = hero_section_content;
      
      // Welcome Section
      if (welcome_section_title !== undefined) homePageData.welcome_section_title = welcome_section_title;
      if (welcome_section_content !== undefined) homePageData.welcome_section_content = welcome_section_content;
      
      // About Section
      if (about_section_title !== undefined) homePageData.about_section_title = about_section_title;
      if (about_section_content !== undefined) homePageData.about_section_content = about_section_content;
      
      // History Section
      if (history_section_title !== undefined) homePageData.history_section_title = history_section_title;
      if (history_section_content !== undefined) homePageData.history_section_content = history_section_content;
      
      // Video Section
      if (video_section_title !== undefined) homePageData.video_section_title = video_section_title;
      if (video_section_youtube_url !== undefined) homePageData.video_section_youtube_url = video_section_youtube_url || null;
      
      // Help Section
      if (help_section_title !== undefined) homePageData.help_section_title = help_section_title;
      if (help_section_content !== undefined) homePageData.help_section_content = help_section_content;

      // Handle file uploads
      if (req.files) {
        if (req.files.hero_banner_image) {
          const file = req.files.hero_banner_image[0];
          if (existingPage.hero_banner_image_url) {
            await deleteFromS3(existingPage.hero_banner_image_url);
          }
          homePageData.hero_banner_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_hero_banners`);
          safeUnlink(file.path);
        }
        if (req.files.welcome_section_image) {
          const file = req.files.welcome_section_image[0];
          if (existingPage.welcome_section_image_url) {
            await deleteFromS3(existingPage.welcome_section_image_url);
          }
          homePageData.welcome_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_welcome`);
          safeUnlink(file.path);
        }
        if (req.files.about_section_image) {
          const file = req.files.about_section_image[0];
          if (existingPage.about_section_image_url) {
            await deleteFromS3(existingPage.about_section_image_url);
          }
          homePageData.about_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_about`);
          safeUnlink(file.path);
        }
        if (req.files.history_section_image) {
          const file = req.files.history_section_image[0];
          if (existingPage.history_section_image_url) {
            await deleteFromS3(existingPage.history_section_image_url);
          }
          homePageData.history_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_history`);
          safeUnlink(file.path);
        }
        if (req.files.video_section_file) {
          const file = req.files.video_section_file[0];
          // Delete old video if it exists and is not a YouTube link
          if (existingPage.video_section_file_url && !video_section_youtube_url) {
            await deleteFromS3(existingPage.video_section_file_url);
          }
          homePageData.video_section_file_url = await uploadToS3(file, `tenant_${tenantId}/homepage_videos`);
          safeUnlink(file.path);
        }
        if (req.files.help_section_image) {
          const file = req.files.help_section_image[0];
          if (existingPage.help_section_image_url) {
            await deleteFromS3(existingPage.help_section_image_url);
          }
          homePageData.help_section_image_url = await uploadToS3(file, `tenant_${tenantId}/homepage_help`);
          safeUnlink(file.path);
        }
      }

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