const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), dashboardController.getSummary);
router.get('/summary', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), dashboardController.getSummary);
router.get('/revenue', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), dashboardController.getRevenueStats);
router.get('/recent-bookings', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), dashboardController.getRecentBookings);
router.get('/upcoming-bookings', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), dashboardController.getUpcomingBookings);
router.get('/recent-reviews', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), dashboardController.getRecentReviews);
router.get('/activity', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), dashboardController.getActivityTimeline);

module.exports = router;
