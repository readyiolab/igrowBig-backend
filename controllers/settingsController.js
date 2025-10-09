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
const { startVerificationProcess } = require("../services/domainVerificationService");

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
      
      // Authorization check - tenant user can only access their own settings
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
          custom_domain: null,
        };
        return res.status(200).json({
          message: "No settings found, returning default settings",
          settings: defaultSettings,
        });
      }

      const settingsData = settings[0];
      const tenantData = tenant[0];

      // Ensure dns_status is valid
      if (!DNS_STATUS_ENUM || !DNS_STATUS_ENUM.includes(settingsData.dns_status)) {
        settingsData.dns_status = "pending";
      }

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
      let websiteLink = currentSettings.website_link;
      let verificationToken = null;
      let verificationInstructions = null;

      // ========== CUSTOM DOMAIN LOGIC ==========
      if (domain_type === "custom_domain" && custom_domain) {
        const normalizedCustomDomain = custom_domain.trim().toLowerCase();

        // Validate custom domain format more strictly
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

        // Start DNS verification process
        try {
          const verificationResult = await startVerificationProcess(
            normalizedTenantId,
            normalizedCustomDomain
          );
          
          verificationToken = verificationResult.token;
          dnsStatus = "pending";

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

          websiteLink = `${protocol}://${normalizedCustomDomain}`;

          console.log(`Custom domain verification started for tenant ${tenantId}: ${normalizedCustomDomain}`);

          verificationInstructions = {
            status: "pending",
            token: verificationToken,
            domain: normalizedCustomDomain,
            instructions: {
              step1: {
                title: "Verify Domain Ownership",
                type: "TXT Record",
                host: `_igrowbig-verification.${normalizedCustomDomain}`,
                value: verificationToken,
                ttl: "Automatic or 3600",
                description: "Add this TXT record to your DNS provider to prove you own this domain",
              },
              step2: {
                title: "Point Domain to Our Platform",
                type: "CNAME Record (Recommended)",
                host: normalizedCustomDomain === normalizedCustomDomain.replace(/^www\./, '') 
                  ? normalizedCustomDomain 
                  : normalizedCustomDomain.replace(/^www\./, ''),
                value: baseDomain,
                ttl: "Automatic or 3600",
                description: "After verification, add this CNAME record to make your domain work",
              },
              step3_alternative: {
                title: "Alternative: Direct IP Pointing",
                type: "A Record",
                host: normalizedCustomDomain,
                value: process.env.SERVER_IP || "139.59.8.68",
                ttl: "Automatic or 3600",
                description: "If CNAME doesn't work, use A record instead",
              },
            },
            note: "1. Add the TXT record first and wait 1-5 minutes for verification. 2. Once verified, add the CNAME or A record. 3. DNS changes can take up to 48 hours to fully propagate.",
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

      // ========== REVERT TO SUBDOMAIN ==========
      if (domain_type === "sub_domain" && tenantData.custom_domain) {
        websiteLink = `${protocol}://${tenantData.domain}`;
        dnsStatus = "verified"; // Subdomains are always verified

        await db.update(
          "tbl_tenants",
          {
            custom_domain: null,
            custom_domain_status: "pending",
            updated_at: timestamp,
          },
          "id = ?",
          [normalizedTenantId]
        );

        console.log(`Tenant ${tenantId} reverted to subdomain: ${tenantData.domain}`);
      }

      // ========== UPDATE SETTINGS ==========
      const settingsData = {
        domain_type: domain_type || currentSettings.domain_type || "sub_domain",
        primary_domain_name:
          domain_type === "custom_domain" && custom_domain
            ? custom_domain
            : tenantData.domain,
        website_link: websiteLink || currentSettings.website_link,
        dns_status: dnsStatus,
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
            custom_domain,
            dnsStatus
          );
        } catch (emailError) {
          console.error("Failed to send domain notification email:", emailError);
          // Don't fail the request
        }
        
        try {
          await sendWebhook(normalizedTenantId, custom_domain, dnsStatus);
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

module.exports = {
  GetSettings,
  UpdateSettings,
};