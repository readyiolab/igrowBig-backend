require("dotenv").config();
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "123456";

// Authenticate regular users (sets req.user)
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  console.log("Received Token:", token);

  if (!token) {
    console.log("No token provided");
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("Decoded Token:", decoded);
    
    req.user = decoded; // For user-related routes
    next();
  } catch (err) {
    console.log("Token verification failed:", err.message);
    return res.status(403).json({ error: "INVALID_TOKEN", message: "Invalid or expired token" });
  }
};

// Authenticate admins (sets req.admin)
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  console.log("Admin Token:", token);

  if (!token) {
    console.log("No admin token provided");
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("Decoded Admin Token:", decoded);

    if (!decoded.admin_id) {
      console.log("Not an admin");
      return res.status(403).json({ error: "NOT_ADMIN", message: "Admin privileges required" });
    }

    req.admin = { admin_id: decoded.admin_id }; // Set req.admin for admin routes
    next();
  } catch (err) {
    console.log("Admin token verification failed:", err.message);
    return res.status(403).json({ error: "INVALID_TOKEN", message: "Invalid or expired token" });
  }
};

// Helper function to check tenant authorization
const checkTenantAuth = (req, tenantId) => {
  console.log("Checking Tenant Auth - User Tenant ID:", req.user?.tenant_id, "Requested Tenant ID:", tenantId);
  
  return req.user && req.user.tenant_id === parseInt(tenantId, 10);
};

module.exports = { authenticateUser, authenticateAdmin, checkTenantAuth };



// require("dotenv").config();
// const jwt = require("jsonwebtoken");

// const JWT_SECRET = process.env.JWT_SECRET || "123456";

// // Authenticate regular users (sets req.user)
// const authenticateUser = (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];

//   console.log("Received Token:", token);

//   if (!token) {
//     console.log("No token provided");
//     return res.status(401).json({ error: "AUTH_REQUIRED", message: "No token provided" });
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     console.log("Decoded Token:", decoded);

//     req.user = decoded; // For user-related routes
//     next();
//   } catch (err) {
//     console.log("Token verification failed:", err.message);
//     return res.status(403).json({ error: "INVALID_TOKEN", message: "Invalid or expired token" });
//   }
// };

// // Authenticate admins (sets req.user with admin_id)
// const authenticateAdmin = (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];

//   console.log("Admin Token:", token);

//   if (!token) {
//     console.log("No admin token provided");
//     return res.status(401).json({ error: "AUTH_REQUIRED", message: "No token provided" });
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     console.log("Decoded Admin Token:", decoded);

//     if (!decoded.admin_id) {
//       console.log("Not an admin");
//       return res.status(403).json({ error: "NOT_ADMIN", message: "Admin privileges required" });
//     }

//     req.user = { admin_id: decoded.admin_id }; // Set req.user consistently
//     next();
//   } catch (err) {
//     console.log("Admin token verification failed:", err.message);
//     return res.status(403).json({ error: "INVALID_TOKEN", message: "Invalid or expired token" });
//   }
// };

// // Helper function to check tenant authorization
// const checkTenantAuth = (req, tenantId) => {
//   console.log("Checking Tenant Auth - User Tenant ID:", req.user?.tenant_id, "Requested Tenant ID:", tenantId);

//   return req.user && req.user.tenant_id === parseInt(tenantId, 10);
// };

// module.exports = { authenticateUser, authenticateAdmin, checkTenantAuth };