const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");
const { DNS_STATUS_ENUM } = require("../config/constants");
const { sendDomainNotification } = require("../config/email");
const { sendWebhook } = require("../services/webhookService");
const { body, validationResult } = require("express-validator");
const { addCustomHostnameWithSSL, getCustomHostnameStatus, addSubdomain } = require("../services/cloudflareService");

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
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB limit for site logo
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (!extname || !mimetype) {
      return cb(new Error("Site logo must be JPEG/JPG/PNG"));
    }
    cb(null, true);
  },
}).fields([{ name: "site_logo", maxCount: 1 }]);

// Normalize database result
const normalizeResult = (result) => (Array.isArray(result) && result.length > 0 ? result[0] : null);

// ==================== GET SETTINGS ====================
const GetSettings = [
  async (req, res) => {
    try {
      const { tenantId } = req.params;

      // Authorization check
      if (!checkTenantAuth(req, tenantId))
        return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

      const settings = await db.selectAll("tbl_settings", "*", "tenant_id = ?", [tenantId]);
      const tenant = await db.selectAll("tbl_tenants", "*", "id = ?", [tenantId]);

      if (settings.length === 0 || tenant.length === 0) {
        const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
        const defaultSettings = {
          tenant_id: tenantId,
          domain_type: "sub_domain",
          primary_domain_name: baseDomain,
          website_link: `https://${baseDomain}`,
          first_name: "",
          last_name: "",
          email_id: "",
          mobile: null,
          address: "Not set",
          publish_on_site: 0,
          skype: null,
          site_name: "Default Site",
          site_logo_url: null,
          nht_website_link: null,
          nht_store_link: null,
          nht_joining_link: null,
          dns_status: "pending",
          ssl_status: "pending",
          cloudflare_hostname_id: null,
          custom_domain: null,
        };
        return res.status(200).json({
          message: "No settings found, returning default settings",
          settings: defaultSettings,
        });
      }

      const settingsData = settings[0];
      const tenantData = tenant[0];

      // Ensure dns_status and ssl_status are valid
      if (!DNS_STATUS_ENUM || !DNS_STATUS_ENUM.includes(settingsData.dns_status)) {
        settingsData.dns_status = "pending";
      }
      settingsData.ssl_status = settingsData.ssl_status || "pending";

      // Enrich settings with tenant domain info
      const enrichedSettings = {
        ...settingsData,
        subdomain: tenantData.domain,
        custom_domain: tenantData.custom_domain,
        custom_domain_status: tenantData.custom_domain_status,
      };

      res.status(200).json({
        message: "Tenant settings retrieved successfully",
        settings: enrichedSettings,
      });
    } catch (error) {
      console.error("GetSettings Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to retrieve settings",
      });
    }
  },
];

// ==================== UPDATE SETTINGS ====================
const UpdateSettings = [
  upload,
  body("domain_type").optional().isIn(["sub_domain", "custom_domain"]),
  body("custom_domain")
    .optional()
    .custom((value) => {
      if (!value) return true;
      return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
    })
    .withMessage("Invalid custom domain format (e.g., example.com)"),
  body("first_name").optional().trim().isLength({ max: 100 }),
  body("last_name").optional().trim().isLength({ max: 100 }),
  body("email_id").optional().isEmail(),
  body("mobile").optional().trim().isLength({ max: 20 }),
  body("site_name").optional().trim().isLength({ max: 255 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { tenantId } = req.params;

      // Authorization check
      if (!checkTenantAuth(req, tenantId))
        return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

      const {
        domain_type,
        custom_domain,
        first_name,
        last_name,
        email_id,
        mobile,
        address,
        skype,
        site_name,
        nht_website_link,
        nht_store_link,
        nht_joining_link,
        publish_on_site,
      } = req.body;

      const normalizedTenantId = parseInt(tenantId, 10);
      if (isNaN(normalizedTenantId)) {
        return res.status(400).json({
          error: "INVALID_TENANT_ID",
          message: "Tenant ID must be a valid number",
        });
      }

      const existingSettings = await db.selectAll(
        "tbl_settings",
        "*",
        "tenant_id = ?",
        [normalizedTenantId]
      );
      const currentSettings = existingSettings.length > 0 ? existingSettings[0] : {};

      const tenant = await db.selectAll("tbl_tenants", "*", "id = ?", [
        normalizedTenantId,
      ]);
      if (tenant.length === 0) {
        return res.status(404).json({
          error: "TENANT_NOT_FOUND",
          message: "Tenant not found",
        });
      }

      const tenantData = tenant[0];
      const baseDomain = process.env.CLOUDFLARE_ROOT_DOMAIN || "igrowbig.com";
      const protocol = "https";
      const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

      let dnsStatus = currentSettings.dns_status || "pending";
      let sslStatus = currentSettings.ssl_status || "pending";
      let cloudflareHostnameId = currentSettings.cloudflare_hostname_id || null;
      let websiteLink = currentSettings.website_link;
      let verificationInstructions = null;

      // ========== CUSTOM DOMAIN LOGIC ==========
      if (domain_type === "custom_domain" && custom_domain) {
        const normalizedCustomDomain = custom_domain.trim().toLowerCase().replace(/^www\./, "");

        // Validate custom domain format
        if (normalizedCustomDomain === baseDomain || normalizedCustomDomain === `www.${baseDomain}`) {
          return res.status(400).json({
            error: "INVALID_DOMAIN",
            message: "You cannot use the platform's base domain as a custom domain",
          });
        }

        // Check if custom domain is already taken by another tenant
        const domainExists = await db.selectAll(
          "tbl_tenants",
          "id",
          "custom_domain = ? AND id != ?",
          [normalizedCustomDomain, normalizedTenantId]
        );
        if (domainExists.length > 0) {
          return res.status(400).json({
            error: "DOMAIN_EXISTS",
            message: "This custom domain is already taken by another store",
          });
        }

        // Start DNS verification and SSL setup with Cloudflare
        try {
          console.log(`🔐 Setting up custom domain with SSL: ${normalizedCustomDomain}`);
          const sslResult = await addCustomHostnameWithSSL(normalizedCustomDomain);

          if (!sslResult.success) {
            console.error("SSL setup failed:", sslResult.error);
            return res.status(500).json({
              error: "SSL_SETUP_FAILED",
              message: "Failed to setup SSL for custom domain",
              details: process.env.NODE_ENV === "development" ? sslResult.error : undefined,
            });
          }

          console.log(`✅ SSL setup initiated for ${normalizedCustomDomain}`);
          console.log(`   Status: ${sslResult.ssl_status}`);
          console.log(`   Hostname ID: ${sslResult.hostname_id}`);

          dnsStatus = "pending";
          sslStatus = sslResult.ssl_status;
          cloudflareHostnameId = sslResult.hostname_id;
          websiteLink = `${protocol}://${normalizedCustomDomain}`;

          // Update tenant with custom domain
          await db.update(
            "tbl_tenants",
            {
              custom_domain: normalizedCustomDomain,
              custom_domain_status: "pending",
              updated_at: timestamp,
            },
            "id = ?",
            [normalizedTenantId]
          );

          verificationInstructions = {
            status: sslResult.ssl_status,
            domain: normalizedCustomDomain,
            instructions: {
              step1: {
                title: "Add TXT Record for SSL Verification",
                type: "TXT",
                name: sslResult.verification.name,
                value: sslResult.verification.value,
                description: "Required to verify domain ownership and issue SSL certificate",
                ttl: "Auto or 300 seconds",
              },
              step2: {
                title: "Point Your Domain to Our Server",
                type: "CNAME",
                name: "@",
                value: baseDomain,
                description: "Routes all traffic to your store",
                ttl: "Auto or 300 seconds",
                alternative: {
                  title: "Alternative: A Record (if CNAME doesn't work)",
                  type: "A",
                  name: "@",
                  value: process.env.SERVER_IP || "139.59.8.68",
                  description: "Use this if your DNS provider doesn't allow CNAME for root domain",
                },
              },
            },
            note: `After adding both DNS records, your store will be accessible at https://${normalizedCustomDomain} within 15-30 minutes. SSL certificate will be issued automatically. You'll receive an email notification when everything is ready.`,
            timeline: {
              dns_propagation: "5-15 minutes (usually)",
              ssl_issuance: "5-15 minutes after DNS verification",
              total_time: "15-30 minutes (can take up to 48 hours in rare cases)",
            },
          };

        } catch (verificationError) {
          console.error("Custom domain verification error:", verificationError);
          return res.status(500).json({
            error: "VERIFICATION_ERROR",
            message: "Failed to start domain verification process",
            details: process.env.NODE_ENV === "development" ? verificationError.message : undefined,
          });
        }
      }

      // ========== SUBDOMAIN LOGIC ==========
      if (domain_type === "sub_domain" || !domain_type) {
        let subdomain = tenantData.domain;

        // If no subdomain exists, create one
        if (!subdomain || tenantData.custom_domain) {
          const baseName = (tenantData.name || `tenant${normalizedTenantId}`)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

          let counter = 0;
          let available = false;

          while (!available && counter < 100) {
            subdomain = counter === 0 ? baseName : `${baseName}${counter}`;
            const existing = await db.selectAll(
              "tbl_tenants",
              "id",
              "domain = ?",
              [subdomain]
            );

            if (existing.length === 0) {
              available = true;
            } else {
              counter++;
            }
          }

          if (!available) {
            return res.status(500).json({
              error: "SUBDOMAIN_GENERATION_FAILED",
              message: "Unable to generate unique subdomain",
            });
          }

          // Add subdomain to Cloudflare
          try {
            await addSubdomain(subdomain);
          } catch (subdomainError) {
            console.error("Subdomain setup error:", subdomainError);
            return res.status(500).json({
              error: "SUBDOMAIN_SETUP_FAILED",
              message: "Failed to setup subdomain in Cloudflare",
              details: process.env.NODE_ENV === "development" ? subdomainError.message : undefined,
            });
          }
        }

        websiteLink = `${protocol}://${subdomain}.${baseDomain}`;
        dnsStatus = "verified"; // Subdomains are always verified
        sslStatus = "active"; // Subdomains are secured by default

        // Update tenant to remove custom domain
        await db.update(
          "tbl_tenants",
          {
            custom_domain: null,
            custom_domain_status: null,
            domain: `${subdomain}.${baseDomain}`,
            updated_at: timestamp,
          },
          "id = ?",
          [normalizedTenantId]
        );

        console.log(`Tenant ${normalizedTenantId} reverted to subdomain: ${subdomain}.${baseDomain}`);
      }

      // ========== UPDATE SETTINGS ==========
      const settingsData = {
        domain_type: domain_type || currentSettings.domain_type || "sub_domain",
        primary_domain_name:
          domain_type === "custom_domain" && custom_domain
            ? normalizedCustomDomain
            : `${subdomain}.${baseDomain}`,
        website_link: websiteLink || currentSettings.website_link,
        dns_status: dnsStatus,
        ssl_status: sslStatus,
        cloudflare_hostname_id: cloudflareHostnameId,
        first_name: first_name !== undefined ? first_name : currentSettings.first_name,
        last_name: last_name !== undefined ? last_name : currentSettings.last_name,
        email_id: email_id !== undefined ? email_id : currentSettings.email_id,
        mobile: mobile !== undefined ? mobile : currentSettings.mobile,
        address: address !== undefined ? address : currentSettings.address,
        skype: skype !== undefined ? skype : currentSettings.skype,
        site_name: site_name !== undefined ? site_name : currentSettings.site_name,
        nht_website_link: nht_website_link !== undefined ? nht_website_link : currentSettings.nht_website_link,
        nht_store_link: nht_store_link !== undefined ? nht_store_link : currentSettings.nht_store_link,
        nht_joining_link: nht_joining_link !== undefined ? nht_joining_link : currentSettings.nht_joining_link,
        publish_on_site:
          publish_on_site !== undefined
            ? publish_on_site === "true" || publish_on_site === true || publish_on_site === 1
            : currentSettings.publish_on_site,
        updated_at: timestamp,
      };

      // ========== LOGO UPLOAD ==========
      if (req.files && req.files["site_logo"]) {
        const logoFile = req.files["site_logo"][0];
        const folder = `settings/tenant_${normalizedTenantId}`;
        const fileObject = {
          path: logoFile.path,
          filename: `${Date.now()}-${logoFile.originalname}`,
          mimetype: logoFile.mimetype,
        };

        // Delete old logo from S3
        if (currentSettings.site_logo_url) {
          try {
            await deleteFromS3(currentSettings.site_logo_url);
          } catch (deleteError) {
            console.error("Failed to delete old logo:", deleteError);
            // Continue anyway
          }
        }

        // Upload new logo
        try {
          settingsData.site_logo_url = await uploadToS3(fileObject, folder);
        } catch (uploadError) {
          console.error("Failed to upload logo:", uploadError);
          return res.status(500).json({
            error: "UPLOAD_ERROR",
            message: "Failed to upload site logo",
          });
        } finally {
          // Clean up temp file
          if (fs.existsSync(logoFile.path)) {
            fs.unlinkSync(logoFile.path);
          }
        }
      }

      // ========== UPSERT SETTINGS ==========
      if (existingSettings.length > 0) {
        await db.update("tbl_settings", settingsData, "tenant_id = ?", [
          normalizedTenantId,
        ]);
      } else {
        settingsData.tenant_id = normalizedTenantId;
        settingsData.created_at = timestamp;
        await db.insert("tbl_settings", settingsData);
      }

      // ========== SEND NOTIFICATIONS ==========
      if (custom_domain && domain_type === "custom_domain") {
        try {
          await sendDomainNotification(
            email_id || currentSettings.email_id || tenantData.email,
            normalizedCustomDomain,
            dnsStatus
          );
        } catch (emailError) {
          console.error("Failed to send domain notification email:", emailError);
          // Don't fail the request
        }

        try {
          await sendWebhook(normalizedTenantId, normalizedCustomDomain, dnsStatus);
        } catch (webhookError) {
          console.error("Failed to send webhook:", webhookError);
          // Don't fail the request
        }
      }

      // ========== FETCH UPDATED SETTINGS ==========
      const updatedSettings = await db.selectAll(
        "tbl_settings",
        "*",
        "tenant_id = ?",
        [normalizedTenantId]
      );
      const updatedTenant = await db.selectAll("tbl_tenants", "*", "id = ?", [
        normalizedTenantId,
      ]);

      const response = {
        message: "Settings updated successfully",
        settings: {
          ...updatedSettings[0],
          subdomain: updatedTenant[0].domain,
          custom_domain: updatedTenant[0].custom_domain,
          custom_domain_status: updatedTenant[0].custom_domain_status,
        },
      };

      if (verificationInstructions) {
        response.ssl_setup = {
          status: sslStatus,
          message: sslStatus === "active"
            ? "SSL is already active!"
            : "SSL certificate will be issued automatically after DNS verification",
          hostname_id: cloudflareHostnameId,
        };
        response.verification = verificationInstructions;
      }

      res.status(200).json(response);
    } catch (error) {
      console.error("UpdateSettings Error:", error.stack);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to update settings",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
];

// ==================== CHECK SSL STATUS ====================
const CheckSSLStatus = [
  async (req, res) => {
    try {
      const { tenantId } = req.params;

      // Authorization check
      if (!checkTenantAuth(req, tenantId))
        return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });

      const settings = await db.selectAll(
        "tbl_settings",
        "primary_domain_name, ssl_status, dns_status, domain_type, cloudflare_hostname_id",
        "tenant_id = ?",
        [tenantId]
      );

      if (!settings || settings.length === 0) {
        return res.status(404).json({
          error: "SETTINGS_NOT_FOUND",
          message: "No settings found for this tenant",
        });
      }

      const domainType = settings[0].domain_type;

      if (domainType !== "custom_domain") {
        return res.json({
          success: true,
          domain_type: domainType,
          message: "SSL check not applicable for subdomains (already secured)",
          ssl_active: true,
        });
      }

      const domain = settings[0].primary_domain_name;

      console.log(`🔍 Checking SSL status for ${domain}`);

      // Get current status from Cloudflare
      const sslStatus = await getCustomHostnameStatus(domain);

      if (sslStatus.success) {
        const now = new Date().toISOString().slice(0, 19).replace("T", " ");

        // Update database with latest status
        await db.update(
          "tbl_settings",
          {
            ssl_status: sslStatus.ssl_status,
            dns_status: sslStatus.ssl_active ? "verified" : settings[0].dns_status,
            updated_at: now,
          },
          "tenant_id = ?",
          [tenantId]
        );

        return res.json({
          success: true,
          domain,
          domain_type: domainType,
          ssl: {
            status: sslStatus.ssl_status,
            active: sslStatus.ssl_active,
            issuer: sslStatus.certificate.issuer,
            expires_on: sslStatus.certificate.expires_on,
          },
          dns_status: sslStatus.ssl_active ? "verified" : settings[0].dns_status,
          https_ready: sslStatus.ssl_active,
          message: sslStatus.ssl_active
            ? `✅ Your store is live at https://${domain}`
            : `⏳ ${sslStatus.ssl_status === "pending_validation"
                ? "Waiting for DNS verification. Please add the TXT record."
                : "SSL certificate is being deployed..."}`,
        });
      }

      return res.status(500).json({
        error: "SSL_CHECK_FAILED",
        message: "Unable to check SSL status from Cloudflare",
        details: sslStatus.error,
      });
    } catch (error) {
      console.error("❌ CheckSSLStatus Error:", error);
      return res.status(500).json({
        error: "SERVER_ERROR",
        message: error.message,
      });
    }
  },
];

module.exports = {
  GetSettings,
  UpdateSettings,
  CheckSSLStatus,
};