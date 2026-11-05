const express = require('express');
const router = express.Router();
const adminFoodController = require('../controllers/adminFoodController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Enforce strict Admin authentication
router.use(protect);
router.use(authorizeRoles('ADMIN'));

// 1. Overview KPIs
router.get('/stats', adminFoodController.getOverviewStats);

// 2. Orders Management
router.get('/orders', adminFoodController.getFoodOrders);
router.get('/orders/:id', adminFoodController.getFoodOrderById);

// 3. Revenue Analytics
router.get('/analytics', adminFoodController.getFoodAnalytics);

// 4. Cafe Performance
router.get('/cafes/:cafeId/performance', adminFoodController.getCafeFoodPerformance);

module.exports = router;

