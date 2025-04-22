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

      // Dynamic folder name for S3
      const folder = `contactus/tenant_${tenantId}`;

      // Upload image to S3
      const imageUrl = await uploadToS3(req.file, folder);
      // Clean up temporary file
      const tempFilePath = req.file.path;
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

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
      const existingContactUs = await db.select("tbl_contactus_page", "*", `id = ${id} AND tenant_id = ${tenantId}`);

      if (!existingContactUs) {
        return res.status(404).json({ error: "CONTACTUS_NOT_FOUND", message: "Contact Us not found" });
      }

      console.log("Existing ContactUs Data:", existingContactUs);

      const folder = `contactus/tenant_${tenantId}`;
      const updateData = {};

      if (contactus_text) updateData.contactus_text = contactus_text;

      if (req.file) {
        // Delete old image from S3 if it exists
        const existingImage = existingContactUs.contactus_image; // FIXED: Direct access
        if (existingImage) {
          await deleteFromS3(existingImage);
        }
        // Upload new image to S3
        updateData.contactus_image = await uploadToS3(req.file, folder);
        // Clean up temporary file
        const tempFilePath = req.file.path;
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "NO_DATA", message: "No data provided to update" });
      }

      await db.update("tbl_contactus_page", updateData, `id = ${id} AND tenant_id = ${tenantId}`);
      res.json({ message: "Contact Us updated" });
    } catch (err) {
      console.error(err);
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
    const contactUsItems = await db.selectAll("tbl_contactus_page", "*", `tenant_id = ${tenantId}`);
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
    const existingContactUs = await db.select("tbl_contactus_page", "*", `id = ${id} AND tenant_id = ${tenantId}`);

    if (!existingContactUs) {
      return res.status(404).json({ error: "CONTACTUS_NOT_FOUND", message: "Contact Us not found" });
    }

    console.log("Existing ContactUs Data:", existingContactUs);

    // Delete image from S3 if it exists
    const existingImage = existingContactUs.contactus_image; // FIXED: Direct access
    if (existingImage) {
      await deleteFromS3(existingImage);
    }

    await db.delete("tbl_contactus_page", `id = ${id} AND tenant_id = ${tenantId}`);
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
