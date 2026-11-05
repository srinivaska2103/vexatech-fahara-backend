const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const dashboardController = require('../controllers/dashboardController');
const customerController = require('../controllers/customerController');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { requireActivePartnerSubscription } = require('../middlewares/subscriptionMiddleware');

const router = express.Router();

const vendorRoles = authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN');

// Non-blocking event tracking (public or optional auth)
router.post('/events', optionalAuth, analyticsController.trackEvent);

// Aggregated analytics for cafe and restaurant owners
router.get('/cafe/overview', protect, vendorRoles, requireActivePartnerSubscription, analyticsController.getCafeAnalytics);
router.get('/cafe/:cafeId', protect, vendorRoles, requireActivePartnerSubscription, analyticsController.getCafeAnalytics);

// Specialized sub-analytics endpoints to match analyticsService on frontend
router.get('/revenue', protect, vendorRoles, requireActivePartnerSubscription, dashboardController.getRevenueStats);
router.get('/bookings', protect, vendorRoles, requireActivePartnerSubscription, dashboardController.getRecentBookings);
router.get('/customers', protect, vendorRoles, customerController.getCustomerAnalytics);
router.get('/occupancy', protect, vendorRoles, requireActivePartnerSubscription, analyticsController.getCafeAnalytics);

// Event Manager Analytics
router.get('/events', protect, vendorRoles, requireActivePartnerSubscription, analyticsController.getEventAnalytics);

module.exports = router;
