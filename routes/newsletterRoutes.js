const express = require("express");
const router = express.Router();
const {
  subscribeNewsletter,
  unsubscribeNewsletter,
  getAllsubscribeNewsletter,
} = require("../controllers/newsletterController");
const { authenticateAdmin } = require("../middleware/authMiddleware");

router.post("/subscribe", subscribeNewsletter);
router.post("/unsubscribe", unsubscribeNewsletter);
router.get("/getallsubscribers", authenticateAdmin, getAllsubscribeNewsletter);

module.exports = router;
