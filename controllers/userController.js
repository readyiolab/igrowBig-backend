require("dotenv").config();
const crypto = require("crypto"); // Added for token generation
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { 
  sendWelcomeEmail, 
  sendPasswordChangeEmail, 
  sendResetPasswordEmail, // Added import
  transporter 
} = require("../config/email");
const JWT_SECRET = process.env.JWT_SECRET || "123456";

const UserSignup = [
  body("email").isEmail().withMessage("Please enter a valid email address"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
  body("subscription_plan").isIn(['monthly', 'quarterly']).withMessage("Subscription plan must be 'monthly' or 'quarterly'").optional({ nullable: true }),
  body("template_id").isInt({ min: 1, max: 3 }).withMessage("Template ID must be 1, 2, or 3"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password, subscription_plan = 'monthly', template_id } = req.body;

      if (!name || !email || !password || !template_id) {
        return res.status(400).json({ error: "MISSING_FIELDS", message: "Name, email, password, and template_id are required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check if email already exists
      console.log(`Checking if email exists: ${normalizedEmail}`);
      const existingUser = await db.select("tbl_users", "*", "email = ?", [normalizedEmail], true);
      console.log("Existing user result:", existingUser);
      if (existingUser) {
        return res.status(400).json({ error: "EMAIL_EXISTS", message: "Email is already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Step 1: Insert into tbl_tenants
      const tenantData = {
        store_name: `${name}'s Store`,
        template_id,
        user_id: null,
        domain: `${normalizedEmail.split('@')[0]}.example.com`,
        site_title: `${name}'s Site`,
        site_description: `Store for ${name}`,
        is_live: 0,
      };

      const tenantResult = await db.insert("tbl_tenants", tenantData, true);
      if (!tenantResult || !Number.isInteger(tenantResult.insert_id) || tenantResult.insert_id <= 0) {
        throw new Error("Failed to insert tenant into tbl_tenants: Invalid or missing insert_id");
      }
      const newTenantId = tenantResult.insert_id;

      // Step 2: Insert user into tbl_users
      const userData = {
        name,
        email: normalizedEmail,
        password_hash: hashedPassword,
        tenant_id: newTenantId,
        subscription_plan,
        subscription_status: 'inactive',
        template_id,
      };

      const userResult = await db.insert("tbl_users", userData, true);
      if (!userResult || !Number.isInteger(userResult.insert_id) || userResult.insert_id <= 0) {
        throw new Error("Failed to insert user into tbl_users: Invalid or missing insert_id");
      }
      const newUserId = userResult.insert_id;

      // Step 3: Update tbl_tenants with user_id
      const updateResult = await db.update("tbl_tenants", { user_id: newUserId }, "id = ?", [newTenantId], true);
      if (!updateResult || !updateResult.affected_rows) {
        throw new Error("Failed to update tbl_tenants with user_id");
      }

      // Step 4: Insert default settings into tbl_settings
      const defaultSettings = {
        tenant_id: newTenantId,
        domain_type: "sub_domain",
        sub_domain: normalizedEmail.split('@')[0],
        primary_domain_name: "example.com",
        website_link: `https://${normalizedEmail.split('@')[0]}.example.com`,
        first_name: name.split(" ")[0] || name,
        last_name: name.split(" ")[1] || "",
        email_id: normalizedEmail,
        mobile: null,
        address: "Not set",
        publish_on_site: 0,
        skype: null,
        site_name: `${name}'s Site`,
        site_logo_url: null,
        nht_website_link: null,
        nht_store_link: null,
        nht_joining_link: null,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };

      const settingsResult = await db.insert("tbl_settings", defaultSettings, true);
      if (!settingsResult || !Number.isInteger(settingsResult.insert_id) || settingsResult.insert_id <= 0) {
        throw new Error("Failed to insert default settings into tbl_settings: Invalid or missing insert_id");
      }

      // Send welcome email with more data (adjusted to match email function signature)
      await sendWelcomeEmail(normalizedEmail, {
        name,
        email: normalizedEmail,
        password, // Plain text for welcome (security note: avoid in prod if possible)
        subscription_plan,
        subscription_status: 'inactive',
        login_url: 'http://localhost:3000/backoffice-login', // Update to your login URL
        store_url: `https://${normalizedEmail.split('@')[0]}.example.com`,
      });

      res.status(201).json({
        message: "User registered successfully",
        user_id: newUserId,
        tenant_id: newTenantId,
        subscription_plan,
        template_id
      });
    } catch (err) {
      console.error("Signup Error:", err);
      if (err.code === "ER_DUP_ENTRY" && err.sqlMessage.includes("'email'")) {
        return res.status(400).json({ error: "EMAIL_EXISTS", message: "Email is already registered" });
      }
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ error: "DUPLICATE_ENTRY", message: "A duplicate entry error occurred", details: err.sqlMessage });
      }
      res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error", details: err.message });
    }
  },
];

// Add a function to activate subscription (new)
const ActivateSubscription = async (req, res) => {
  try {
    const { user_id } = req.body; // Could come from payment confirmation
    if (!user_id) {
      return res.status(400).json({ error: "MISSING_USER_ID", message: "User ID is required" });
    }

    // Update to 'active' (or '1' if your DB uses integer/string consistently)
    const result = await db.update("tbl_users", { subscription_status: 'active' }, `id = ${user_id}`);
    if (!result || !result.affected_rows) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    // Optionally fetch user for email
    const user = await db.select("tbl_users", "email, name", `id = ${user_id}`, true);
    if (user) {
      // Send activation email or notification here if needed
      // await sendSomeActivationEmail(user.email, { name: user.name });
    }

    res.json({ message: "Subscription activated successfully" });
  } catch (err) {
    console.error("ActivateSubscription Error:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
  }
};

// User Login
const UserLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: "MISSING_FIELDS", 
        message: "Email and password are required" 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.select("tbl_users", "*", "email = ?", [normalizedEmail], true); // Assume single user

    if (!user) {
      return res.status(404).json({ 
        error: "EMAIL_NOT_FOUND", 
        message: "No account found with this email" 
      });
    }

    // Check subscription status - assuming 'active' or '1'; adjust if needed
    if (user.subscription_status !== 'active' && user.subscription_status !== '1') {
      return res.status(403).json({
        error: "ACCOUNT_INACTIVE",
        message: "Your account is inactive. Please contact support to activate your account.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: "INVALID_PASSWORD", 
        message: "Incorrect password" 
      });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        tenant_id: user.tenant_id 
      },
      JWT_SECRET,
      { expiresIn: "2d" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        tenant_id: user.tenant_id,
        subscription_status: user.subscription_status === '1' || user.subscription_status === 'active' ? "active" : "inactive"
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ 
      error: "SERVER_ERROR", 
      message: "Internal Server Error",
      details: err.message 
    });
  }
};

// Forgot Password
const ForgotPassword = [
  body("email").isEmail().withMessage("Please enter a valid email address"),
  async (req, res) => {
    try {
      console.log("[ForgotPassword] Request received:", req.body); // DEBUG: Log raw input

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error("[ForgotPassword] Validation errors:", errors.array()); // DEBUG
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;
      const normalizedEmail = email.trim().toLowerCase();
      console.log(`[ForgotPassword] Normalized email: ${normalizedEmail}`); // DEBUG

      // DB: Check user existence
      console.log("[ForgotPassword] Querying DB for user..."); // DEBUG
      const user = await db.select("tbl_users", "id, name", "email = ?", [normalizedEmail], true);
      console.log("[ForgotPassword] DB user result:", user ? { id: user.id, name: user.name } : null); // DEBUG (mask sensitive)

      if (!user) {
        // Security: Don't reveal existence
        console.log("[ForgotPassword] No user found – returning generic success"); // DEBUG
        return res.status(200).json({ message: "If the email exists, a reset link has been sent." });
      }

      // Generate secure token
      console.log("[ForgotPassword] Generating reset token..."); // DEBUG
      const resetToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = await bcrypt.hash(resetToken, 10);
      const expiry = new Date(Date.now() + 3600000); // 1 hour
      console.log(`[ForgotPassword] Token generated (hashed, expires: ${expiry})`); // DEBUG

      // DB: Update user with token
      console.log("[ForgotPassword] Updating DB with token hash..."); // DEBUG
      const updateResult = await db.update(
        "tbl_users", 
        { 
          reset_token_hash: hashedToken, 
          reset_token_expiry: expiry.toISOString().slice(0, 19).replace('T', ' ') 
        }, 
        "id = ?", 
        [user.id]
      );
      console.log("[ForgotPassword] DB update result:", updateResult); // DEBUG (e.g., affected_rows)

      if (!updateResult || !updateResult.affected_rows) {
        console.error("[ForgotPassword] DB update failed – no rows affected"); // DEBUG
        throw new Error("Failed to save reset token in DB");
      }

      // Generate reset link
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      if (!frontendUrl.startsWith('http')) {
        console.warn(`[ForgotPassword] Invalid FRONTEND_URL: ${frontendUrl} – defaulting`); // DEBUG
      }
      const resetLink = `${frontendUrl}/reset-password?token=${resetToken}&email=${normalizedEmail}`;
      console.log(`[ForgotPassword] Generated reset link: ${resetLink}`); // DEBUG (check length/validity)

      // Send email (with isolated try/catch)
      console.log(`[ForgotPassword] Sending reset email to ${normalizedEmail}...`); // DEBUG
      try {
        await sendResetPasswordEmail(normalizedEmail, resetLink, user.name || "User");
        console.log("[ForgotPassword] Reset email queued/sent successfully"); // DEBUG
      } catch (emailErr) {
        console.error("[ForgotPassword] Email send failed:", emailErr.message); // DEBUG
        console.error("[ForgotPassword] Email error stack:", emailErr.stack); // DEBUG
        // Proceed anyway for security (don't reveal failure)
      }

      // Success response (security obfuscation)
      console.log("[ForgotPassword] Route completed successfully"); // DEBUG
      res.status(200).json({ message: "If the email exists, a reset link has been sent." });
    } catch (err) {
      console.error("Forgot Password Error:", err.message); // DEBUG
      console.error("Full error:", err); // DEBUG (stack trace)
      res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
    }
  },
];

// Reset Password (Via token)
const ResetPassword = [
  body("token").notEmpty().withMessage("Token is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("newPassword").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, email, newPassword } = req.body;
      const normalizedEmail = email.trim().toLowerCase();

      const user = await db.select("tbl_users", "*", "email = ?", [normalizedEmail], true);
      if (!user || !user.reset_token_hash || !user.reset_token_expiry) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: "Invalid or missing reset token" });
      }

      const now = new Date();
      if (new Date(user.reset_token_expiry) < now) {
        return res.status(400).json({ error: "TOKEN_EXPIRED", message: "Reset token has expired" });
      }

      const isTokenValid = await bcrypt.compare(token, user.reset_token_hash);
      if (!isTokenValid) {
        return res.status(400).json({ error: "INVALID_TOKEN", message: "Invalid reset token" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password and clear token
      const updateResult = await db.update(
        "tbl_users", 
        { 
          password_hash: hashedPassword, 
          reset_token_hash: null, 
          reset_token_expiry: null 
        }, 
        "id = ?", 
        [user.id]
      );
      if (!updateResult || !updateResult.affected_rows) {
        throw new Error("Failed to update password");
      }

      await sendPasswordChangeEmail(normalizedEmail, user.name);

      res.status(200).json({ message: "Password reset successfully" });
    } catch (err) {
      console.error("Reset Password Error:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
    }
  },
];

// Get All Users
const GetAllUsers = async (req, res) => {
  try {
    const users = await db.selectAll("tbl_users", "id, name, email, tenant_id, subscription_status, created_at");
    if (!users || users.length === 0) {
      return res.status(404).json({ error: "NO_USERS_FOUND", message: "No users found" });
    }
    res.json({ message: "Users retrieved successfully", users });
  } catch (err) {
    console.error("GetAllUsers Error:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
  }
};

// Change Password (Authenticated user)
const ChangePassword = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters long"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id; // Assuming auth middleware sets req.user

      const user = await db.select("tbl_users", "*", `id = ${userId}`, true);
      if (!user) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isPasswordValid) {
        return res.status(400).json({ error: "INVALID_PASSWORD", message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const result = await db.update("tbl_users", { password_hash: hashedPassword }, `id = ${userId}`);

      if (!result || !result.affected_rows) {
        return res.status(500).json({ error: "UPDATE_FAILED", message: "Failed to update password" });
      }

      await sendPasswordChangeEmail(user.email, user.name);
      res.json({ message: "Password changed successfully" });
    } catch (err) {
      console.error("ChangePassword Error:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
    }
  }
];

// Get User (Authenticated)
const GetUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.user.id !== parseInt(userId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "No access to this user" });
    }

    const user = await db.select("tbl_users", "id, name, email, tenant_id, subscription_status, created_at", `id = ${userId}`, true);
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    res.json({ message: "User retrieved successfully", user });
  } catch (err) {
    console.error("GetUser Error:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
  }
};

module.exports = {
  UserSignup,
  ActivateSubscription, // Added to exports
  UserLogin,
  GetAllUsers,
  ForgotPassword,
  ResetPassword,
  ChangePassword,
  GetUser
};