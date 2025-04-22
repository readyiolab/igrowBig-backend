require("dotenv").config();
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { sendWelcomeEmail, sendPasswordChangeEmail, transporter } = require("../config/email");
const JWT_SECRET = process.env.JWT_SECRET || "123456";


// const UserSignup = [
//   body("email").isEmail().withMessage("Please enter a valid email address"),
//   body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
//   body("subscription_plan").isIn(['monthly', 'quarterly']).withMessage("Subscription plan must be 'monthly' or 'quarterly'").optional({ nullable: true }),
//   body("template_id").isInt({ min: 1, max: 3 }).withMessage("Template ID must be 1, 2, or 3"),
//   async (req, res) => {
//     try {
//       const errors = validationResult(req);
//       if (!errors.isEmpty()) {
//         return res.status(400).json({ errors: errors.array() });
//       }

//       const { name, email, password, subscription_plan = 'monthly', template_id } = req.body;

//       if (!name || !email || !password || !template_id) {
//         return res.status(400).json({ error: "MISSING_FIELDS", message: "Name, email, password, and template_id are required" });
//       }

//       const normalizedEmail = email.trim().toLowerCase();

//       // Check if email already exists
//       console.log(`Checking if email exists: ${normalizedEmail}`);
//       const existingUser = await db.select("tbl_users", "*", `email = '${normalizedEmail}'`);
//       console.log("Existing user result:", existingUser);
//       if (existingUser && (Array.isArray(existingUser) ? existingUser.length > 0 : existingUser)) {
//         return res.status(400).json({ error: "EMAIL_EXISTS", message: "Email is already registered" });
//       }

//       const hashedPassword = await bcrypt.hash(password, 10);

//       // Step 1: Insert into tbl_tenants
//       const tenantData = {
//         store_name: `${name}'s Store`,
//         template_id,
//         user_id: null,
//         domain: `${normalizedEmail.split('@')[0]}.example.com`,
//         site_title: `${name}'s Site`,
//         site_description: `Store for ${name}`,
//         is_live: 0,
//       };

//       console.log("Inserting tenant with data:", tenantData);
//       const tenantResult = await db.insert("tbl_tenants", tenantData);
//       console.log("Tenant insert result:", tenantResult);

//       if (!tenantResult || !Number.isInteger(tenantResult.insert_id) || tenantResult.insert_id <= 0) {
//         throw new Error("Failed to insert tenant into tbl_tenants: Invalid or missing insert_id");
//       }
//       const newTenantId = tenantResult.insert_id;
//       console.log(`Inserted tenant with ID: ${newTenantId}`);

//       // Step 2: Insert user into tbl_users
//       const userData = {
//         name,
//         email: normalizedEmail,
//         password_hash: hashedPassword,
//         tenant_id: newTenantId,
//         subscription_plan,
//         subscription_status: 'inactive',
//         template_id,
//       };

//       console.log("Inserting user with data:", userData);
//       const userResult = await db.insert("tbl_users", userData);
//       console.log("User insert result:", userResult);

//       if (!userResult || !Number.isInteger(userResult.insert_id) || userResult.insert_id <= 0) {
//         throw new Error("Failed to insert user into tbl_users: Invalid or missing insert_id");
//       }
//       console.log(`Inserted user with ID: ${userResult.insert_id}`);

//       // Step 3: Update tbl_tenants with user_id
//       console.log(`Updating tenant ID ${newTenantId} with user_id: ${userResult.insert_id}`);
//       const updateResult = await db.update("tbl_tenants", { user_id: userResult.insert_id }, `id = ${newTenantId}`);
//       console.log("Tenant update result:", updateResult);

//       if (!updateResult || !updateResult.affected_rows) {
//         throw new Error("Failed to update tbl_tenants with user_id");
//       }

//       const token = jwt.sign(
//         { id: userResult.insert_id, email: normalizedEmail, tenant_id: newTenantId },
//         JWT_SECRET,
//         { expiresIn: "2d" }
//       );

//       await sendWelcomeEmail(normalizedEmail, {
//         name,
//         email: normalizedEmail,
//         subscription_plan,
//         subscription_status: 'inactive',
//         template_id,
//       });

//       res.status(201).json({
//         message: "User registered successfully",
//         user_id: userResult.insert_id,
//         tenant_id: newTenantId,
//         subscription_plan,
//         template_id,
//         token,
//       });
//     } catch (err) {
//       console.error("Signup Error:", err);
//       if (err.code === "ER_DUP_ENTRY" && err.sqlMessage.includes("'email'")) {
//         return res.status(400).json({ error: "EMAIL_EXISTS", message: "Email is already registered" });
//       }
//       if (err.code === "ER_DUP_ENTRY") {
//         return res.status(400).json({ error: "DUPLICATE_ENTRY", message: "A duplicate entry error occurred", details: err.sqlMessage });
//       }
//       res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error", details: err.message });
//     }
//   },
// ];


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
      if (existingUser) { // `select` returns first row or undefined
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

      await sendWelcomeEmail(normalizedEmail, {
        name,
        email: normalizedEmail,
        subscription_plan,
        subscription_status: 'inactive',
        template_id,
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

    const result = await db.update("tbl_users", { subscription_status: 'active' }, `id=${user_id}`);
    if (!result.affected_rows) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    res.json({ message: "Subscription activated successfully" });
  } catch (err) {
    console.error("ActivateSubscription Error:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
  }
};

// User Login
// Backend - UserLogin.js
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
    const user = await db.select("tbl_users", "*", "email = ?", [normalizedEmail]);

    if (!user || (Array.isArray(user) && user.length === 0)) {
      return res.status(404).json({ 
        error: "EMAIL_NOT_FOUND", 
        message: "No account found with this email" 
      });
    }

    const userData = Array.isArray(user) ? user[0] : user;

    // Check if subscription_status is '1' (active)
    if (userData.subscription_status !== "1") {
      return res.status(403).json({
        error: "ACCOUNT_INACTIVE",
        message: "Your account is inactive. Please contact support to activate your account.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, userData.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: "INVALID_PASSWORD", 
        message: "Incorrect password" 
      });
    }

    const token = jwt.sign(
      { 
        id: userData.id, 
        email: userData.email, 
        tenant_id: userData.tenant_id 
      },
      JWT_SECRET,
      { expiresIn: "2d" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: { 
        id: userData.id, 
        name: userData.name, 
        email: userData.email, 
        tenant_id: userData.tenant_id,
        subscription_status: userData.subscription_status === "1" ? "active" : "inactive" // Normalize for frontend
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

// Forgot Password
const ForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "MISSING_EMAIL", message: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.select("tbl_users", "*", `email='${normalizedEmail}'`);
    if (!user) {
      return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
    }

    const resetToken = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "5m" }
    );

    const resetLink = `http://localhost:5173/reset-password/${resetToken}`;

    await transporter.sendMail({
      from: '"iGrow Big" <hello@arbilo.com>',
      to: normalizedEmail,
      subject: "Password Reset Request",
      html: `
        <div style="${emailStyles}">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0;">
            <tr>
              <td style="background-color: #4CAF50; padding: 20px; text-align: center;">
                <h2 style="color: #ffffff; margin: 0;">Password Reset Request</h2>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px;">
                <p>Hello ${user.name},</p>
                <p>You requested a password reset. Click below to reset your password (expires in 5 minutes):</p>
                <p><a href="${resetLink}" style="display: inline-block; background-color: #4CAF50; color: #ffffff; padding: 10px 15px; border-radius: 5px; text-decoration: none;">Reset Password</a></p>
                <p>If you didn’t request this, ignore this email.</p>
                <p>Regards,<br>The iGrow Big Team</p>
              </td>
            </tr>
            <tr>
              <td style="background-color: #f0f0f0; padding: 10px; text-align: center; font-size: 12px;">
                &copy; 2025 iGrow Big. All rights reserved.
              </td>
            </tr>
          </table>
        </div>
      `,
    });

    res.json({ message: "Password reset email sent" });
  } catch (err) {
    console.error("ForgotPassword Error:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
  }
};

// Reset Password
const ResetPassword = [
  body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters long"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, newPassword } = req.body;

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        if (err.name === "TokenExpiredError") {
          return res.status(400).json({ error: "TOKEN_EXPIRED", message: "Reset link has expired" });
        }
        return res.status(400).json({ error: "INVALID_TOKEN", message: "Invalid token" });
      }

      const userId = decoded.id;
      const user = await db.select("tbl_users", "*", `id=${userId}`);
      if (!user) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const result = await db.update("tbl_users", { password_hash: hashedPassword }, `id=${userId}`);

      if (!result.affected_rows) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
      }

      await sendPasswordChangeEmail(user.email, user.name); // Send password change notification
      res.json({ message: "Password updated successfully" });
    } catch (err) {
      console.error("ResetPassword Error:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
    }
  }
];

// Change Password
const ChangePassword = [
  body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters long"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      const user = await db.select("tbl_users", "*", `id=${userId}`);
      if (!user) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isPasswordValid) {
        return res.status(400).json({ error: "INVALID_PASSWORD", message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const result = await db.update("tbl_users", { password_hash: hashedPassword }, `id=${userId}`);

      if (!result.affected_rows) {
        return res.status(404).json({ error: "USER_NOT_FOUND", message: "User not found" });
      }

      await sendPasswordChangeEmail(user.email, user.name); // Send password change notification
      res.json({ message: "Password changed successfully" });
    } catch (err) {
      console.error("ChangePassword Error:", err);
      res.status(500).json({ error: "SERVER_ERROR", message: "Internal Server Error" });
    }
  }
];

// Get User
const GetUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (req.user.id !== parseInt(userId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "No access to this user" });
    }

    const user = await db.select("tbl_users", "id, name, email, tenant_id, subscription_status, created_at", `id=${userId}`);
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
  UserLogin,
  GetAllUsers,
  ForgotPassword,
  ResetPassword,
  ChangePassword,
  GetUser
};