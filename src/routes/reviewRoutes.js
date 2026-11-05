const express = require('express');
const Joi = require('joi');
const reviewController = require('../controllers/reviewController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

const addReviewSchema = Joi.object({
  booking_id: Joi.string().uuid().optional(),
  order_id: Joi.string().uuid().optional(),
  cafe_id: Joi.string().uuid().optional(),
  event_service_id: Joi.string().uuid().optional(),
  rating: Joi.number().integer().min(1).max(5).required(),
  review: Joi.string().allow('', null).optional(),
  review_title: Joi.string().allow('', null).max(200).optional(),
  food_quality_rating: Joi.number().integer().min(1).max(5).optional(),
  packaging_rating: Joi.number().integer().min(1).max(5).optional(),
  delivery_rating: Joi.number().integer().min(1).max(5).optional(),
  images: Joi.array().items(Joi.string().uri()).optional(),
}).or('cafe_id', 'event_service_id', 'order_id');

router.post('/', protect, authorizeRoles('CUSTOMER', 'CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), validateRequest(addReviewSchema), reviewController.addReview);
router.get('/', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN', 'CUSTOMER'), reviewController.getOwnerReviews);

// Check review status for an order
router.get('/order/:orderId', protect, reviewController.getFoodOrderReview);

router.get('/cafe/:cafeId', reviewController.getCafeReviews);
router.get('/event-service/:serviceId', reviewController.getEventServiceReviews);

router.delete('/:id', protect, authorizeRoles('CUSTOMER', 'CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), reviewController.deleteReview);

// Owner & Event Manager review routes
router.get('/owner/analytics', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER'), reviewController.getOwnerReviewAnalytics);
router.get('/owner/summary', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER'), reviewController.getOwnerReviewSummary);
router.get('/owner', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER'), reviewController.getOwnerReviews);

router.get('/summary', protect, reviewController.getOwnerReviewSummary);
router.get('/analytics', protect, reviewController.getOwnerReviewAnalytics);

// Admin routes
router.get('/admin/all', protect, authorizeRoles('ADMIN'), reviewController.getAdminReviews);
router.put('/admin/:id/moderate', protect, authorizeRoles('ADMIN'), reviewController.moderateReview);

// Reply routes
router.post('/:id/reply', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER'), reviewController.replyToReview);
router.put('/:id/reply', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER'), reviewController.updateReply);
router.delete('/:id/reply', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER'), reviewController.deleteReply);

// Single Review by ID
router.get('/:id', protect, reviewController.getReviewById);

module.exports = router;
