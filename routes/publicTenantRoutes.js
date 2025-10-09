const express = require("express");
const router = express.Router();
const {
  getTenantSiteData,
  Bydomain
} = require("../controllers/publicTenantController.js");

// ✅ PRIMARY ROUTE: Get tenant by domain (subdomain or custom domain)
router.get("/site/by-domain", Bydomain);

// ✅ SECONDARY ROUTE: Get full site data by domain
router.get("/site/data", getTenantSiteData);

module.exports = router;