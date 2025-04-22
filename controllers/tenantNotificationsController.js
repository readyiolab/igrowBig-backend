const db = require("../config/db");
const { checkTenantAuth } = require("../middleware/authMiddleware");

// Get Tenant Notifications
const GetTenantNotifications = async (req, res) => {
  try {
    console.log("===== DEBUGGING START =====");
    console.log("Request Headers:", req.headers);
    console.log("Request Params:", req.params);
    console.log("Request User:", req.user);

    const tenantId = req.user.tenant_id; // Extract tenantId from JWT payload

    // Check if tenantId exists
    if (!tenantId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Tenant ID is missing from user data" });
    }

    // Check if user is authenticated for the tenant
    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    console.log("Fetching notifications for tenantId:", tenantId);

    // Fetch notifications with read status
    const notifications = await db.queryAll(
      `
      SELECT n.id, n.title, n.message, n.admin_id, n.status, n.created_at,
             r.read_at
      FROM tbl_admin_notifications n
      LEFT JOIN tbl_notification_reads r 
        ON n.id = r.notification_id 
        AND r.tenant_id = ?
      WHERE n.status = 'sent'
      ORDER BY n.created_at DESC
      `,
      [tenantId]
    );

    if (!notifications || notifications.length === 0) {
      return res.status(200).json({
        message: "No notifications found",
        notifications: [],
      });
    }

    const formattedNotifications = notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      status: notification.status,
      createdAt: notification.created_at,
      isRead: !!notification.read_at,
      readAt: notification.read_at || null,
    }));

    res.status(200).json({
      message: "Notifications retrieved successfully",
      notifications: formattedNotifications,
      count: formattedNotifications.length,
    });
  } catch (error) {
    console.error("GetTenantNotifications Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve notifications",
      details: error.message,
    });
  }
};

// Get Single Notification
const GetNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const tenantId = req.user.tenant_id; // Extract tenantId from JWT payload

    // Check if tenantId exists
    if (!tenantId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Tenant ID is missing from user data" });
    }

    // Check if user is authenticated for the tenant
    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    // Fetch specific notification with read status
    const notification = await db.queryAll(
      `
      SELECT n.id, n.title, n.message, n.admin_id, n.status, n.created_at,
             r.read_at
      FROM tbl_admin_notifications n
      LEFT JOIN tbl_notification_reads r 
        ON n.id = r.notification_id 
        AND r.tenant_id = ?
      WHERE n.id = ? AND n.status = 'sent'
      `,
      [tenantId, notificationId]
    );

    if (!notification || notification.length === 0) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Notification not found",
      });
    }

    const formattedNotification = {
      id: notification[0].id,
      title: notification[0].title,
      message: notification[0].message,
      status: notification[0].status,
      createdAt: notification[0].created_at,
      isRead: !!notification[0].read_at,
      readAt: notification[0].read_at || null,
    };

    res.status(200).json({
      message: "Notification retrieved successfully",
      notification: formattedNotification,
    });
  } catch (error) {
    console.error("GetNotification Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to retrieve notification",
      details: error.message,
    });
  }
};

// Mark Notification as Read
const MarkNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.body;
    const tenantId = req.user.tenant_id; // Extract tenantId from JWT payload

    // Check if tenantId and notificationId exist
    if (!tenantId || !notificationId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Tenant ID and Notification ID are required",
      });
    }

    // Check if user is authenticated for the tenant
    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    // Check if notification exists and is sent
    const notification = await db.select(
      "tbl_admin_notifications",
      "*",
      `id = ${notificationId} AND status = 'sent'`
    );

    if (!notification) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Notification not found or not sent",
      });
    }

    // Insert or update read status
    await db.query(
      `
      INSERT IGNORE INTO tbl_notification_reads (tenant_id, notification_id, read_at)
      VALUES (?, ?, NOW())
      `,
      [tenantId, notificationId]
    );

    res.status(200).json({
      message: "Notification marked as read",
      notificationId,
    });
  } catch (error) {
    console.error("MarkNotificationRead Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to mark notification as read",
      details: error.message,
    });
  }
};

// Mark All Notifications as Read
const MarkAllNotificationsRead = async (req, res) => {
  try {
    const tenantId = req.user.tenant_id; // Extract tenantId from JWT payload

    // Check if tenantId exists
    if (!tenantId) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Tenant ID is missing from user data",
      });
    }

    // Check if user is authenticated for the tenant
    if (!checkTenantAuth(req, tenantId)) {
      return res.status(403).json({ error: "UNAUTHORIZED", message: "Unauthorized" });
    }

    // Get all unread notifications
    const unreadNotifications = await db.queryAll(
      `
      SELECT n.id 
      FROM tbl_admin_notifications n
      LEFT JOIN tbl_notification_reads r 
        ON n.id = r.notification_id 
        AND r.tenant_id = ?
      WHERE n.status = 'sent' AND r.read_at IS NULL
      `,
      [tenantId]
    );

    if (!unreadNotifications || unreadNotifications.length === 0) {
      return res.status(200).json({
        message: "No unread notifications found",
        count: 0,
      });
    }

    // Mark all as read
    for (const notification of unreadNotifications) {
      await db.query(
        `
        INSERT IGNORE INTO tbl_notification_reads (tenant_id, notification_id, read_at)
        VALUES (?, ?, NOW())
        `,
        [tenantId, notification.id]
      );
    }

    res.status(200).json({
      message: "All notifications marked as read",
      count: unreadNotifications.length,
    });
  } catch (error) {
    console.error("MarkAllNotificationsRead Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Failed to mark all notifications as read",
      details: error.message,
    });
  }
};

module.exports = {
  GetTenantNotifications,
  GetNotification,
  MarkNotificationRead,
  MarkAllNotificationsRead,
};