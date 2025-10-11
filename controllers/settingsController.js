const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");
const { DNS_STATUS_ENUM } = require("../config/constants");
const { sendWebhook } = require("../services/webhookService");
const { body, validationResult } = require("express-validator");
const { startVerificationProcess } = require("../services/domainVerificationService");

// Multer configuration
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
      return cb(new Error("Site logo must be JPEG/JPG/PNG"));
    }
    cb(null, true);
  },
}).fields([{ name: "site_logo", maxCount: 1 }]);

// ==================== GET SETTINGS ====================
const GetSettings = [
  async (req, res) => {
    try {
      const { tenantId } = req.params;
      
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
          site_name: "Default Site",
          site_logo_url: null,
          dns_status: "pending",
          custom_domain: null,
        };
        return res.status(200).json({
          message: "No settings found, returning defaults",
          settings: defaultSettings,
        });
      }

      const settingsData = settings[0];
      const tenantData = tenant[0];

      if (!DNS_STATUS_ENUM || !DNS_STATUS_ENUM.includes(settingsData.dns_status)) {
        settingsData.dns_status = "pending";
      }

      const enrichedSettings = {
        ...settingsData,
        subdomain: tenantData.domain,
        custom_domain: tenantData.custom_domain,
        custom_domain_status: tenantData.custom_domain_status,
      };

      res.status(200).json({
        message: "Settings retrieved successfully",
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
      // Validate domain format
      const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}?$/;
      return domainRegex.test(value);
    })
    .withMessage("Invalid domain format (e.g., example.com or www.example.com)"),
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
          message: "Invalid tenant ID",
        });
      }

      const existingSettings = await db.selectAll(
        "tbl_settings",
        "*",
        "tenant_id = ?",
        [normalizedTenantId]
      );
      const currentSettings = existingSettings.length > 0 ? existingSettings[0] : {};

      const tenant = await db.selectAll("tbl_tenants", "*", "id = ?", [normalizedTenantId]);
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
      let verificationInstructions = null;

      // ========== CUSTOM DOMAIN SETUP ==========
      if (domain_type === "custom_domain" && custom_domain) {
        const normalizedCustomDomain = custom_domain.trim().toLowerCase().replace(/^https?:\/\//, '');

        // Prevent using base domain
        if (normalizedCustomDomain === baseDomain || 
            normalizedCustomDomain === `www.${baseDomain}` ||
            normalizedCustomDomain.endsWith(`.${baseDomain}`)) {
          return res.status(400).json({
            error: "INVALID_DOMAIN",
            message: "Cannot use platform domain as custom domain",
          });
        }

        // Check if domain already used by another tenant
        const domainExists = await db.selectAll(
          "tbl_tenants",
          "id, store_name",
          "custom_domain = ? AND id != ?",
          [normalizedCustomDomain, normalizedTenantId]
        );
        
        if (domainExists.length > 0) {
          return res.status(400).json({
            error: "DOMAIN_TAKEN",
            message: "This domain is already connected to another store",
          });
        }

        // Get user email for notifications
        const userEmail = email_id || currentSettings.email_id || tenantData.email;

        // Start verification process
        try {
          const verificationResult = await startVerificationProcess(
            normalizedTenantId,
            normalizedCustomDomain,
            userEmail
          );
          
          dnsStatus = "pending";
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

          console.log(`✅ Custom domain setup started: ${normalizedCustomDomain}`);

          // Prepare instructions for response
          verificationInstructions = {
            status: "pending",
            token: verificationResult.token,
            domain: normalizedCustomDomain,
            message: "Check your email for detailed setup instructions",
            steps: {
              step1: {
                title: "Verify Domain Ownership (Add This First)",
                type: "TXT Record",
                name: `_igrowbig-verification.${normalizedCustomDomain}`,
                value: verificationResult.token,
                ttl: "3600 (or Automatic)",
                priority: "REQUIRED - Add this first"
              },
              step2: {
                title: "Point Domain to Platform (Add After Verification)",
                type: "CNAME Record (Recommended)",
                name: `${normalizedCustomDomain.replace(/^www\./, '')} (or @)`,
                value: baseDomain,
                ttl: "3600 (or Automatic)",
                alternative: {
                  type: "A Record",
                  name: `@ (or ${normalizedCustomDomain})`,
                  value: process.env.SERVER_IP || "139.59.8.68",
                }
              }
            },
            notes: [
              "Add TXT record first - we'll auto-verify in 1-5 minutes",
              "After verification, add CNAME or A record",
              "DNS changes can take up to 48 hours to propagate",
              "You'll receive email updates on verification status"
            ]
          };

        } catch (verificationError) {
          console.error("Verification setup error:", verificationError);
          return res.status(500).json({
            error: "VERIFICATION_FAILED",
            message: "Failed to start domain verification",
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

        console.log(`✅ Reverted to subdomain: ${tenantData.domain}`);
      }

      // ========== UPDATE SETTINGS ==========
      const settingsData = {
        domain_type: domain_type || currentSettings.domain_type || "sub_domain",
        primary_domain_name:
          domain_type === "custom_domain" && custom_domain
            ? custom_domain.trim().toLowerCase()
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

        // Delete old logo
        if (currentSettings.site_logo_url) {
          try {
            await deleteFromS3(currentSettings.site_logo_url);
          } catch (deleteError) {
            console.error("Failed to delete old logo:", deleteError);
          }
        }

        // Upload new logo
        try {
          settingsData.site_logo_url = await uploadToS3(fileObject, folder);
        } catch (uploadError) {
          console.error("Logo upload failed:", uploadError);
          return res.status(500).json({
            error: "UPLOAD_ERROR",
            message: "Failed to upload logo",
          });
        } finally {
          if (fs.existsSync(logoFile.path)) {
            fs.unlinkSync(logoFile.path);
          }
        }
      }

      // ========== SAVE SETTINGS ==========
      if (existingSettings.length > 0) {
        await db.update("tbl_settings", settingsData, "tenant_id = ?", [normalizedTenantId]);
      } else {
        settingsData.tenant_id = normalizedTenantId;
        settingsData.created_at = timestamp;
        await db.insert("tbl_settings", settingsData);
      }

      // ========== SEND WEBHOOK ==========
      if (custom_domain && domain_type === "custom_domain") {
        try {
          await sendWebhook(normalizedTenantId, custom_domain, dnsStatus);
        } catch (webhookError) {
          console.error("Webhook failed:", webhookError);
        }
      }

      // ========== FETCH UPDATED DATA ==========
      const updatedSettings = await db.selectAll(
        "tbl_settings",
        "*",
        "tenant_id = ?",
        [normalizedTenantId]
      );
      const updatedTenant = await db.selectAll("tbl_tenants", "*", "id = ?", [normalizedTenantId]);

      const response = {
        success: true,
        message: custom_domain && domain_type === "custom_domain" 
          ? "Custom domain setup started. Check your email for instructions." 
          : "Settings updated successfully",
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