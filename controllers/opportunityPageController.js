const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");

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
      case "hero_section_image":
        subFolder = "opportunity_page_hero";
        break;
      case "door_section_image":
        subFolder = "opportunity_page_door";
        break;
      case "marketing_section_image":
        subFolder = "opportunity_page_marketing";
        break;
      case "business_model_section_image":
        subFolder = "opportunity_page_business";
        break;
      case "overview_section_video":
        subFolder = "opportunity_page_videos";
        break;
      case "compensation_plan_document":
        subFolder = "opportunity_page_documents";
        break;
      default:
        subFolder = "opportunity_page_misc";
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
    // Image validation
    if (["hero_section_image", "door_section_image", "marketing_section_image", "business_model_section_image"].includes(file.fieldname)) {
      const filetypes = /jpeg|jpg|png/;
      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = filetypes.test(file.mimetype);
      
      if (!extname || !mimetype) {
        return cb(new Error("Images must be JPEG/JPG/PNG format"));
      }
      if (file.size > 4 * 1024 * 1024) {
        return cb(new Error("Images must be 4MB or less"));
      }
    }
    // Video validation
    else if (file.fieldname === "overview_section_video") {
      if (file.mimetype !== "video/mp4") {
        return cb(new Error("Video must be in MP4 format"));
      }
      if (file.size > 50 * 1024 * 1024) {
        return cb(new Error("Video must be 50MB or less"));
      }
    }
    // PDF validation
    else if (file.fieldname === "compensation_plan_document") {
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
  { name: "hero_section_image", maxCount: 1 },
  { name: "door_section_image", maxCount: 1 },
  { name: "marketing_section_image", maxCount: 1 },
  { name: "business_model_section_image", maxCount: 1 },
  { name: "overview_section_video", maxCount: 1 },
  { name: "compensation_plan_document", maxCount: 1 },
]);

// ✅ DEFAULT VALUES for required fields
const getDefaultValues = () => ({
  // Hero Section
  hero_section_content: "Welcome to Your Opportunity",
  
  // Description Section
  description_section_content: "Discover the opportunity that can change your life",
  
  // Door of Opportunity Section
  door_section_title: "Open the Door of Opportunity",
  door_section_content: "Take the first step towards financial freedom",
  
  // Why Network Marketing Section
  marketing_section_title: "Why Network Marketing",
  marketing_section_content: "Learn why network marketing is the future of business",
  
  // Business Model Section
  business_model_section_title: "NHT Global has a PROVEN Business Model",
  business_model_section_content: "Discover our proven system for success",
  
  // Overview Section
  overview_section_title: "NHT Global Opportunity Overview by Founder Members",
  overview_section_youtube_url: "",
  
  // Compensation Plan Section
  compensation_plan_section_title: "What is Compensation Plan",
  compensation_plan_section_content: "Understanding how you get rewarded",
});

// Add Opportunity Page
const AddOpportunityPage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const {
      // Hero Section
      hero_section_content,
      
      // Description Section
      description_section_content,
      
      // Door of Opportunity Section
      door_section_title,
      door_section_content,
      
      // Why Network Marketing Section
      marketing_section_title,
      marketing_section_content,
      
      // Business Model Section
      business_model_section_title,
      business_model_section_content,
      
      // Overview Section
      overview_section_title,
      overview_section_youtube_url,
      
      // Compensation Plan Section
      compensation_plan_section_title,
      compensation_plan_section_content,
    } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingPage = await db.select("tbl_opportunity_page", "*", `tenant_id = ${tenantId}`);
      if (existingPage) {
        return res.status(400).json({
          error: "PAGE_EXISTS",
          message: "Opportunity page already exists for this tenant. Use update instead.",
        });
      }

      const opportunityPageData = {
        tenant_id: tenantId,
        
        // Hero Section
        hero_section_content,
        
        // Description Section
        description_section_content,
        
        // Door of Opportunity Section
        door_section_title,
        door_section_content,
        
        // Why Network Marketing Section
        marketing_section_title,
        marketing_section_content,
        
        // Business Model Section
        business_model_section_title,
        business_model_section_content,
        
        // Overview Section
        overview_section_title,
        overview_section_youtube_url: overview_section_youtube_url || null,
        
        // Compensation Plan Section
        compensation_plan_section_title,
        compensation_plan_section_content,
      };

      // Handle file uploads
      if (req.files) {
        if (req.files.hero_section_image) {
          const file = req.files.hero_section_image[0];
          opportunityPageData.hero_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_hero`);
          safeUnlink(file.path);
        }
        if (req.files.door_section_image) {
          const file = req.files.door_section_image[0];
          opportunityPageData.door_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_door`);
          safeUnlink(file.path);
        }
        if (req.files.marketing_section_image) {
          const file = req.files.marketing_section_image[0];
          opportunityPageData.marketing_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_marketing`);
          safeUnlink(file.path);
        }
        if (req.files.business_model_section_image) {
          const file = req.files.business_model_section_image[0];
          opportunityPageData.business_model_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_business`);
          safeUnlink(file.path);
        }
        if (req.files.overview_section_video) {
          const file = req.files.overview_section_video[0];
          opportunityPageData.overview_section_video_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_videos`);
          safeUnlink(file.path);
        }
        if (req.files.compensation_plan_document) {
          const file = req.files.compensation_plan_document[0];
          opportunityPageData.compensation_plan_document_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_documents`);
          safeUnlink(file.path);
        }
      }

      const result = await db.insert("tbl_opportunity_page", opportunityPageData);
      res.status(201).json({ 
        message: "Opportunity page added successfully", 
        page_id: result.insert_id,
        data: opportunityPageData 
      });
    } catch (err) {
      console.error("Error in AddOpportunityPage:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// ✅ UPDATED: Update Opportunity Page (Smart Partial Updates)
const UpdateOpportunityPage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: "FILE_ERROR", message: err.message });
    }

    const { tenantId } = req.params;
    const {
      // Hero Section
      hero_section_content,
      
      // Description Section
      description_section_content,
      
      // Door of Opportunity Section
      door_section_title,
      door_section_content,
      
      // Why Network Marketing Section
      marketing_section_title,
      marketing_section_content,
      
      // Business Model Section
      business_model_section_title,
      business_model_section_content,
      
      // Overview Section
      overview_section_title,
      overview_section_youtube_url,
      
      // Compensation Plan Section
      compensation_plan_section_title,
      compensation_plan_section_content,
      
      // Special update type
      update_type,
    } = req.body;

    console.log("Request body:", req.body);
    console.log("Files:", req.files);

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      const existingPage = await db.select("tbl_opportunity_page", "*", `tenant_id = ${tenantId}`);
      
      // ✅ Handle document-only update
      if (update_type === "document_only") {
        let documentUrl = existingPage ? existingPage.compensation_plan_document_url : null;
        
        if (req.files?.compensation_plan_document) {
          const file = req.files.compensation_plan_document[0];
          if (existingPage?.compensation_plan_document_url) {
            await deleteFromS3(existingPage.compensation_plan_document_url);
          }
          documentUrl = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_documents`);
          safeUnlink(file.path);
        }

        if (!existingPage) {
          const pageData = { 
            tenant_id: tenantId, 
            compensation_plan_document_url: documentUrl 
          };
          const result = await db.insert("tbl_opportunity_page", pageData);
          return res.status(201).json({ 
            message: "Compensation plan document created", 
            page_id: result.insert_id 
          });
        }

        await db.update(
          "tbl_opportunity_page",
          { compensation_plan_document_url: documentUrl },
          `tenant_id = ${tenantId}`
        );
        return res.status(200).json({ message: "Compensation plan document updated" });
      }
      
      // ✅ IF NO PAGE EXISTS, CREATE ONE WITH DEFAULTS
      if (!existingPage) {
        const defaults = getDefaultValues();
        const opportunityPageData = {
          tenant_id: tenantId,
          
          // Hero Section
          hero_section_content: hero_section_content || defaults.hero_section_content,
          
          // Description Section
          description_section_content: description_section_content || defaults.description_section_content,
          
          // Door of Opportunity Section
          door_section_title: door_section_title || defaults.door_section_title,
          door_section_content: door_section_content || defaults.door_section_content,
          
          // Why Network Marketing Section
          marketing_section_title: marketing_section_title || defaults.marketing_section_title,
          marketing_section_content: marketing_section_content || defaults.marketing_section_content,
          
          // Business Model Section
          business_model_section_title: business_model_section_title || defaults.business_model_section_title,
          business_model_section_content: business_model_section_content || defaults.business_model_section_content,
          
          // Overview Section
          overview_section_title: overview_section_title || defaults.overview_section_title,
          overview_section_youtube_url: overview_section_youtube_url || null,
          
          // Compensation Plan Section
          compensation_plan_section_title: compensation_plan_section_title || defaults.compensation_plan_section_title,
          compensation_plan_section_content: compensation_plan_section_content || defaults.compensation_plan_section_content,
        };

        // Handle file uploads for new record
        if (req.files) {
          if (req.files.hero_section_image) {
            const file = req.files.hero_section_image[0];
            opportunityPageData.hero_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_hero`);
            safeUnlink(file.path);
          }
          if (req.files.door_section_image) {
            const file = req.files.door_section_image[0];
            opportunityPageData.door_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_door`);
            safeUnlink(file.path);
          }
          if (req.files.marketing_section_image) {
            const file = req.files.marketing_section_image[0];
            opportunityPageData.marketing_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_marketing`);
            safeUnlink(file.path);
          }
          if (req.files.business_model_section_image) {
            const file = req.files.business_model_section_image[0];
            opportunityPageData.business_model_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_business`);
            safeUnlink(file.path);
          }
          if (req.files.overview_section_video) {
            const file = req.files.overview_section_video[0];
            opportunityPageData.overview_section_video_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_videos`);
            safeUnlink(file.path);
          }
          if (req.files.compensation_plan_document) {
            const file = req.files.compensation_plan_document[0];
            opportunityPageData.compensation_plan_document_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_documents`);
            safeUnlink(file.path);
          }
        }

        const result = await db.insert("tbl_opportunity_page", opportunityPageData);
        return res.status(201).json({ 
          message: "Opportunity page created successfully", 
          page_id: result.insert_id,
          data: opportunityPageData 
        });
      }

      // ✅ PAGE EXISTS - SMART UPDATE (only update fields that are provided)
      const opportunityPageData = {};

      // Hero Section
      if (hero_section_content !== undefined) {
        opportunityPageData.hero_section_content = hero_section_content;
      }
      
      // Description Section
      if (description_section_content !== undefined) {
        opportunityPageData.description_section_content = description_section_content;
      }
      
      // Door of Opportunity Section
      if (door_section_title !== undefined) {
        opportunityPageData.door_section_title = door_section_title;
      }
      if (door_section_content !== undefined) {
        opportunityPageData.door_section_content = door_section_content;
      }
      
      // Why Network Marketing Section
      if (marketing_section_title !== undefined) {
        opportunityPageData.marketing_section_title = marketing_section_title;
      }
      if (marketing_section_content !== undefined) {
        opportunityPageData.marketing_section_content = marketing_section_content;
      }
      
      // Business Model Section
      if (business_model_section_title !== undefined) {
        opportunityPageData.business_model_section_title = business_model_section_title;
      }
      if (business_model_section_content !== undefined) {
        opportunityPageData.business_model_section_content = business_model_section_content;
      }
      
      // Overview Section
      if (overview_section_title !== undefined) {
        opportunityPageData.overview_section_title = overview_section_title;
      }
      if (overview_section_youtube_url !== undefined) {
        opportunityPageData.overview_section_youtube_url = overview_section_youtube_url || null;
      }
      
      // Compensation Plan Section
      if (compensation_plan_section_title !== undefined) {
        opportunityPageData.compensation_plan_section_title = compensation_plan_section_title;
      }
      if (compensation_plan_section_content !== undefined) {
        opportunityPageData.compensation_plan_section_content = compensation_plan_section_content;
      }

      // Handle file uploads
      if (req.files) {
        if (req.files.hero_section_image) {
          const file = req.files.hero_section_image[0];
          if (existingPage.hero_section_image_url) {
            await deleteFromS3(existingPage.hero_section_image_url);
          }
          opportunityPageData.hero_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_hero`);
          safeUnlink(file.path);
        }
        if (req.files.door_section_image) {
          const file = req.files.door_section_image[0];
          if (existingPage.door_section_image_url) {
            await deleteFromS3(existingPage.door_section_image_url);
          }
          opportunityPageData.door_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_door`);
          safeUnlink(file.path);
        }
        if (req.files.marketing_section_image) {
          const file = req.files.marketing_section_image[0];
          if (existingPage.marketing_section_image_url) {
            await deleteFromS3(existingPage.marketing_section_image_url);
          }
          opportunityPageData.marketing_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_marketing`);
          safeUnlink(file.path);
        }
        if (req.files.business_model_section_image) {
          const file = req.files.business_model_section_image[0];
          if (existingPage.business_model_section_image_url) {
            await deleteFromS3(existingPage.business_model_section_image_url);
          }
          opportunityPageData.business_model_section_image_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_business`);
          safeUnlink(file.path);
        }
        if (req.files.overview_section_video) {
          const file = req.files.overview_section_video[0];
          // Delete old video if it exists and is not a YouTube link
          if (existingPage.overview_section_video_url && !overview_section_youtube_url) {
            await deleteFromS3(existingPage.overview_section_video_url);
          }
          opportunityPageData.overview_section_video_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_videos`);
          safeUnlink(file.path);
        }
        if (req.files.compensation_plan_document) {
          const file = req.files.compensation_plan_document[0];
          if (existingPage.compensation_plan_document_url) {
            await deleteFromS3(existingPage.compensation_plan_document_url);
          }
          opportunityPageData.compensation_plan_document_url = await uploadToS3(file, `tenant_${tenantId}/opportunity_page_documents`);
          safeUnlink(file.path);
        }
      }

      // Only update if there's something to update
      if (Object.keys(opportunityPageData).length > 0) {
        await db.update("tbl_opportunity_page", opportunityPageData, `tenant_id = ${tenantId}`);
      }

      res.json({ 
        message: "Opportunity page updated successfully", 
        data: opportunityPageData 
      });
    } catch (err) {
      console.error("Error in UpdateOpportunityPage:", err);
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
    const page = await db.select("tbl_opportunity_page", "*", `tenant_id = ${tenantId}`);
    
    if (!page) {
      return res.status(200).json({});
    }
    
    res.json(page);
  } catch (err) {
    console.error("Error in GetOpportunityPage:", err);
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
    const page = await db.select("tbl_opportunity_page", "*", `tenant_id = ${tenantId}`);
    
    if (!page) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Opportunity page not found" });
    }

    // Delete all associated files from S3
    const filesToDelete = [
      page.hero_section_image_url,
      page.door_section_image_url,
      page.marketing_section_image_url,
      page.business_model_section_image_url,
      page.overview_section_video_url && !page.overview_section_youtube_url ? page.overview_section_video_url : null,
      page.compensation_plan_document_url,
    ].filter(Boolean);

    for (const fileUrl of filesToDelete) {
      await deleteFromS3(fileUrl);
    }

    await db.delete("tbl_opportunity_page", `tenant_id = ${tenantId}`);
    res.json({ message: "Opportunity page deleted successfully" });
  } catch (err) {
    console.error("Error in DeleteOpportunityPage:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddOpportunityPage,
  UpdateOpportunityPage,
  GetOpportunityPage,
  DeleteOpportunityPage,
};