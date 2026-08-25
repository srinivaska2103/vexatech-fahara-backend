const notificationService = require('../services/notificationService');

const getNotifications = async (req, res, next) => {
  try {
    console.log(`[getNotifications] user_id: ${req.user.id}, query:`, req.query);
    const result = await notificationService.getNotifications(req.user.id, req.query);
    console.log(`[getNotifications] found ${result?.data?.length} notifications`);
    res.status(200).json(result);
  } catch (error) {
    console.error(`[getNotifications] Error:`, error);
    next(error);
  }
};

const getNotificationById = async (req, res, next) => {
  try {
    const result = await notificationService.getNotificationById(req.user.id, req.params.id);
    if (!result.data) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAsRead(req.user.id, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllAsRead(req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    const result = await notificationService.deleteNotification(req.user.id, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const sendMessage = async (req, res, next) => {
  try {
    const result = await notificationService.sendMessage(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getAdminNotifications = async (req, res, next) => {
  try {
    const result = await notificationService.getAdminNotifications(req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const markAllAdminAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAdminNotificationsAsRead();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const broadcastAdminMessage = async (req, res, next) => {
  try {
    const result = await notificationService.broadcastAdminMessage(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendMessage,
  getAdminNotifications,
  markAllAdminAsRead,
  broadcastAdminMessage
};
