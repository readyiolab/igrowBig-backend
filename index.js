const express = require("express");
const app = express();
const PORT = 3001;
const path = require("path");
const cors = require("cors");
const db = require("./config/db");

const tenantRoutes = require("./routes/tenantRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const templateRoutes = require("./routes/templateRoutes");
const publicTenantRoutes = require("./routes/publicTenantRoutes");
const newsletterRoutes = require("./routes/newsletterRoutes");

// ========== CORS CONFIGURATION ==========
app.use(
  cors({
    origin: async (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      try {
        const originHostname = new URL(origin).hostname.toLowerCase();
        const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";

        console.log("🔍 CORS Check - Origin:", origin);
        console.log("🔍 CORS Check - Hostname:", originHostname);

        // ========== ALLOW: Main Domain ==========
        if (
          originHostname === baseDomain ||
          originHostname === `www.${baseDomain}` ||
          originHostname === "localhost"
        ) {
          console.log("✅ CORS: Main domain allowed");
          return callback(null, true);
        }

        // ========== ALLOW: Verified Subdomains ==========
        if (originHostname.endsWith(`.${baseDomain}`)) {
          const subdomain = originHostname.replace(`.${baseDomain}`, "");
          const fullSubdomain = `${subdomain}.${baseDomain}`;

          console.log("🔍 CORS: Checking subdomain:", fullSubdomain);

          const tenant = await db.selectAll(
            "tbl_tenants",
            "id, domain",
            "domain = ?",
            [fullSubdomain]
          );

          if (tenant.length > 0) {
            console.log("✅ CORS: Subdomain allowed:", fullSubdomain);
            return callback(null, true);
          } else {
            console.log("❌ CORS: Subdomain not found:", fullSubdomain);
          }
        }

        // ========== ALLOW: Verified Custom Domains ==========
        console.log("🔍 CORS: Checking custom domain:", originHostname);

        const settings = await db.selectAll(
          "tbl_settings",
          "tenant_id, primary_domain_name",
          "primary_domain_name = ? AND dns_status = ?",
          [originHostname, "verified"]
        );

        if (settings.length > 0) {
          console.log("✅ CORS: Custom domain allowed:", originHostname);
          return callback(null, true);
        }

        // ========== DENY: Unknown Origin ==========
        console.log("❌ CORS: Origin not allowed:", origin);
        callback(new Error("Not allowed by CORS"));
      } catch (error) {
        console.error("❌ CORS validation error:", error);
        callback(new Error("CORS validation failed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-Domain"],
  })
);

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));

// Add request logging
app.use((req, res, next) => {
  const hostname = req.get("Host") || "";
  console.log(`📥 ${req.method} ${req.url} - Host: ${hostname}`);
  next();
});

// ========== ROUTES ==========
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/newsletters", newsletterRoutes);
app.use("/api", publicTenantRoutes);

// ========== HEALTH CHECK ==========
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Invalid JSON payload:", err.message);
    return res.status(400).json({
      error: "INVALID_JSON",
      message: "Invalid JSON format in request body",
    });
  }

  console.error("Server Error:", err);
  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: err.message || "An unexpected error occurred",
  });
});

// ========== 404 HANDLER ==========
app.use((req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "The requested endpoint does not exist",
    path: req.url,
  });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📍 Base Domain: ${process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com"}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}\n`);
});

// ========== GRACEFUL SHUTDOWN ==========
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});