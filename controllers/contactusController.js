const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");

// Helper function to safely delete temporary files
const safeUnlink = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Error deleting file ${filePath}:`, err.message);
  }
};

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

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (!extname || !mimetype) {
      return cb(new Error("Only JPEG/JPG/PNG images allowed"));
    }
    cb(null, true);
  },
}).single("contactus_image");

// Add Contact Us
const AddContactUs = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId } = req.params;
    const { contactus_text } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: "MISSING_IMAGE", message: "Contact Us image is required" });
      }
      if (!contactus_text) {
        return res.status(400).json({ error: "MISSING_TEXT", message: "Contact Us text is required" });
      }

      const folder = `tenant_${tenantId}/contactus`;
      const imageUrl = await uploadToS3(req.file, folder);
      safeUnlink(req.file.path);

      const contactUsData = {
        tenant_id: tenantId,
        contactus_image: imageUrl,
        contactus_text,
      };

      const result = await db.insert("tbl_contactus_page", contactUsData);
      res.status(201).json({ message: "Contact Us added", id: result.insert_id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Update Contact Us
const UpdateContactUs = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId, id } = req.params;
    const { contactus_text } = req.body;

    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    if (!id) {
      return res.status(400).json({ error: "MISSING_ID", message: "Contact Us ID is required" });
    }

    try {
      const existingContactUs = await db.select(
        "tbl_contactus_page",
        "*",
        "id = ? AND tenant_id = ?",
        [id, tenantId]
      );
      if (!existingContactUs) {
        return res.status(404).json({ error: "CONTACTUS_NOT_FOUND", message: "Contact Us not found" });
      }

      const updateData = {};
      if (contactus_text) updateData.contactus_text = contactus_text;

      if (req.file) {
        // Delete old image from S3 if it exists
        if (existingContactUs.contactus_image) {
          await deleteFromS3(existingContactUs.contactus_image);
        }
        // Upload new image to S3
        const folder = `tenant_${tenantId}/contactus`;
        updateData.contactus_image = await uploadToS3(req.file, folder);
        safeUnlink(req.file.path);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "NO_DATA", message: "No data provided to update" });
      }

      await db.update("tbl_contactus_page", updateData, "id = ? AND tenant_id = ?", [id, tenantId]);
      res.json({ message: "Contact Us updated" });
    } catch (err) {
      console.error("Error in UpdateContactUs:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Get All Contact Us
const GetAllContactUs = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const contactUsItems = await db.selectAll("tbl_contactus_page", "*", "tenant_id = ?", [tenantId]);
    if (contactUsItems.length === 0) {
      return res.status(404).json({ error: "CONTACTUS_NOT_FOUND", message: "No Contact Us items found" });
    }
    res.json(contactUsItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Delete Contact Us
const DeleteContactUs = async (req, res) => {
  const { tenantId, id } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  if (!id) {
    return res.status(400).json({ error: "MISSING_ID", message: "Contact Us ID is required" });
  }

  try {
    const existingContactUs = await db.select(
      "tbl_contactus_page",
      "*",
      "id = ? AND tenant_id = ?",
      [id, tenantId]
    );

    if (!existingContactUs) {
      return res.status(404).json({ error: "CONTACTUS_NOT_FOUND", message: "Contact Us not found" });
    }

    // Delete image from S3 if it exists
    const existingImage = existingContactUs.contactus_image;
    if (existingImage) {
      await deleteFromS3(existingImage);
    }

    await db.delete("tbl_contactus_page", "id = ? AND tenant_id = ?", [id, tenantId]);
    res.json({ message: "Contact Us deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddContactUs,
  UpdateContactUs,
  GetAllContactUs,
  DeleteContactUs,
};