// controllers/TemplateController.js
const db = require("../config/db");

const GetTemplates = async (req, res) => {
  try {
      const templates = await db.selectAll('tbl_templates', 'id, name, description, thumbnail_url AS image');
      if (!Array.isArray(templates)) {
          console.error('Invalid db.select result for templates:', templates);
          return res.status(500).json({ error: 'DATABASE_ERROR', message: 'Invalid database response' });
      }
      res.json(templates);
  } catch (err) {
      console.error('Error fetching templates:', err);
      res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch templates' });
  }
};

module.exports = { GetTemplates };