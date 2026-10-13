const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Get all available partner subscription plans with features & pricing
router.get('/plans', subscriptionController.getPlans);

// Get current user subscription status
router.get('/status', protect, subscriptionController.getStatus);


// Create new subscription for Cafe & Restaurant Owners
router.post('/create', protect, subscriptionController.createSubscription);

// Create new subscription specifically for Event Managers (Strict HTTP 403 for other roles)
router.post('/event-manager/create', protect, authorizeRoles('EVENT_MANAGER'), subscriptionController.createEventManagerSubscription);
router.post('/event-manager/subscription/create', protect, authorizeRoles('EVENT_MANAGER'), subscriptionController.createEventManagerSubscription);

// Verify subscription checkout return from Razorpay
router.post('/verify', protect, subscriptionController.verifySubscription);

// Cancel renewal of subscription
router.post('/cancel', protect, subscriptionController.cancelSubscription);

// Re-enable / renew auto-renewal of subscription
router.post('/reactivate', protect, subscriptionController.reactivateSubscription);
router.post('/renew-auto-renewal', protect, subscriptionController.reactivateSubscription);

// Admin route: list all partner subscriptions
router.get('/admin/list', protect, authorizeRoles('ADMIN'), subscriptionController.getAdminSubscriptions);

module.exports = router;
