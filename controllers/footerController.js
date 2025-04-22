const db = require("../config/db");
const { checkTenantAuth } = require("../middleware/authMiddleware");

// Get Social Links
const GetSocialLinks = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const socialLinks = await db.selectAll("tbl_footer_social_links", "*", "tenant_id = ?", [tenantId]);
    if (socialLinks.length === 0) {
      return res.status(404).json({ error: "SOCIAL_LINKS_NOT_FOUND", message: "Social links not found" });
    }
    res.json(socialLinks[0]);
  } catch (err) {
    console.error("Error in GetSocialLinks:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Upsert Social Links
const UpsertSocialLinks = async (req, res) => {
  const { tenantId } = req.params;
  const { facebook_url, twitter_url, youtube_url } = req.body;

  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const existingLinks = await db.selectAll("tbl_footer_social_links", "*", "tenant_id = ?", [tenantId]);

    const socialData = {
      tenant_id: tenantId,
      facebook_url: facebook_url || null,
      twitter_url: twitter_url || null,
      youtube_url: youtube_url || null,
    };

    if (existingLinks.length > 0) {
      await db.update("tbl_footer_social_links", socialData, "tenant_id = ?", [tenantId]);
      res.json({ message: "Social links updated" });
    } else {
      const result = await db.insert("tbl_footer_social_links", socialData);
      res.status(201).json({ message: "Social links added", id: result.insert_id });
    }
  } catch (err) {
    console.error("Error in UpsertSocialLinks:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Delete Social Links
const DeleteSocialLinks = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const existingLinks = await db.selectAll("tbl_footer_social_links", "*", "tenant_id = ?", [tenantId]);
    if (existingLinks.length === 0) {
      return res.status(404).json({ error: "SOCIAL_LINKS_NOT_FOUND", message: "Social links not found" });
    }

    await db.delete("tbl_footer_social_links", "tenant_id = ?", [tenantId]);
    res.json({ message: "Social links deleted" });
  } catch (err) {
    console.error("Error in DeleteSocialLinks:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Get Disclaimers
const GetDisclaimers = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const disclaimers = await db.selectAll("tbl_footer_disclaimers", "*", "tenant_id = ?", [tenantId]);
    if (disclaimers.length === 0) {
      return res.status(404).json({ error: "DISCLAIMERS_NOT_FOUND", message: "Disclaimers not found" });
    }
    res.json(disclaimers[0]);
  } catch (err) {
    console.error("Error in GetDisclaimers:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Upsert Disclaimers
const UpsertDisclaimers = async (req, res) => {
  const { tenantId } = req.params;
  const { site_disclaimer, product_disclaimer, income_disclaimer } = req.body;

  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const existingDisclaimers = await db.selectAll("tbl_footer_disclaimers", "*", "tenant_id = ?", [tenantId]);

    const disclaimerData = {
      tenant_id: tenantId,
      site_disclaimer: site_disclaimer || null,
      product_disclaimer: product_disclaimer || null,
      income_disclaimer: income_disclaimer || null,
    };

    if (existingDisclaimers.length > 0) {
      await db.update("tbl_footer_disclaimers", disclaimerData, "tenant_id = ?", [tenantId]);
      res.json({ message: "Disclaimers updated" });
    } else {
      const result = await db.insert("tbl_footer_disclaimers", disclaimerData);
      res.status(201).json({ message: "Disclaimers added", id: result.insert_id });
    }
  } catch (err) {
    console.error("Error in UpsertDisclaimers:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

// Delete Disclaimers
const DeleteDisclaimers = async (req, res) => {
  const { tenantId } = req.params;
  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const existingDisclaimers = await db.selectAll("tbl_footer_disclaimers", "*", "tenant_id = ?", [tenantId]);
    if (existingDisclaimers.length === 0) {
      return res.status(404).json({ error: "DISCLAIMERS_NOT_FOUND", message: "Disclaimers not found" });
    }

    await db.delete("tbl_footer_disclaimers", "tenant_id = ?", [tenantId]);
    res.json({ message: "Disclaimers deleted" });
  } catch (err) {
    console.error("Error in DeleteDisclaimers:", err);
    res.status(500).json({ error: "SERVER_ERROR", message: "Server error" });
  }
};

module.exports = {
  GetSocialLinks,
  UpsertSocialLinks,
  DeleteSocialLinks,
  GetDisclaimers,
  UpsertDisclaimers,
  DeleteDisclaimers,
};