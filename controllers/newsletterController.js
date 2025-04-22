const db = require("../config/db");
const { sendNewsletterSubscriptionEmail } = require("../config/email");

const subscribeNewsletter = async (req, res) => {
  const { email, name } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    // Check if already subscribed
    const existing = await db.select("tbl_newsletter", "*", "email = ?", [
      email,
    ]);

    if (existing) {
      return res
        .status(400)
        .json({ message: "You are already subscribed to the newsletter." });
    }

    // Insert subscriber
    await db.insert("tbl_newsletter", { email, name });

    // Send welcome email
    await sendNewsletterSubscriptionEmail(email, name);

    res.status(200).json({
      message: "Subscription successful. ",
    });
  } catch (err) {
    console.error("Newsletter Subscription Error:", err);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again later." });
  }
};

const unsubscribeNewsletter = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await db.select("tbl_newsletter", "*", "email = ?", [email]);
    if (!user) {
      return res
        .status(404)
        .json({ message: "Email not found in our subscribers list." });
    }

    await db.update("tbl_newsletter", { status: "inactive" }, "email = ?", [
      email,
    ]);

    return res
      .status(200)
      .json({ message: "You’ve been unsubscribed successfully." });
  } catch (error) {
    console.error("Unsubscribe Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getAllsubscribeNewsletter = async (req, res) => {
  try {
    const subscribers = await db.selectAll(
      "tbl_newsletter",
      "*",
      "",
      [],
      "ORDER BY id DESC"
    );
    res.status(200).json({ data: subscribers });
  } catch (error) {
    console.error("Error fetching subscribers:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getAllsubscribeNewsletter,
  unsubscribeNewsletter,
  subscribeNewsletter,
};
