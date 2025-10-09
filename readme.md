// ==================== ROUTING STRUCTURE ====================

// adminRoutes.js - Admin manages ANY tenant
const express = require("express");
const router = express.Router();
const { 
  CreateUser, 
  GetTenantSettings, 
  UpdateTenantSettings 
} = require("../controllers/adminController");
const { authenticateAdmin } = require("../middleware/authMiddleware");

// Admin creates new user/tenant
router.post("/create-user", authenticateAdmin, CreateUser);

// Admin views ANY tenant's settings
router.get("/settings/:tenantId", authenticateAdmin, GetTenantSettings);

// Admin updates ANY tenant's settings
router.put("/settings/:tenantId", authenticateAdmin, UpdateTenantSettings);

module.exports = router;


// userRoutes.js - Tenant user manages THEIR OWN settings
const express = require("express");
const router = express.Router();
const { GetSettings, UpdateSettings } = require("../controllers/userController");
const { authenticateUser } = require("../middleware/authMiddleware");

// Tenant user views their own settings
router.get("/:tenantId/settings", authenticateUser, GetSettings);

// Tenant user updates their own settings
router.put("/:tenantId/settings", authenticateUser, UpdateSettings);

module.exports = router;


// app.js - Main application setup
const express = require("express");
const app = express();
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");

// Mount routes
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);


// ==================== API USAGE EXAMPLES ====================

/* 
┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO 1: Admin Creates New User/Tenant                      │
└─────────────────────────────────────────────────────────────────┘
*/

// Request
POST /api/admin/create-user
Headers: {
  "Authorization": "Bearer <ADMIN_TOKEN>"
}
Body: {
  "name": "John Doe",
  "email": "john@example.com",
  "template_id": 1,
  "subscription_plan": "yearly"
}

// Response
{
  "user_id": 123,
  "tenant_id": 456,
  "tenant_slug": "john-doe",
  "template_id": 1,
  "email": "john@example.com",
  "name": "John Doe",
  "store_url": "https://getdreamlife.com/john-doe"
}

// What happens:
// 1. Creates tenant with slug "john-doe"
// 2. Creates subdomain: john-doe.getdreamlife.com
// 3. Auto-verifies subdomain via Cloudflare
// 4. Creates default settings with domain_type: "path"
// 5. Sends welcome email with credentials


/* 
┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO 2: Tenant User Updates to Custom Subdomain            │
└─────────────────────────────────────────────────────────────────┘
*/

// Request
PUT /api/users/456/settings
Headers: {
  "Authorization": "Bearer <USER_TOKEN>",
  "Content-Type": "application/json"
}
Body: {
  "domain_type": "sub_domain",
  "sub_domain": "mystore",
  "site_name": "My Awesome Store"
}

// Response
{
  "message": "Settings updated successfully",
  "settings": {
    "tenant_id": 456,
    "domain_type": "sub_domain",
    "sub_domain": "mystore",
    "primary_domain_name": "getdreamlife.com",
    "website_link": "https://mystore.getdreamlife.com",
    "dns_status": "verified",
    "site_name": "My Awesome Store",
    ...
  }
}

// What happens:
// 1. Checks if "mystore" subdomain is available
// 2. Creates CNAME record in Cloudflare: mystore.getdreamlife.com → getdreamlife.com
// 3. Immediately marks as "verified" (Cloudflare-managed)
// 4. Updates tbl_tenants.domain to "mystore.getdreamlife.com"
// 5. Updates tbl_settings with new subdomain info


/* 
┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO 3: Tenant User Adds Custom Domain                     │
└─────────────────────────────────────────────────────────────────┘
*/

// Request
PUT /api/users/456/settings
Headers: {
  "Authorization": "Bearer <USER_TOKEN>",
  "Content-Type": "application/json"
}
Body: {
  "domain_type": "custom_domain",
  "primary_domain_name": "mystore.com"
}

// Response
{
  "message": "Settings updated successfully",
  "settings": {
    "tenant_id": 456,
    "domain_type": "custom_domain",
    "primary_domain_name": "mystore.com",
    "website_link": "https://mystore.com",
    "dns_status": "pending",
    ...
  },
  "verification": {
    "status": "pending",
    "token": "igrow-abc123-def456-ghi789",
    "instructions": {
      "method1": {
        "type": "TXT Record",
        "host": "_igrowbig-verification.mystore.com",
        "value": "igrow-abc123-def456-ghi789",
        "description": "Add this TXT record to your DNS settings"
      },
      "method2": {
        "type": "CNAME Record",
        "host": "mystore.com",
        "value": "cname.getdreamlife.com",
        "description": "Point your domain to our server using CNAME"
      },
      "method3": {
        "type": "A Record",
        "host": "mystore.com",
        "value": "82.29.160.167",
        "description": "Point your domain to our server using A record"
      }
    },
    "note": "Domain verification is in progress. You will be notified once verified."
  }
}

// What happens:
// 1. Checks if "mystore.com" is already used by another tenant
// 2. Creates verification token in tbl_settings.dns_verification_txt
// 3. Starts background polling (checks every 5 seconds, max 24 attempts)
// 4. Returns immediately with verification instructions
// 5. When verified, updates dns_status to "verified" and sends notification


/* 
┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO 4: Admin Updates Tenant's Domain (Override)           │
└─────────────────────────────────────────────────────────────────┘
*/

// Request
PUT /api/admin/settings/456
Headers: {
  "Authorization": "Bearer <ADMIN_TOKEN>",
  "Content-Type": "application/json"
}
Body: {
  "domain_type": "primary_domain",
  "primary_domain_name": "enterprise.com"
}

// Response
{
  "message": "Settings updated successfully",
  "settings": {
    "tenant_id": 456,
    "domain_type": "primary_domain",
    "primary_domain_name": "enterprise.com",
    "website_link": "http://enterprise.com",
    "dns_status": "pending",
    ...
  },
  "dnsInstructions": {
    "message": "Configure an A record pointing to 82.29.160.167.",
    "ip": "82.29.160.167",
    "status": "pending"
  }
}

// What happens:
// 1. Admin can force domain changes for any tenant
// 2. Starts verification process
// 3. Returns DNS configuration instructions
// 4. If verification fails, admin can manually override


/* 
┌─────────────────────────────────────────────────────────────────┐
│ SCENARIO 5: Admin Gets Tenant Settings                         │
└─────────────────────────────────────────────────────────────────┘
*/

// Request
GET /api/admin/settings/456
Headers: {
  "Authorization": "Bearer <ADMIN_TOKEN>"
}

// Response
{
  "message": "Tenant settings retrieved successfully",
  "settings": {
    "id": 789,
    "tenant_id": 456,
    "domain_type": "custom_domain",
    "sub_domain": null,
    "primary_domain_name": "mystore.com",
    "website_link": "https://mystore.com",
    "dns_status": "verified",
    "dns_verification_txt": "igrow-abc123...",
    "site_name": "My Store",
    "site_logo_url": "https://s3.../logo.png",
    ...
  }
}


/* 
┌─────────────────────────────────────────────────────────────────┐
│ VERIFICATION FLOW (Background Process)                          │
└─────────────────────────────────────────────────────────────────┘
*/

// After custom domain is submitted, background polling starts:

// Attempt 1 (0 seconds):
// - Check TXT: _igrowbig-verification.mystore.com
// - Check CNAME: mystore.com → cname.getdreamlife.com
// - Check A: mystore.com → 82.29.160.167
// Result: Not found, wait 5 seconds

// Attempt 2 (5 seconds):
// - Check TXT: Found! "igrow-abc123-def456-ghi789"
// - Verification successful!
// - Update dns_status to "verified"
// - Send email notification
// - Send webhook notification

// Database updates automatically:
UPDATE tbl_settings 
SET dns_status = 'verified', updated_at = NOW() 
WHERE tenant_id = 456;

UPDATE tbl_tenants 
SET domain = 'mystore.com' 
WHERE id = 456;


/* 
┌─────────────────────────────────────────────────────────────────┐
│ KEY DIFFERENCES: Admin vs Tenant User Routes                    │
└─────────────────────────────────────────────────────────────────┘
*/

// ADMIN ROUTES (/api/admin/settings/:tenantId)
// - Can manage ANY tenant's settings
// - Uses authenticateAdmin middleware
// - Uses UpdateTenantSettings controller
// - Has more control/override capabilities
// - Can view all tenant data

// TENANT USER ROUTES (/api/users/:tenantId/settings)
// - Can only manage THEIR OWN settings
// - Uses authenticateUser middleware (checks req.user.tenant_id === tenantId)
// - Uses UpdateSettings controller
// - Limited to their own data
// - Includes domain verification instructions in response


/* 
┌─────────────────────────────────────────────────────────────────┐
│ AUTHENTICATION FLOW                                             │
└─────────────────────────────────────────────────────────────────┘
*/

// Admin Login
POST /api/admin/login
Body: { "email": "admin@getdreamlife.com", "password": "admin123" }
Response: { "token": "eyJhbGci...", "role": "admin" }

// Use token in subsequent requests
GET /api/admin/settings/456
Headers: { "Authorization": "Bearer eyJhbGci..." }

// ---

// Tenant User Login
POST /api/users/login
Body: { "email": "john@example.com", "password": "pass123" }
Response: { "token": "eyJhbGci...", "tenant_id": 456, "role": "user" }

// Use token (middleware checks tenant_id matches)
PUT /api/users/456/settings
Headers: { "Authorization": "Bearer eyJhbGci..." }
Body: { "domain_type": "sub_domain", "sub_domain": "mystore" }