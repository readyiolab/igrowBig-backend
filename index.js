const express = require("express");
require("./config/jwt"); // Fail fast if JWT_SECRET is missing/weak
const app = express();
const PORT = 3002;
const path = require("path");
const cors = require("cors");
const db = require("./config/db");
const { setupDomainVerificationCron } = require("./cron/domainVerificationCron");

const tenantRoutes = require("./routes/tenantRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminMigrationRoutes = require('./routes/adminMigrationRoutes');
const userRoutes = require("./routes/userRoutes");
const templateRoutes = require("./routes/templateRoutes");
const publicTenantRoutes = require("./routes/publicTenantRoutes");
const newsletterRoutes = require("./routes/newsletterRoutes");
const GlobalproductRoutes = require('./routes/productRoutes');

setupDomainVerificationCron();
console.log("✅ Domain verification cron job started");

const isProduction = process.env.NODE_ENV === "production";

// ========== CORS CONFIGURATION ==========
app.use(
  cors({
    origin: async (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      try {
        const originHostname = new URL(origin).hostname.toLowerCase();
        const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";

        if (
          originHostname === baseDomain ||
          originHostname === `www.${baseDomain}` ||
          originHostname === "localhost"
        ) {
          return callback(null, true);
        }

        if (originHostname.endsWith(`.${baseDomain}`)) {
          const subdomain = originHostname.replace(`.${baseDomain}`, "");
          const fullSubdomain = `${subdomain}.${baseDomain}`;

          const tenant = await db.selectAll(
            "tbl_tenants",
            "id, domain",
            "domain = ?",
            [fullSubdomain]
          );

          if (tenant.length > 0) {
            return callback(null, true);
          }
        }

        const customDomainTenant = await db.selectAll(
          "tbl_tenants",
          "id, custom_domain, custom_domain_status",
          "custom_domain = ?",
          [originHostname]
        );

        if (customDomainTenant.length > 0) {
          const domainStatus = customDomainTenant[0].custom_domain_status;
          if (domainStatus === "verified") {
            return callback(null, true);
          }
          // Unverified custom domains only allowed outside production
          if (!isProduction) {
            return callback(null, true);
          }
          return callback(new Error("Not allowed by CORS"));
        }

        const settings = await db.selectAll(
          "tbl_settings",
          "tenant_id, primary_domain_name, dns_status",
          "primary_domain_name = ?",
          [originHostname]
        );

        if (settings.length > 0) {
          const domainStatus = settings[0].dns_status;
          if (domainStatus === "verified") {
            return callback(null, true);
          }
          if (!isProduction) {
            return callback(null, true);
          }
          return callback(new Error("Not allowed by CORS"));
        }

        callback(new Error("Not allowed by CORS"));
      } catch (error) {
        console.error("❌ CORS validation error:", error.message);
        // Fail closed — do not allow unknown origins on error
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-Domain",
      "X-Forwarded-Host",
      "X-Forwarded-Proto",
      "Host"
    ],
  })
);

app.use((req, res, next) => {
  if (!isProduction) {
    const hostname = req.get("Host") || req.get("X-Forwarded-Host") || "";
    console.log(`📥 ${req.method} ${req.url} Host: ${hostname}`);
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(path.join(__dirname, "Uploads")));

app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use('/api/admin', adminMigrationRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/newsletters", newsletterRoutes);
app.use("/api", publicTenantRoutes);
app.use('/api', GlobalproductRoutes);

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      error: "CORS_DENIED",
      message: "Origin not allowed",
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Invalid JSON payload:", err.message);
    return res.status(400).json({
      error: "INVALID_JSON",
      message: "Invalid JSON format in request body",
    });
  }

  console.error("Server Error:", err);
  res.status(err.status || 500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: isProduction
      ? "An unexpected error occurred"
      : (err.message || "An unexpected error occurred"),
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "The requested endpoint does not exist",
    path: req.url,
  });
});

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📍 Base Domain: ${process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com"}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`FATAL: Port ${PORT} is already in use. Stop the other process (pm2 stop / fuser -k ${PORT}/tcp) then restart.`);
    process.exit(1);
  }
  console.error("Server listen error:", err);
  process.exit(1);
});

const shutdown = (signal) => {
  console.log(`${signal} received: closing HTTP server`);
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
  // Force exit if close hangs (open keep-alive connections)
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
