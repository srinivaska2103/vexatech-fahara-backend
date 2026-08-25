const express = require('express');
const customerController = require('../controllers/customerController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/owner', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.getCustomersByOwner);
router.get('/owner/analytics', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.getCustomerAnalytics);
router.get('/owner/:id', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.getCustomerById);
router.get('/owner/:id/bookings', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.getCustomerBookings);
router.get('/owner/:id/payments', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.getCustomerPayments);
router.get('/owner/:id/reviews', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.getCustomerReviews);

// Mock actions
router.post('/owner/:id/vip', protect, (req, res) => res.json({ success: true }));
router.delete('/owner/:id/vip', protect, (req, res) => res.json({ success: true }));
router.post('/owner/:id/block', protect, (req, res) => res.json({ success: true }));
router.post('/owner/:id/unblock', protect, (req, res) => res.json({ success: true }));
router.post('/owner/:id/notes', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.addCustomerNote);
router.put('/owner/:id/notes/:noteId', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.updateCustomerNote);
router.delete('/owner/:id/notes/:noteId', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.deleteCustomerNote);

module.exports = router;
