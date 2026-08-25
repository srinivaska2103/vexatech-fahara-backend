const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.use(protect);

router.use((req, res, next) => {
  console.log(`[NotificationRoute] ${req.method} ${req.url}`);
  next();
});

router.get('/preferences', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      emailNotifications: true,
      pushNotifications: true,
      bookingAlerts: true,
      paymentAlerts: true,
      reviewAlerts: true,
      customerMessageAlerts: true,
      marketingNotifications: false,
      systemNotifications: true,
    }
  });
});

router.put('/preferences', (req, res) => {
  res.status(200).json({ success: true, message: 'Preferences updated successfully' });
});

router.get('/admin/all', authorizeRoles('ADMIN'), notificationController.getAdminNotifications);
router.patch('/admin/read-all', authorizeRoles('ADMIN'), notificationController.markAllAdminAsRead);
router.post('/admin/broadcast', authorizeRoles('ADMIN'), notificationController.broadcastAdminMessage);

router.get('/', notificationController.getNotifications);
router.post('/send', notificationController.sendMessage);
router.patch('/read-all', notificationController.markAllAsRead);
router.get('/:id', notificationController.getNotificationById);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
