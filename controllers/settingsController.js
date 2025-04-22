// userController.js
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { checkTenantAuth } = require("../middleware/authMiddleware");
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");
const { DNS_STATUS_ENUM } = require("../config/constants");
const { verifyTenantDomain } = require('../utils/dnsVerification');
const { sendDomainNotification } = require("../config/email");
const { sendWebhook } = require("../services/webhookService");
const { body, validationResult } = require("express-validator");

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

// Get Settings
const GetSettings = [
  async (req, res) => {
    try {
      const { tenantId } = req.params;
      if (!checkTenantAuth(req, tenantId)) {
        return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
      }

      const settings = await db.selectAll("tbl_settings", "*", "tenant_id = ?", [tenantId]);
      const settingsData = normalizeResult(settings);

      if (!settingsData) {
        const defaultSettings = {
          tenant_id: tenantId,
          domain_type: "sub_domain",
          primary_domain_name: "begrat.com",
          website_link: "https://begrat.com",
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
        };
        return res.status(200).json({
          message: "No settings found, returning default settings",
          settings: defaultSettings,
        });
      }

      if (!DNS_STATUS_ENUM.includes(settingsData.dns_status)) {
        settingsData.dns_status = "pending";
      }

      res.status(200).json({
        message: "Tenant settings retrieved successfully",
        settings: settingsData,
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

// Update Settings
const UpdateSettings = [
  upload,
  body("domain_type")
    .optional()
    .isIn(["sub_domain", "custom_domain"])
    .withMessage("Domain type must be 'sub_domain' or 'custom_domain'"),
  body("primary_domain_name")
    .optional()
    .matches(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    .withMessage("Invalid domain name"),
  body("sub_domain")
    .optional()
    .matches(/^[a-zA-Z0-9-]+$/)
    .withMessage("Sub-domain can only contain letters, numbers, and hyphens"),
  body("first_name").optional().notEmpty().withMessage("First name cannot be empty"),
  body("last_name").optional().notEmpty().withMessage("Last name cannot be empty"),
  body("email_id").optional().isEmail().withMessage("Invalid email address"),
  body("address").optional().notEmpty().withMessage("Address cannot be empty"),
  body("site_name").optional().notEmpty().withMessage("Site name cannot be empty"),
  body("mobile")
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage("Invalid mobile number"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { tenantId } = req.params;
      if (!checkTenantAuth(req, tenantId)) {
        return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
      }

      const {
        domain_type,
        sub_domain,
        primary_domain_name,
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
        return res.status(400).json({ error: "INVALID_TENANT_ID", message: "Tenant ID must be a valid number" });
      }

      // Fetch existing settings
      const existingSettings = (await db.select("tbl_settings", "*", "tenant_id = ?", [normalizedTenantId])) || [];
      const currentSettings = existingSettings.length > 0 ? existingSettings[0] : {};

      let dnsStatus = currentSettings.dns_status || "pending";
      let domain = "";

      // Use request protocol
      const protocol = req.protocol || "http";

      // Handle subdomain update
      if (domain_type === "sub_domain" && sub_domain && sub_domain !== currentSettings.sub_domain) {
        // Check subdomain uniqueness
        const subdomainExists = await db.select(
          "tbl_settings",
          "id",
          "sub_domain = ? AND tenant_id != ?",
          [sub_domain, normalizedTenantId]
        );
        if (subdomainExists.length > 0) {
          return res.status(400).json({ error: "SUBDOMAIN_EXISTS", message: "Subdomain already taken" });
        }

        // Update DNS records
        await addSubdomain(sub_domain);
        domain = `${sub_domain}.begrat.com`;
        dnsStatus = "verified";
      }

      // Handle custom domain update
      if (
        domain_type === "custom_domain" &&
        primary_domain_name &&
        primary_domain_name !== currentSettings.primary_domain_name
      ) {
        // Check domain uniqueness
        const domainExists = await db.select(
          "tbl_settings",
          "id",
          "primary_domain_name = ? AND tenant_id != ?",
          [primary_domain_name, normalizedTenantId]
        );
        if (domainExists.length > 0) {
          return res.status(400).json({ error: "DOMAIN_EXISTS", message: "Domain already taken" });
        }

        // Verify DNS
        const dnsResult = await verifyTenantDomain(normalizedTenantId, primary_domain_name);
        dnsStatus = dnsResult.status;
        domain = primary_domain_name;
      }

      // Update tenant domain if changed
      if (domain) {
        await db.update("tbl_tenants", { domain }, "id = ?", [normalizedTenantId]);
      }

      const website_link =
        domain_type === "custom_domain" && primary_domain_name
          ? `${protocol}://${primary_domain_name}`
          : domain_type === "sub_domain" && sub_domain
          ? `${protocol}://${sub_domain}.begrat.com`
          : currentSettings.website_link || `${protocol}://begrat.com`;

      const settingsData = {
        domain_type: domain_type || currentSettings.domain_type || "sub_domain",
        sub_domain: domain_type === "sub_domain" ? sub_domain || currentSettings.sub_domain : null,
        primary_domain_name:
          domain_type === "custom_domain" ? primary_domain_name || currentSettings.primary_domain_name : "begrat.com",
        website_link,
        dns_status: dnsStatus,
        first_name: first_name || currentSettings.first_name || "",
        last_name: last_name || currentSettings.last_name || "",
        email_id: email_id || currentSettings.email_id || "",
        mobile: mobile || currentSettings.mobile || null,
        address: address || currentSettings.address || "",
        skype: skype || currentSettings.skype || null,
        site_name: site_name || currentSettings.site_name || "",
        nht_website_link: nht_website_link || currentSettings.nht_website_link || null,
        nht_store_link: nht_store_link || currentSettings.nht_store_link || null,
        nht_joining_link: nht_joining_link || currentSettings.nht_joining_link || null,
        publish_on_site:
          publish_on_site !== undefined
            ? publish_on_site === "true" || publish_on_site === true
            : currentSettings.publish_on_site || false,
        updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };

      // Handle logo upload
      if (req.files && req.files["site_logo"]) {
        const logoFile = req.files["site_logo"][0];
        const folder = `settings/tenant_${normalizedTenantId}`;
        const fileObject = {
          path: logoFile.path,
          filename: `${Date.now()}-${logoFile.originalname}`,
          mimetype: logoFile.mimetype,
        };

        if (currentSettings.site_logo_url) {
          await deleteFromS3(currentSettings.site_logo_url);
        }

        settingsData.site_logo_url = await uploadToS3(fileObject, folder);
        if (fs.existsSync(logoFile.path)) fs.unlinkSync(logoFile.path);
      }

      // Upsert settings
      if (existingSettings.length > 0) {
        await db.update("tbl_settings", settingsData, "tenant_id = ?", [normalizedTenantId]);
      } else {
        settingsData.tenant_id = normalizedTenantId;
        settingsData.created_at = new Date().toISOString().slice(0, 19).replace("T", " ");
        try {
          await db.insert("tbl_settings", settingsData);
        } catch (insertError) {
          if (insertError.code === "ER_DUP_ENTRY") {
            await db.update("tbl_settings", settingsData, "tenant_id = ?", [normalizedTenantId]);
          } else {
            throw insertError;
          }
        }
      }

      // Fetch updated settings
      const updatedSettings = await db.select("tbl_settings", "*", "tenant_id = ?", [normalizedTenantId]);
      const normalizedSettings = updatedSettings.length > 0 ? updatedSettings[0] : settingsData;

      // Send notifications
      const tenant = await db.select("tbl_tenants", "*", "id = ?", [normalizedTenantId]);
      if (domain) {
        await sendDomainNotification(tenant[0]?.email || email_id, domain, dnsStatus);
        await sendWebhook(normalizedTenantId, domain, dnsStatus);
      }

      res.status(200).json({
        message: "Settings updated successfully",
        settings: normalizedSettings,
      });
    } catch (error) {
      console.error("UpdateSettings Error:", error.stack);
      res.status(500).json({ error: "SERVER_ERROR", message: error.message });
    }
  },
];

module.exports = {
  GetSettings,
  UpdateSettings,
};