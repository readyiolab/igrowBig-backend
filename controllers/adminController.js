require("dotenv").config();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { sendWelcomeEmail, transporter } = require("../config/email");
const generator = require("generate-password");
const multer = require("multer");
const path = require("path");
const fs = require("fs"); // Sync methods: existsSync, mkdirSync
const { uploadToS3, deleteFromS3 } = require("../services/awsS3");
const slugify = require("slugify");
const JWT_SECRET = process.env.JWT_SECRET || "123456";
const { verifyTenantDomain } = require("../utils/dnsVerification");
const { sendDomainNotification } = require("../config/email");


// Configure multer for file handling - similar to product controller
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

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter,
});

// Multer config for training documents (max 4MB)
const trainingStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, "../uploads/training");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const trainingFileFilter = (req, file, cb) => {
  if (file.size > 4 * 1024 * 1024)
    return cb(new Error("Document files must be 4MB or less"));
  cb(null, true);
};

const trainingUpload = multer({
  storage: trainingStorage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: trainingFileFilter,
}).single("document");

const normalizeResult = (result) =>
  Array.isArray(result) && result.length > 0 ? result[0] : result || null;

// Middleware for admin authentication
const requireAdmin = (req, res, next) => {
  if (!req.admin || !req.admin.admin_id) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Admin authentication required",
    });
  }
  next();
};

// Admin Signup
const AdminSignup = [
  body("email").isEmail().withMessage("Please enter a valid email address"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "All fields are required",
        });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existingAdmin = await db.select("tbl_admin", "*", "email = ?", [
        normalizedEmail,
      ]);
      if (normalizeResult(existingAdmin)) {
        return res
          .status(400)
          .json({ error: "EMAIL_EXISTS", message: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const adminData = {
        name,
        email: normalizedEmail,
        password_hash: hashedPassword,
      };
      const result = await db.insert("tbl_admin", adminData);

      await sendWelcomeEmail(normalizedEmail, {
        email: normalizedEmail,
        password,
      });
      res.status(201).json({
        message: "Admin created successfully",
        admin_id: result.insert_id,
      });
    } catch (error) {
      console.error("AdminSignup Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to create admin",
        details: error.message,
      });
    }
  },
];

const AdminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const admin = await db.select("tbl_admin", "*", "email = ?", [
      normalizedEmail,
    ]);
    const adminData = normalizeResult(admin);
    if (!adminData) {
      return res.status(404).json({
        error: "EMAIL_NOT_FOUND",
        message: "No account found with this email",
      });
    }

    if (!(await bcrypt.compare(password, adminData.password_hash))) {
      return res
        .status(401)
        .json({ error: "INVALID_PASSWORD", message: "Incorrect password" });
    }

    const token = jwt.sign({ admin_id: adminData.id }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.status(200).json({
      message: "Login successful",
      token,
      admin: { id: adminData.id, name: adminData.name, email: adminData.email },
    });
  } catch (error) {
    console.error("AdminLogin Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to login",
      details: error.message,
    });
  }
};

const AdminchangePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const adminId = req.user.admin_id; // Set by authenticateAdmin

  // Input validation
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: "MISSING_FIELDS",
      message: "Current and new passwords are required.",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      error: "INVALID_PASSWORD",
      message: "New password must be at least 6 characters long.",
    });
  }

  try {
    // Fetch admin
    const adminResult = await db.select("tbl_admin", "*", "id = ?", [adminId]);
    const admin = normalizeResult(adminResult);
    if (!admin) {
      return res.status(404).json({
        error: "ADMIN_NOT_FOUND",
        message: "Admin account not found.",
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        error: "INVALID_CURRENT_PASSWORD",
        message: "Current password is incorrect.",
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password (without updated_at)
    await db.update(
      "tbl_admin",
      { password_hash: hashedNewPassword },
      "id = ?",
      [adminId]
    );

    return res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("ChangePassword Error:", error);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to change password. Please try again later.",
      details: error.message,
    });
  }
};

const CreateUser = [
  body('email').isEmail().withMessage('Please enter a valid email address'),
  body('name').notEmpty().withMessage('Name is required'),
  body('template_id')
    .optional()
    .isInt({ min: 1, max: 3 })
    .withMessage('Template ID must be between 1 and 3'),
  body('subscription_plan')
    .optional()
    .isIn(['yearly', 'monthly'])
    .withMessage('Subscription plan must be "yearly" or "monthly"'),
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, template_id = 1, subscription_plan = 'yearly' } = req.body;
      const normalizedEmail = email.trim().toLowerCase();
      const store_name = name ? `${name}'s Store` : `Default Store ${Date.now()}`;

      // Check if email exists
      const existingUser = await db.selectAll('tbl_users', '*', 'email = ?', [normalizedEmail]);
      if (existingUser.length > 0) {
        return res.status(400).json({
          error: 'EMAIL_EXISTS',
          message: 'Email already exists',
        });
      }

      // Generate unique slug
      let baseSlug = slugify(name, { lower: true, strict: true });
      let slug = baseSlug;
      let slugCount = 0;

      while (true) {
        const slugExists = await db.selectAll(
          "tbl_tenants",
          "id",
          "slug = ?",
          [slug]
        );
        if (slugExists.length === 0) break;
        slugCount++;
        slug = `${baseSlug}-${slugCount}`;
      }

      // Generate password
      const generatedPassword = generator.generate({
        length: 10,
        numbers: true,
        symbols: true,
        uppercase: true,
        lowercase: true,
      });
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);


      // Environment setup
      const baseDomain = process.env.NODE_ENV === 'production' ? 'begrat.com' : 'localhost:5173';
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const domain = `${baseDomain}/${slug}`;
      const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const updated_at = created_at;

      // Insert tenant
      const tenantData = {
        store_name: `${name}'s Store`,
        template_id,
        user_id: null,
        domain,
        slug,
        created_at,
        updated_at,
      };
      const tenantResult = await db.insert("tbl_tenants", tenantData);
      const tenantId = tenantResult.insert_id;

      // Insert user
      const userData = {
        name,
        email: normalizedEmail,
        tenant_id: tenantId,
        template_id,
        password_hash: hashedPassword,
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        subscription_status: 1,
        subscription_plan,
      };
      const userResult = await db.insert("tbl_users", userData);
      const userId = userResult.insert_id;


     // Update tenant with user_id
     await db.update("tbl_tenants", { user_id: userId }, "id = ?", [tenantId])
     

      // Insert settings
      const settingsData = {
        tenant_id: tenantId,
        domain_type: 'path',
        primary_domain_name: baseDomain,
        website_link: `${protocol}://${baseDomain}/${slug}`,
        first_name: name.split(' ')[0] || name,
        last_name: name.split(' ')[1] || '',
        email_id: normalizedEmail,
        mobile: "",
        address: "",
        publish_on_site: 1,
        skype: "",
        site_name: `${store_name}'s Site`,
        site_logo_url: null,
        nht_website_link: "https://example.com",
        nht_store_link: "https://example.com",
        nht_joining_link: "https://example.com",
        dns_status: 'verified',
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };
      await db.insert("tbl_settings", settingsData);

      // Send welcome email
      await sendWelcomeEmail(normalizedEmail, {
        name,
        email: normalizedEmail,
        password: generatedPassword,
        website_link: `${protocol}://${baseDomain}/${slug}`,
        backoffice: `${protocol}://${baseDomain}/backoffice-login`,
        subscription_status: 'Active',
        subscription_plan,
      });

      res.status(201).json({
        user_id: userId,
        tenant_id: tenantId,
        tenant_slug: slug,
        template_id,
        email: normalizedEmail,
        name,
        store_url: `${protocol}://${baseDomain}/${slug}`,
      });
    } catch (error) {
      console.error('CreateUser Error:', error.stack);
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          error: 'DUPLICATE_ENTRY',
          message: 'A user or tenant with this email or slug already exists',
        });
      }
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(400).json({
          error: 'DATABASE_ERROR',
          message: 'Invalid field in database operation',
        });
      }
      res.status(500).json({ error: 'SERVER_ERROR', message: error.message });
    }
  },
];

const GetTenantSettings = [
  async (req, res) => {
    try {
      const { tenantId } = req.params;
      const settings = await db.select("tbl_settings", "*", "tenant_id = ?", [
        tenantId,
      ]);
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

     

      res.status(200).json({
        message: "Tenant settings retrieved successfully",
        settings: settingsData,
      });
    } catch (error) {
      console.error("GetTenantSettings Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to retrieve settings",
      });
    }
  },
];


const UpdateTenantSettings = [
  upload.fields([{ name: "site_logo", maxCount: 1 }]),
  body("domain_type")
    .optional()
    .isIn(["path", "primary_domain"])
    .withMessage("Domain type must be 'path' or 'primary_domain'"),
  body("primary_domain_name")
    .optional()
    .custom((value, { req }) => {
      if (!value) return true; // Allow empty if optional
      if (process.env.NODE_ENV !== "production") {
        // Allow localhost or localhost:port in development
        return (
          value === "localhost" ||
          /^localhost(:\d+)?$/.test(value) ||
          /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
        );
      }
      // Enforce strict domain validation in production
      return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
    })
    .withMessage("Invalid domain name"),
  body("site_name")
    .optional()
    .notEmpty()
    .withMessage("Site name cannot be empty"),
  body("email_id").optional().isEmail().withMessage("Invalid email address"),
  body("first_name")
    .optional()
    .notEmpty()
    .withMessage("First name cannot be empty"),
  body("last_name")
    .optional()
    .notEmpty()
    .withMessage("Last name cannot be empty"),
  body("mobile")
    .optional()
    .isMobilePhone()
    .withMessage("Invalid mobile number"),
  body("address").optional().notEmpty().withMessage("Address cannot be empty"),
  body("skype").optional().notEmpty().withMessage("Skype ID cannot be empty"),
  body("nht_website_link")
    .optional()
    .isURL()
    .withMessage("Invalid website link"),
  body("nht_store_link").optional().isURL().withMessage("Invalid store link"),
  body("nht_joining_link")
    .optional()
    .isURL()
    .withMessage("Invalid joining link"),
  body("publish_on_site")
    .optional()
    .isBoolean()
    .withMessage("Publish on site must be a boolean"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { tenantId } = req.params;
      const {
        domain_type,
        primary_domain_name,
        site_name,
        email_id,
        first_name,
        last_name,
        mobile,
        address,
        skype,
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

      const tenant = await db.selectAll("tbl_tenants", "*", "id = ?", [normalizedTenantId]);
      if (tenant.length === 0) {
        return res.status(404).json({
          error: "TENANT_NOT_FOUND",
          message: "Tenant not found",
        });
      }

      let dnsStatus = currentSettings.dns_status || "pending";
      let domain = tenant[0].domain;
      let websiteLink = currentSettings.website_link;
      const baseDomain = process.env.NODE_ENV === "production" ? "begrat.com" : "localhost:5173";
      const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

      if (
        domain_type === "primary_domain" &&
        primary_domain_name &&
        primary_domain_name !== currentSettings.primary_domain_name
      ) {
        const domainExists = await db.selectAll(
          "tbl_settings",
          "id",
          "primary_domain_name = ? AND tenant_id != ?",
          [primary_domain_name, normalizedTenantId]
        );
        if (domainExists.length > 0) {
          return res.status(400).json({
            error: "DOMAIN_EXISTS",
            message: "Domain already taken",
          });
        }

        let dnsResult = { status: "verified" }; // Local default
        if (process.env.NODE_ENV === "production") {
          dnsResult = await verifyTenantDomain(normalizedTenantId, primary_domain_name);
          dnsStatus = dnsResult.status;
          if (dnsStatus !== "verified") {
            return res.status(400).json({
              error: "DNS_NOT_VERIFIED",
              message: `DNS verification failed for ${primary_domain_name}. Ensure the A record points to 139.59.3.58.`,
            });
          }
        } else {
          console.log(`Local testing: Add to /etc/hosts: 127.0.0.1 ${primary_domain_name}`);
        }

        domain = primary_domain_name;
        websiteLink = `${protocol}://${primary_domain_name}`;
      }

      if (
        domain_type === "path" &&
        currentSettings.domain_type === "primary_domain"
      ) {
        domain = `${baseDomain}/${tenant[0].slug}`;
        websiteLink = `${protocol}://${baseDomain}/${tenant[0].slug}`;
        dnsStatus = "verified";
      }

      if (domain !== tenant[0].domain) {
        const updateTenantResult = await db.update(
          "tbl_tenants",
          {
            domain,
            updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
          },
          "id = ?",
          [normalizedTenantId]
        );
        if (!updateTenantResult.status || updateTenantResult.affected_rows === 0) {
          throw new Error("Failed to update tenant domain");
        }
      }

      const settingsData = {
        domain_type: domain_type || currentSettings.domain_type || "path",
        primary_domain_name:
          domain_type === "primary_domain"
            ? primary_domain_name || currentSettings.primary_domain_name
            : baseDomain,
        website_link: websiteLink || currentSettings.website_link,
        first_name:
          first_name ||
          currentSettings.first_name ||
          tenant[0].store_name.split(" ")[0],
        last_name: last_name || currentSettings.last_name || "",
        email_id: email_id || currentSettings.email_id || tenant[0].email || "",
        mobile: mobile || currentSettings.mobile || null,
        address: address || currentSettings.address || "Not provided",
        publish_on_site:
          publish_on_site !== undefined
            ? publish_on_site
            : currentSettings.publish_on_site ?? 1,
        skype: skype || currentSettings.skype || null,
        site_name:
          site_name || currentSettings.site_name || tenant[0].store_name,
        nht_website_link:
          nht_website_link || currentSettings.nht_website_link || null,
        nht_store_link: nht_store_link || currentSettings.nht_store_link || null,
        nht_joining_link:
          nht_joining_link || currentSettings.nht_joining_link || null,
        dns_status: dnsStatus,
        updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };

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
      } else {
        settingsData.site_logo_url = currentSettings.site_logo_url || null;
      }

      if (existingSettings.length > 0) {
        const updateSettingsResult = await db.update(
          "tbl_settings",
          settingsData,
          "tenant_id = ?",
          [normalizedTenantId]
        );
        if (!updateSettingsResult.status) {
          throw new Error("Failed to update settings");
        }
      } else {
        settingsData.tenant_id = normalizedTenantId;
        settingsData.created_at = new Date()
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        const insertSettingsResult = await db.insert("tbl_settings", settingsData);
        if (!insertSettingsResult.status) {
          throw new Error("Failed to insert settings");
        }
      }

      if (domain !== tenant[0].domain) {
        await sendDomainNotification(
          email_id || currentSettings.email_id || tenant[0].email || "",
          domain,
          dnsStatus
        );
        await sendWebhook(normalizedTenantId, domain, dnsStatus);
      }

      const updatedSettings = await db.selectAll(
        "tbl_settings",
        "*",
        "tenant_id = ?",
        [normalizedTenantId]
      );

      res.status(200).json({
        message: "Settings updated successfully",
        settings: updatedSettings[0] || settingsData,
      });
    } catch (error) {
      console.error("UpdateTenantSettings Error:", error.stack);
      res.status(500).json({ error: "SERVER_ERROR", message: error.message });
    }
  },
];
const GetDomainLogs = async (req, res) => {
  try {
    const { tenantId } = req.params;

    // Validate tenantId
    const normalizedTenantId = parseInt(tenantId, 10);
    if (isNaN(normalizedTenantId) || normalizedTenantId <= 0) {
      return res.status(400).json({
        error: "INVALID_TENANT_ID",
        message: "Tenant ID must be a valid positive integer",
      });
    }

    const logs = await db.select(
      "tbl_domain_logs",
      "id, tenant_id, domain, status, message, created_at",
      "tenant_id = ? ORDER BY created_at DESC",
      [normalizedTenantId]
    );

    res.status(200).json({
      message: "Logs retrieved successfully",
      logs,
    });
  } catch (error) {
    console.error("GetDomainLogs Error:", error);
    res
      .status(500)
      .json({ error: "SERVER_ERROR", message: "Failed to retrieve logs" });
  }
};

// Update User Status (New)
const UpdateUserStatus = [
  requireAdmin,
  async (req, res) => {
    try {
      const { user_id, subscription_status } = req.body;
      const newStatus = subscription_status === "active" ? "1" : "0";

      // Update the status in tbl_users
      const updateData = {
        subscription_status: newStatus,
        updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };
      const result = await db.update("tbl_users", updateData, "id = ?", [
        user_id,
      ]);

      if (!result || result.affected_rows === 0) {
        return res.status(404).json({
          error: "USER_NOT_FOUND",
          message: "User not found",
        });
      }

      res.status(200).json({
        message: `User status set to ${subscription_status}`,
        user_id,
      });
    } catch (error) {
      console.error("UpdateUserStatus Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to update user status",
        details: error.message,
      });
    }
  },
];
// Reset User Password
const ResetUserPassword = [
  body("new_password")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters long"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { user_id, new_password, tenant_email } = req.body;
      if (!user_id || !new_password || !tenant_email) {
        return res.status(400).json({
          error: "MISSING_FIELDS",
          message: "User ID, email, and new password are required",
        });
      }

      const user = await db.select("tbl_users", "*", "id = ? AND email = ?", [
        user_id,
        tenant_email,
      ]);
      const userData = normalizeResult(user);
      if (!userData) {
        return res.status(404).json({
          error: "USER_NOT_FOUND",
          message: "User not found with the provided ID and email",
        });
      }

      const hashedPassword = await bcrypt.hash(new_password, 10);
      const result = await db.update(
        "tbl_users",
        { password_hash: hashedPassword },
        "id = ? AND email = ?",
        [user_id, tenant_email]
      );
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({
          error: "USER_NOT_FOUND",
          message: "User not found with the provided ID and email",
        });
      }

      await sendWelcomeEmail(
        tenant_email,
        {
          email: tenant_email,
          password: new_password,
          name: userData.name || "User",
          subscription_plan: userData.subscription_plan || "unknown",
          subscription_status: userData.subscription_status || "active",
        },
        true
      );

      res.json({
        message: "Password reset successfully and email sent to tenant",
      });
    } catch (error) {
      console.error("ResetUserPassword Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to reset password",
        details: error.message,
      });
    }
  },
];

// Send Tenant Notification
const SendTenantNotification = [
  body("title").notEmpty().withMessage("Title is required"),
  body("message").notEmpty().withMessage("Message is required"),
  requireAdmin,
  async (req, res) => {
    let notificationId = null;
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { title, message } = req.body;
      const adminId = req.admin.admin_id;

      const notificationData = {
        title,
        message,
        admin_id: adminId,
        status: "draft",
      };
      const notificationResult = await db.insert(
        "tbl_admin_notifications",
        notificationData
      );
      notificationId = notificationResult.insert_id;

      const tenants = await db.selectAll(
        "tbl_users",
        "email, name",
        "subscription_status = '1'"
      );
      if (!tenants || tenants.length === 0) {
        return res.status(404).json({
          error: "NO_TENANTS_FOUND",
          message: "No active tenants found",
        });
      }

      const emailPromises = tenants.map((tenant) =>
        transporter
          .sendMail({
            from: '"iGrow Big" <hello@arbilo.com>',
            to: tenant.email,
            subject: title,
            html: `<h2>${title}</h2><p>Dear ${tenant.name},</p><p>${message}</p><p>Best regards,<br>Admin Team</p>`,
          })
          .then((info) => {
            console.log(`Email sent to ${tenant.email}: ${info.response}`);
            return info;
          })
          .catch((error) => {
            console.error(`Failed to send email to ${tenant.email}:`, error);
            throw error;
          })
      );

      await Promise.all(emailPromises);
      await db.update("tbl_admin_notifications", { status: "sent" }, "id = ?", [
        notificationId,
      ]);

      res.status(200).json({
        message: "Notification sent successfully to all tenants",
        notification_id: notificationId,
        recipients_count: tenants.length,
      });
    } catch (error) {
      console.error("SendTenantNotification Error:", error);
      if (notificationId) {
        await db
          .update("tbl_admin_notifications", { status: "failed" }, "id = ?", [
            notificationId,
          ])
          .catch((err) =>
            console.error("Failed to update notification status:", err)
          );
      }
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to send notification",
        details: error.message,
      });
    }
  },
];

const GetAllTenantUsers = [
  requireAdmin,
  async (req, res) => {
    try {
      // Select user data from tbl_users
      const allUsers = await db.selectAll(
        "tbl_users",
        "id, name, email, subscription_status, subscription_plan, created_at, tenant_id"
      );

      if (!allUsers || allUsers.length === 0) {
        return res.status(200).json({
          message: "No tenant users found",
          userStats: { total: 0, active: 0, inactive: 0 },
          users: [],
        });
      }

      // Collect all tenant_ids to fetch their settings (website_link and dns_status) in one query
      const tenantIds = allUsers.map((user) => user.tenant_id);
      const placeholders = tenantIds.map(() => "?").join(",");

      // Modified query to include dns_status
      const settings = await db.queryAll(
        `SELECT tenant_id, website_link, dns_status FROM tbl_settings WHERE tenant_id IN (${placeholders})`,
        tenantIds
      );

      // Create a map for quick lookup of tenant settings
      const tenantSettingsMap = {};
      settings.forEach((setting) => {
        tenantSettingsMap[setting.tenant_id] = {
          website_link: setting.website_link,
          dns_status: setting.dns_status || "pending", // Default to 'pending' if null
        };
      });

      // Calculate user statistics
      const userStats = {
        total: allUsers.length,
        active: allUsers.filter((user) => user.subscription_status === "1").length,
        inactive: allUsers.filter((user) => user.subscription_status === "0").length,
      };

      // Format response with dns_status included
      res.status(200).json({
        message: "Tenant users retrieved successfully",
        userStats,
        users: allUsers.map((user) => ({
          id: user.id,
          tenant_id: user.tenant_id,
          name: user.name,
          email: user.email,
          status: user.subscription_status === "1" ? "active" : "inactive",
          plan: user.subscription_plan || "none",
          createdAt: user.created_at,
          website_link: tenantSettingsMap[user.tenant_id]?.website_link || null,
          dns_status: tenantSettingsMap[user.tenant_id]?.dns_status || "pending", // Include dns_status
        })),
      });
    } catch (error) {
      console.error("GetAllTenantUsers Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to retrieve tenant users",
        details: error.message,
      });
    }
  },
];

// Get All Tenant Messages
const GetAllTenantMessages = [
  requireAdmin,
  async (req, res) => {
    try {
      const messages = await db.selectAll(
        "tbl_admin_notifications",
        "id, title, message, admin_id, status, created_at"
      );
      if (!messages || messages.length === 0) {
        return res
          .status(200)
          .json({ message: "No tenant messages found", messages: [] });
      }

      res.status(200).json({
        message: "Tenant messages retrieved successfully",
        messages,
        total: messages.length,
      });
    } catch (error) {
      console.error("GetAllTenantMessages Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to retrieve tenant messages",
        details: error.message,
      });
    }
  },
];

// Delete Tenant Logo
const DeleteTenantLogo = [
  async (req, res) => {
    try {
      const { tenantId } = req.params;
      const settings = await db.select(
        "tbl_settings",
        "site_logo_url",
        "tenant_id = ?",
        [tenantId]
      );
      const settingsData = normalizeResult(settings);

      if (!settingsData || !settingsData.site_logo_url) {
        return res
          .status(400)
          .json({ error: "NO_LOGO", message: "No logo found for this tenant" });
      }

      await deleteFromS3(settingsData.site_logo_url);
      await db.update(
        "tbl_settings",
        { site_logo_url: null },
        "tenant_id = ?",
        [tenantId]
      );

      res.status(200).json({ message: "Logo deleted successfully" });
    } catch (error) {
      console.error("DeleteTenantLogo Error:", error);
      res
        .status(500)
        .json({ error: "SERVER_ERROR", message: "Failed to delete logo" });
    }
  },
];

// Create Category
const CreateCategory = [
  body("name").notEmpty().withMessage("Category name is required"),
  requireAdmin,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { name } = req.body;

      const existingCategory = await db.select(
        "tbl_training_categories",
        "id",
        "name = ?",
        [name]
      );
      if (normalizeResult(existingCategory)) {
        return res.status(400).json({
          error: "CATEGORY_EXISTS",
          message: "Category name already exists",
        });
      }

      const categoryData = {
        name,
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };

      const result = await db.insert("tbl_training_categories", categoryData);
      res.status(201).json({
        message: "Category created successfully",
        category_id: result.insert_id,
      });
    } catch (error) {
      console.error("CreateCategory Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to create category",
        details: error.message,
      });
    }
  },
];

// Get All Categories
const GetAllCategories = [
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.selectAll("tbl_training_categories", "*", true);
      console.log("Raw Categories Query Result:", result); // Debug log

      let categories = Array.isArray(result) ? result : result?.rows || [];
      console.log("Processed Categories:", categories); // Debug log

      if (!categories || categories.length === 0) {
        return res
          .status(200)
          .json({ message: "No categories found", categories: [], total: 0 });
      }

      res.status(200).json({
        message: "Categories retrieved successfully",
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          created_at: c.created_at,
          updated_at: c.updated_at,
        })),
        total: categories.length,
      });
    } catch (error) {
      console.error("GetAllCategories Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to retrieve categories",
        details: error.message,
      });
    }
  },
];

// Update Category
const UpdateCategory = [
  body("name")
    .optional()
    .notEmpty()
    .withMessage("Category name cannot be empty if provided"),
  requireAdmin,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { categoryId } = req.params;
      const { name } = req.body;

      const existingCategory = await db.select(
        "tbl_training_categories",
        "*",
        "id = ?",
        [categoryId]
      );
      const categoryData = normalizeResult(existingCategory);
      if (!categoryData) {
        return res
          .status(404)
          .json({ error: "CATEGORY_NOT_FOUND", message: "Category not found" });
      }

      if (name && name !== categoryData.name) {
        const duplicateCheck = await db.select(
          "tbl_training_categories",
          "id",
          "name = ? AND id != ?",
          [name, categoryId]
        );
        if (normalizeResult(duplicateCheck)) {
          return res.status(400).json({
            error: "CATEGORY_EXISTS",
            message: "Category name already exists",
          });
        }
      }

      const updatedData = {
        name: name || categoryData.name,
        updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };

      const result = await db.update(
        "tbl_training_categories",
        updatedData,
        "id = ?",
        [categoryId]
      );
      if (!result || result.affectedRows === 0) {
        return res.status(400).json({
          error: "UPDATE_FAILED",
          message: "Failed to update category",
        });
      }

      res.status(200).json({
        message: "Category updated successfully",
        category_id: categoryId,
      });
    } catch (error) {
      console.error("UpdateCategory Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to update category",
        details: error.message,
      });
    }
  },
];

// Delete Category
const DeleteCategory = [
  requireAdmin,
  async (req, res) => {
    try {
      const { categoryId } = req.params;

      const existingCategory = await db.select(
        "tbl_training_categories",
        "*",
        "id = ?",
        [categoryId]
      );
      if (!normalizeResult(existingCategory)) {
        return res
          .status(404)
          .json({ error: "CATEGORY_NOT_FOUND", message: "Category not found" });
      }

      const result = await db.delete("tbl_training_categories", "id = ?", [
        categoryId,
      ]);
      if (!result || result.affectedRows === 0) {
        return res.status(400).json({
          error: "DELETE_FAILED",
          message: "Failed to delete category",
        });
      }

      res.status(200).json({
        message: "Category deleted successfully",
        category_id: categoryId,
      });
    } catch (error) {
      console.error("DeleteCategory Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to delete category",
        details: error.message,
      });
    }
  },
];

// Create Training
const CreateTraining = [
  trainingUpload,
  body("title").notEmpty().withMessage("Training title is required"),
  body("category_id")
    .isInt({ min: 1 })
    .withMessage("Valid category ID is required"),
  body("training_url")
    .optional()
    .isURL()
    .withMessage("Training URL must be a valid URL"),
  body("status")
    .optional()
    .isIn(["ACTIVE", "INACTIVE"])
    .withMessage("Status must be 'ACTIVE' or 'INACTIVE'"),
  requireAdmin,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { title, category_id, training_url, status = "ACTIVE" } = req.body;

      const category = await db.select(
        "tbl_training_categories",
        "id, name",
        "id = ?",
        [category_id]
      );
      if (!normalizeResult(category)) {
        return res.status(400).json({
          error: "INVALID_CATEGORY",
          message: "Category ID does not exist",
        });
      }

      let documentUrl = null;
      if (req.file) {
        const folder = `training/category_${category_id}`;
        documentUrl = await uploadToS3(req.file, folder);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      }

      const trainingData = {
        category_id,
        title,
        training_url: training_url || null,
        document_url: documentUrl,
        status,
        created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };

      const result = await db.insert("tbl_manage_training", trainingData);
      res.status(201).json({
        message: "Training created successfully",
        training_id: result.insert_id,
      });
    } catch (error) {
      console.error("CreateTraining Error:", error);
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to create training",
        details: error.message,
      });
    }
  },
];

// Get All Trainings
const GetAllTrainings = [
  requireAdmin,
  async (req, res) => {
    try {
      const result = await db.queryAll(
        "SELECT t.*, c.name AS category_name FROM tbl_manage_training t LEFT JOIN tbl_training_categories c ON t.category_id = c.id"
      );
      console.log(result);

      let trainings = Array.isArray(result) ? result : result?.rows || [];
      if (!trainings || trainings.length === 0) {
        return res
          .status(200)
          .json({ message: "No trainings found", trainings: [], total: 0 });
      }

      res.status(200).json({
        message: "Trainings retrieved successfully",
        trainings: trainings.map((t) => ({
          id: t.id,
          category_id: t.category_id,
          category_name: t.category_name,
          title: t.title,
          training_url: t.training_url,
          document_url: t.document_url,
          status: t.status,
          created_at: t.created_at,
          updated_at: t.updated_at,
        })),
        total: trainings.length,
      });
    } catch (error) {
      console.error("GetAllTrainings Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to retrieve trainings",
        details: error.message,
      });
    }
  },
];

// Update Training
const UpdateTraining = [
  trainingUpload,
  body("title")
    .optional()
    .notEmpty()
    .withMessage("Training title cannot be empty if provided"),
  body("category_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Valid category ID is required"),
  body("training_url")
    .optional()
    .isURL()
    .withMessage("Training URL must be a valid URL"),
  body("status")
    .optional()
    .isIn(["ACTIVE", "INACTIVE"])
    .withMessage("Status must be 'ACTIVE' or 'INACTIVE'"),
  requireAdmin,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });

      const { trainingId } = req.params;
      const { title, category_id, training_url, status } = req.body;

      // Check if the training exists
      const existingTraining = await db.select(
        "tbl_manage_training",
        "*",
        "id = ?",
        [trainingId]
      );
      const trainingData = normalizeResult(existingTraining);
      if (!trainingData) {
        return res
          .status(404)
          .json({ error: "TRAINING_NOT_FOUND", message: "Training not found" });
      }

      // Validate category if provided
      if (category_id) {
        const category = await db.select(
          "tbl_training_categories",
          "id, name",
          "id = ?",
          [category_id]
        );
        if (!normalizeResult(category)) {
          return res.status(400).json({
            error: "INVALID_CATEGORY",
            message: "Category ID does not exist",
          });
        }
      }

      // Handle file upload and S3
      let documentUrl = trainingData.document_url;
      if (req.file) {
        const folder = `training/category_${
          category_id || trainingData.category_id
        }`;
        documentUrl = await uploadToS3(req.file, folder);

        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }

      const updatedData = {
        title: title || trainingData.title,
        category_id: category_id || trainingData.category_id,
        training_url: training_url || trainingData.training_url,
        document_url: documentUrl,
        status: status || trainingData.status,
        updated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      };

      const result = await db.update(
        "tbl_manage_training",
        updatedData,
        "id = ?",
        [trainingId]
      );

      if (!result || result.affectedRows === 0) {
        return res.status(400).json({
          error: "UPDATE_FAILED",
          message: "Failed to update training",
        });
      }

      res.status(200).json({
        message: "Training updated successfully",
        training_id: trainingId,
      });
    } catch (error) {
      console.error("UpdateTraining Error:", error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to update training",
        details: error.message,
      });
    }
  },
];

// Delete Training
const DeleteTraining = [
  requireAdmin,
  async (req, res) => {
    try {
      const { trainingId } = req.params;

      const existingTraining = await db.select(
        "tbl_manage_training",
        "*",
        "id = ?",
        [trainingId]
      );
      const trainingData = normalizeResult(existingTraining);
      if (!trainingData) {
        return res
          .status(404)
          .json({ error: "TRAINING_NOT_FOUND", message: "Training not found" });
      }

      if (trainingData.document_url)
        await deleteFromS3(trainingData.document_url);

      const result = await db.delete("tbl_manage_training", "id = ?", [
        trainingId,
      ]);
      if (!result || result.affectedRows === 0) {
        return res.status(400).json({
          error: "DELETE_FAILED",
          message: "Failed to delete training",
        });
      }

      res.status(200).json({
        message: "Training deleted successfully",
        training_id: trainingId,
      });
    } catch (error) {
      console.error("DeleteTraining Error:", error);
      res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to delete training",
        details: error.message,
      });
    }
  },
];

module.exports = {
  AdminSignup,
  AdminLogin,
  AdminchangePassword,
  CreateUser,
  ResetUserPassword,
  SendTenantNotification,
  GetAllTenantUsers,
  GetAllTenantMessages,
  GetTenantSettings,
  UpdateTenantSettings,
  GetDomainLogs,
  DeleteTenantLogo,
  UpdateUserStatus,
  CreateTraining,
  GetAllTrainings,
  UpdateTraining,
  DeleteTraining,
  CreateCategory,
  GetAllCategories,
  UpdateCategory,
  DeleteCategory,
};
