const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

// Non-blocking event tracking (public or optional auth)
router.post('/events', optionalAuth, analyticsController.trackEvent);

// Aggregated analytics for cafe owners
router.get('/cafe/overview', protect, authorizeRoles('CAFE_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), analyticsController.getCafeAnalytics);
router.get('/cafe/:cafeId', protect, authorizeRoles('CAFE_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), analyticsController.getCafeAnalytics);

// Event Manager Analytics
router.get('/events', protect, authorizeRoles('CAFE_OWNER', 'WALKING_CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), analyticsController.getEventAnalytics);

module.exports = router;
