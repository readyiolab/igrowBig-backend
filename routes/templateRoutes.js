// routes/templateRoutes.js
const express = require('express');
const router = express.Router();
const {GetTemplates} = require("../controllers/templateController");

// Change '/template' to '/'
router.get('/', GetTemplates);

module.exports = router;