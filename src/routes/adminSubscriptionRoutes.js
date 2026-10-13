const express = require('express');
const router = express.Router();
const adminSubscriptionController = require('../controllers/adminSubscriptionController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Protect all admin subscription routes - STRICT ADMIN ONLY
router.use(protect);
router.use(authorizeRoles('ADMIN'));

// 1. Overview & Metrics
router.get('/overview', adminSubscriptionController.getOverview);

// 2. Plans Management
router.get('/plans', adminSubscriptionController.getPlans);
router.get('/plans/:id', adminSubscriptionController.getPlanById);
router.post('/plans', adminSubscriptionController.createPlan);
router.patch('/plans/:id', adminSubscriptionController.updatePlan);
router.patch('/plans/:id/status', adminSubscriptionController.togglePlanStatus);

// 3. Subscriptions List & Role Subscriptions
router.get('/cafes', adminSubscriptionController.getCafeSubscriptions);
router.get('/restaurants', adminSubscriptionController.getRestaurantSubscriptions);
router.get('/event-managers', adminSubscriptionController.getEventManagerSubscriptions);
router.get('/payments', adminSubscriptionController.getSubscriptionPayments);

// Main paginated list endpoint
router.get('/list', adminSubscriptionController.getSubscriptionsList);
router.get('/', adminSubscriptionController.getSubscriptionsList);

// 4. Single Subscription Detail & Admin Actions
router.get('/:id', adminSubscriptionController.getSubscriptionDetail);
router.patch('/:id/cancel', adminSubscriptionController.cancelSubscription);

module.exports = router;
