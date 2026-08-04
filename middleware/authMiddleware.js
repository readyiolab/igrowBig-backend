const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");

// Authenticate regular users (sets req.user)
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "INVALID_TOKEN", message: "Invalid or expired token" });
  }
};

// Authenticate admins (sets req.admin)
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "AUTH_REQUIRED", message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.admin_id) {
      return res.status(403).json({ error: "NOT_ADMIN", message: "Admin privileges required" });
    }

    req.admin = { admin_id: decoded.admin_id };
    next();
  } catch (err) {
    return res.status(403).json({ error: "INVALID_TOKEN", message: "Invalid or expired token" });
  }
};

// Helper function to check tenant authorization
const checkTenantAuth = (req, tenantId) => {
  return req.user && req.user.tenant_id === parseInt(tenantId, 10);
};

module.exports = { authenticateUser, authenticateAdmin, checkTenantAuth };
