// backend/middleware/upload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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

const trainingStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, "../Uploads/training");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|svg/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (!extname || !mimetype) {
    return cb(new Error("Only JPEG/JPG/PNG/SVG images allowed"));
  }

  if (file.size > 4 * 1024 * 1024) {
    return cb(new Error("Image files must be 4MB or less"));
  }

  cb(null, true);
};

const trainingFileFilter = (req, file, cb) => {
  if (file.size > 4 * 1024 * 1024) {
    return cb(new Error("Document files must be 4MB or less"));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter,
});

const trainingUpload = multer({
  storage: trainingStorage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: trainingFileFilter,
});

module.exports = {
  upload, // Export the multer instance for settings (supports .fields())
  trainingUpload, // Export the multer instance for training (supports .single())
};