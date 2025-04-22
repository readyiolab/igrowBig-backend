const db = require("../config/db");
const {checkTenantAuth,authenticateUser} = require("../middleware/authMiddleware");

const GetTenant = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const tenant = await db.select("tbl_tenants", "*", `id = ${tenantId}`);
    if (!tenant) return res.status(404).json({ error: "TENANT_NOT_FOUND", message: "Tenant not found" });
    res.json(tenant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

const UpdateTenant = async (req, res) => {
  const { tenantId } = req.params;
  const { store_name, template_id, domain, site_title, site_description, is_live } = req.body;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const updateData = {};
    if (store_name) updateData.store_name = store_name;
    if (template_id) updateData.template_id = template_id;
    if (domain) updateData.domain = domain;
    if (site_title) updateData.site_title = site_title;
    if (site_description) updateData.site_description = site_description;
    if (typeof is_live !== "undefined") updateData.is_live = is_live;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "NO_DATA", message: "No data to update" });
    }
    await db.update("tbl_tenants", updateData, `id = ${tenantId}`);
    res.json({ message: "Tenant updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  GetTenant,
  UpdateTenant,
};

module.exports = {
  GetTenant,
  UpdateTenant,
};
