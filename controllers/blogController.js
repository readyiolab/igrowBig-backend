const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");

// Multer setup for disk storage (temporary local files)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Temporary folder for uploads
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error("Only JPEG/JPG/PNG images allowed"));
  },
}).single("image");

// Ensure the uploads directory exists
const fs = require("fs");
if (!fs.existsSync("uploads/")) {
  fs.mkdirSync("uploads/");
}

// Add Blog (tbl_blogs)
const AddBlog = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId } = req.params;
    const { title, content, is_visible } = req.body;

    if (!checkTenantAuth(req, tenantId))
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

    if (!title || !content)
      return res.status(400).json({ error: "MISSING_FIELDS", message: "Title and content are required" });

    try {
      let imageUrl = null;
      if (req.file) {
        imageUrl = await uploadToS3(req.file, `blogs/${tenantId}`);
      }

      const blogData = {
        tenant_id: tenantId,
        title,
        content,
        image_url: imageUrl,
        is_visible: is_visible === "true" || is_visible === true,
      };
      const blogResult = await db.insert("tbl_blogs", blogData);
      const blogId = blogResult.insert_id;

      res.status(201).json({ message: "Blog added", blog_id: blogId });
    } catch (err) {
      console.error("Error in AddBlog:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Get Blogs (tbl_blogs) with associated banners (tbl_blog_page_banners)
const GetBlogs = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId))
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

  try {
    const blogs = await db.selectAll(
      "tbl_blogs",
      "*",
      `tenant_id = ${tenantId}`,
      "ORDER BY created_at DESC"
    );

    for (let blog of blogs) {
      const banners = await db.selectAll(
        "tbl_blog_page_banners",
        "*",
        `blog_id = ${blog.id} AND tenant_id = ${tenantId}`
      );
      blog.banners = banners;
    }

    res.json(blogs);
  } catch (err) {
    console.error("Error in GetBlogs:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Update Blog (tbl_blogs)
const UpdateBlog = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId, blogId } = req.params;
    const { title, content, is_visible } = req.body;

    if (!checkTenantAuth(req, tenantId))
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

    try {
      const existingBlog = await db.selectAll("tbl_blogs", "*", `id = ${blogId} AND tenant_id = ${tenantId}`);
      if (!existingBlog || existingBlog.length === 0)
        return res.status(404).json({ error: "BLOG_NOT_FOUND", message: "Blog not found" });

      let imageUrl = existingBlog[0].image_url;
      if (req.file) {
        if (imageUrl) await deleteFromS3(imageUrl);
        imageUrl = await uploadToS3(req.file, `blogs/${tenantId}`);
      }

      const blogUpdateData = {};
      if (title) blogUpdateData.title = title;
      if (content) blogUpdateData.content = content;
      if (typeof is_visible !== "undefined") blogUpdateData.is_visible = is_visible === "true" || is_visible === true;
      if (imageUrl !== existingBlog[0].image_url) blogUpdateData.image_url = imageUrl;

      if (Object.keys(blogUpdateData).length > 0) {
        await db.update("tbl_blogs", blogUpdateData, `id = ${blogId} AND tenant_id = ${tenantId}`);
      }

      res.json({ message: "Blog updated" });
    } catch (err) {
      console.error("Error in UpdateBlog:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Delete Blog (tbl_blogs) and its associated banners (tbl_blog_page_banners)
const DeleteBlog = async (req, res) => {
  const { tenantId, blogId } = req.params;
  if (!checkTenantAuth(req, tenantId))
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

  try {
    const blog = await db.selectAll("tbl_blogs", "*", `id = ${blogId} AND tenant_id = ${tenantId}`);
    if (!blog || blog.length === 0)
      return res.status(404).json({ error: "BLOG_NOT_FOUND", message: "Blog not found" });

    if (blog[0].image_url) await deleteFromS3(blog[0].image_url);

    const banners = await db.selectAll(
      "tbl_blog_page_banners",
      "*",
      `blog_id = ${blogId} AND tenant_id = ${tenantId}`
    );
    for (const banner of banners) {
      if (banner.image_url) await deleteFromS3(banner.image_url);
    }
    await db.delete("tbl_blog_page_banners", `blog_id = ${blogId} AND tenant_id = ${tenantId}`);

    await db.delete("tbl_blogs", `id = ${blogId} AND tenant_id = ${tenantId}`);
    res.json({ message: "Blog and associated banners deleted" });
  } catch (err) {
    console.error("Error in DeleteBlog:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Add Blog Banner (tbl_blog_page_banners)
const AddBlogBanner = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId, blogId } = req.params;
    const { image_content } = req.body;

    if (!checkTenantAuth(req, tenantId))
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

    if (!req.file)
      return res.status(400).json({ error: "MISSING_IMAGE", message: "Banner image is required" });

    try {
      const imageUrl = await uploadToS3(req.file, `blogs/${tenantId}`);
      const bannerData = {
        tenant_id: tenantId,
        blog_id: blogId,
        image_url: imageUrl,
        image_content: image_content || "",
      };
      const result = await db.insert("tbl_blog_page_banners", bannerData);
      res.status(201).json({ message: "Blog banner added", banner_id: result.insert_id });
    } catch (err) {
      console.error("Error in AddBlogBanner:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Update Blog Banner (tbl_blog_page_banners)
const UpdateBlogBanner = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: "FILE_ERROR", message: err.message });

    const { tenantId, blogId, bannerId } = req.params;
    const { image_content } = req.body;

    if (!checkTenantAuth(req, tenantId))
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

    try {
      const existingBanner = await db.selectAll(
        "tbl_blog_page_banners",
        "*",
        `id = ${bannerId} AND blog_id = ${blogId} AND tenant_id = ${tenantId}`
      );
      if (!existingBanner || existingBanner.length === 0)
        return res.status(404).json({ error: "BANNER_NOT_FOUND", message: "Banner not found" });

      let imageUrl = existingBanner[0].image_url;
      if (req.file) {
        if (imageUrl) await deleteFromS3(imageUrl);
        imageUrl = await uploadToS3(req.file, `blogs/${tenantId}`);
      }

      const bannerData = {
        image_url: imageUrl,
        image_content: image_content || existingBanner[0].image_content,
      };
      await db.update(
        "tbl_blog_page_banners",
        bannerData,
        `id = ${bannerId} AND blog_id = ${blogId} AND tenant_id = ${tenantId}`
      );
      res.json({ message: "Blog banner updated" });
    } catch (err) {
      console.error("Error in UpdateBlogBanner:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
    }
  });
};

// Delete Blog Banner (tbl_blog_page_banners)
const DeleteBlogBanner = async (req, res) => {
  const { tenantId, blogId, bannerId } = req.params;
  if (!checkTenantAuth(req, tenantId))
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

  try {
    const banner = await db.selectAll(
      "tbl_blog_page_banners",
      "*",
      `id = ${bannerId} AND blog_id = ${blogId} AND tenant_id = ${tenantId}`
    );
    if (!banner || banner.length === 0)
      return res.status(404).json({ error: "BANNER_NOT_FOUND", message: "Banner not found" });

    if (banner[0].image_url) await deleteFromS3(banner[0].image_url);
    await db.delete(
      "tbl_blog_page_banners",
      `id = ${bannerId} AND blog_id = ${blogId} AND tenant_id = ${tenantId}`
    );
    res.json({ message: "Blog banner deleted" });
  } catch (err) {
    console.error("Error in DeleteBlogBanner:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  AddBlog,
  GetBlogs,
  UpdateBlog,
  DeleteBlog,
  AddBlogBanner,
  UpdateBlogBanner,
  DeleteBlogBanner,
};