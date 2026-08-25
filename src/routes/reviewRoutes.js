const express = require('express');
const Joi = require('joi');
const reviewController = require('../controllers/reviewController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

const addReviewSchema = Joi.object({
  cafe_id: Joi.string().uuid().optional(),
  event_service_id: Joi.string().uuid().optional(),
  rating: Joi.number().integer().min(1).max(5).required(),
  review: Joi.string().allow('', null).optional(),
  images: Joi.array().items(Joi.string().uri()).optional(),
}).or('cafe_id', 'event_service_id');

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Reviews & Ratings Management
 */

/**
 * @swagger
 * /api/v1/reviews:
 *   post:
 *     summary: Add a new review (Customers only)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               cafe_id:
 *                 type: string
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *               event_service_id:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               review:
 *                 type: string
 *                 example: "Amazing experience, great ambiance!"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Review added successfully
 *       403:
 *         description: Unauthorized (Must have a completed booking)
 */
router.post('/', protect, authorizeRoles('CUSTOMER', 'CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), validateRequest(addReviewSchema), reviewController.addReview);

/**
 * @swagger
 * /api/v1/reviews/cafe/{cafeId}:
 *   get:
 *     summary: Get all reviews for a Cafe
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: cafeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Aggregated rating and list of reviews
 */
router.get('/cafe/:cafeId', reviewController.getCafeReviews);

/**
 * @swagger
 * /api/v1/reviews/event-service/{serviceId}:
 *   get:
 *     summary: Get all reviews for an Event Service
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Aggregated rating and list of reviews
 */
router.get('/event-service/:serviceId', reviewController.getEventServiceReviews);



/**
 * @swagger
 * /api/v1/reviews/{id}:
 *   delete:
 *     summary: Delete a review (Only by the author)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review deleted successfully
 *       403:
 *         description: Unauthorized to delete this review
 */
router.delete('/:id', protect, authorizeRoles('CUSTOMER', 'CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), reviewController.deleteReview);

// Owner & Event Manager review routes
router.get('/owner/analytics', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER'), reviewController.getOwnerReviewAnalytics);
router.get('/owner/summary', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER'), reviewController.getOwnerReviewSummary);
router.get('/owner', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER'), reviewController.getOwnerReviews);

router.get('/summary', protect, reviewController.getOwnerReviewSummary);
router.get('/analytics', protect, reviewController.getOwnerReviewAnalytics);

// Admin routes
router.get('/admin/all', protect, authorizeRoles('ADMIN'), reviewController.getAdminReviews);
router.put('/admin/:id/moderate', protect, authorizeRoles('ADMIN'), reviewController.moderateReview);

// Reply routes
router.post('/:id/reply', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER'), reviewController.replyToReview);
router.put('/:id/reply', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER'), reviewController.updateReply);
router.delete('/:id/reply', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER'), reviewController.deleteReply);

// Single Review by ID (Must be after specific named paths like /summary, /analytics, /owner)
router.get('/:id', protect, reviewController.getReviewById);

module.exports = router;
