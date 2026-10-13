const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { requireActivePartnerSubscription } = require('../middlewares/subscriptionMiddleware');

const router = express.Router();

router.get('/', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), requireActivePartnerSubscription, dashboardController.getSummary);
router.get('/summary', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), requireActivePartnerSubscription, dashboardController.getSummary);
router.get('/revenue', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), requireActivePartnerSubscription, dashboardController.getRevenueStats);
router.get('/recent-bookings', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), requireActivePartnerSubscription, dashboardController.getRecentBookings);
router.get('/upcoming-bookings', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), requireActivePartnerSubscription, dashboardController.getUpcomingBookings);
router.get('/recent-reviews', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), requireActivePartnerSubscription, dashboardController.getRecentReviews);
router.get('/activity', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), requireActivePartnerSubscription, dashboardController.getActivityTimeline);

module.exports = router;
