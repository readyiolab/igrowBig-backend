const db = require("../config/db");
const { checkTenantAuth } = require("../middleware/authMiddleware");

// Add a new subscriber (for website form)
const AddSubscriber = async (req, res) => {
  const { tenantId } = req.params;
  const { name, email } = req.body;

  console.log("AddSubscriber - req.body:", req.body);

  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        error: "MISSING_FIELD",
        message: "Name and email are required",
      });
    }
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "INVALID_EMAIL",
        message: "Invalid email format",
      });
    }

    // Check if email already exists for this tenant
    const existingSubscriber = await db.select(
      "tbl_subscribers",
      "id",
      `tenant_id = ? AND email = ?`,
      [tenantId, email]
    );
    if (existingSubscriber && (Array.isArray(existingSubscriber) ? existingSubscriber.length > 0 : existingSubscriber)) {
      return res.status(400).json({
        error: "EMAIL_EXISTS",
        message: "Email is already subscribed for this tenant",
      });
    }

    const subscriberData = {
      tenant_id: tenantId,
      name,
      email,
      status: "ACTIVE",
      subscribed_at: new Date(),
    };

    const result = await db.insert("tbl_subscribers", subscriberData);
    res.status(201).json({
      message: "Subscriber added",
      subscriber_id: result.insert_id,
    });
  } catch (err) {
    console.error("Error in AddSubscriber:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: err.message || "Server error",
    });
  }
};

// Get all subscribers for a tenant
const GetSubscribers = async (req, res) => {
  const { tenantId } = req.params;

  if (!checkTenantAuth(req, tenantId)) {
    return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
  }

  try {
    const subscribers = await db.selectAll(
      "tbl_subscribers",
      "*",
      `tenant_id = ?`,
      [tenantId],
      "ORDER BY subscribed_at DESC"
    );

    console.log("GetSubscribers - subscribers:", subscribers);

    if (!subscribers || subscribers.length === 0) {
      return res.status(200).json({
        message: "No subscribers found",
        subscribers: [],
      });
    }

    const formattedSubscribers = subscribers.map((subscriber) => ({
      id: subscriber.id,
      name: subscriber.name,
      email: subscriber.email,
      status: subscriber.status.toLowerCase(), // Normalize to lowercase for frontend
      subscribed_at: subscriber.subscribed_at,
    }));

    res.json({
      message: "Subscribers retrieved successfully",
      subscribers: formattedSubscribers,
      count: formattedSubscribers.length,
    });
  } catch (err) {
    console.error("Error in GetSubscribers:", err);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: err.message || "Server error",
    });
  }
};

module.exports = {
  AddSubscriber,
  GetSubscribers,
};