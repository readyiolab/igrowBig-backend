
const express = require("express");
const app = express();
const PORT = 3001;
const path = require("path");
const cors = require("cors");
const db = require("./config/db"); // Adjust path

const tenantRoutes = require("./routes/tenantRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const templateRoutes = require("./routes/templateRoutes");
const publicTenantRoutes = require("./routes/publicTenantRoutes");
const newsletterRoutes = require("./routes/newsletterRoutes");



app.use(
  cors({
    origin: async (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "http://localhost:5173",
        "https://igrowbig.com",
        "http://igrowbig.com",
         /https:\/\/.*\.igrowbig\.com$/,
      ];

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      try {
        const domain = new URL(origin).hostname;
        
        // Check if this is a verified subdomain
        const settings = await db.selectAll(
          "tbl_settings",
          "primary_domain_name",
          "primary_domain_name = ? AND dns_status = 'verified'",
          [domain]
        );
        
        if (settings.length > 0) {
          return callback(null, true);
        }
        
        callback(new Error("Not allowed by CORS"));
      } catch (error) {
        console.error("CORS validation error:", error);
        callback(new Error("CORS validation failed"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));

app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/newsletters", newsletterRoutes);
app.use("/api", publicTenantRoutes);

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Invalid JSON payload:", err.message);
    return res.status(400).json({
      error: "INVALID_JSON",
      message: "Invalid JSON format in request body",
    });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});