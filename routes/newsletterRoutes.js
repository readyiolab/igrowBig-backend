const express = require("express");
const router = express.Router();
const {
  subscribeNewsletter,
  unsubscribeNewsletter,
  getAllsubscribeNewsletter,
} = require("../controllers/newsletterController");

router.post("/subscribe", subscribeNewsletter);
router.post("/unsubscribe", unsubscribeNewsletter);
router.get("/getallsubscribers", getAllsubscribeNewsletter);

module.exports = router;
