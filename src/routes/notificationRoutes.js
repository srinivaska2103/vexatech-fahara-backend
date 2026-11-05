const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { requireActivePartnerSubscription } = require('../middlewares/subscriptionMiddleware');

router.use(protect);
router.use(requireActivePartnerSubscription);

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

// Admin Email Monitoring Routes
router.get('/admin/emails', authorizeRoles('ADMIN'), async (req, res, next) => {
  try {
    const prisma = require('../config/prisma');
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const where = status ? { status } : {};
    const [total, sent, pending, failed, items] = await Promise.all([
      prisma.email_notifications.count(),
      prisma.email_notifications.count({ where: { status: 'SENT' } }),
      prisma.email_notifications.count({ where: { status: 'PENDING' } }),
      prisma.email_notifications.count({ where: { status: 'FAILED' } }),
      prisma.email_notifications.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { order: { select: { order_number: true } } }
      })
    ]);
    return res.status(200).json({
      success: true,
      stats: { total, sent, pending, failed },
      data: items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) { next(err); }
});

router.post('/admin/emails/:id/retry', authorizeRoles('ADMIN'), async (req, res, next) => {
  try {
    const queue = require('../services/email/foodOrderEmailQueue');
    const result = await queue.retryNotification(req.params.id);
    return res.status(200).json(result);
  } catch (err) { next(err); }
});
router.patch('/admin/read-all', authorizeRoles('ADMIN'), notificationController.markAllAdminAsRead);
router.post('/admin/broadcast', authorizeRoles('ADMIN'), notificationController.broadcastAdminMessage);

router.get('/', notificationController.getNotifications);
router.post('/send', notificationController.sendMessage);
router.post('/send-message', notificationController.sendMessage);
router.patch('/read-all', notificationController.markAllAsRead);
router.get('/:id', notificationController.getNotificationById);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
