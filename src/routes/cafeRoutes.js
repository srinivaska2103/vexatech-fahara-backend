const express = require('express');
const Joi = require('joi');
const cafeController = require('../controllers/cafeController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

// Validation Schemas
const cafeSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('', null),
  address: Joi.string().allow('', null),
  city: Joi.string().allow('', null),
  latitude: Joi.number().allow(null),
  longitude: Joi.number().allow(null),
  price_per_hour: Joi.number().min(0).allow(null),
  minimum_persons: Joi.number().integer().min(0).allow(null),
  maximum_persons: Joi.number().integer().min(0).allow(null),
  google_rating: Joi.number().min(0).max(5).allow(null),
  provides_event_services: Joi.boolean().default(false),
  cover_image: Joi.string().uri().allow('', null),
  gallery: Joi.alternatives().try(Joi.array(), Joi.object()).allow(null),
  amenities: Joi.alternatives().try(Joi.array(), Joi.object()).allow(null),
  business_hours: Joi.object().allow(null),
  status: Joi.string().valid('PENDING', 'ACTIVE', 'INACTIVE', 'DRAFT', 'APPROVED', 'REJECTED', 'SUSPENDED').default('PENDING'),
  rejection_reason: Joi.string().allow('', null),
  is_featured: Joi.boolean().allow(null),
});

const packageSchema = Joi.object({
  event_type: Joi.string().required(),
  package_name: Joi.string().required(),
  description: Joi.string().allow('', null),
  price: Joi.number().min(0).required(),
  duration_hours: Joi.number().integer().min(1).allow(null),
  minimum_persons: Joi.number().integer().min(1).allow(null),
  maximum_persons: Joi.number().integer().min(1).allow(null),
  food: Joi.boolean().default(false),
  cake: Joi.boolean().default(false),
  decoration: Joi.boolean().default(false),
  music: Joi.boolean().default(false),
  cover_image: Joi.string().allow('', null),
  gallery: Joi.alternatives().try(Joi.array(), Joi.object()).allow(null),
  status: Joi.string().valid('PENDING', 'ACTIVE', 'INACTIVE', 'DRAFT', 'PUBLISHED').default('ACTIVE'),
  inclusions: Joi.object().allow(null)
}).unknown(true);

/**
 * @swagger
 * tags:
 *   name: Cafes
 *   description: Cafe Management APIs
 */

/**
 * @swagger
 * /api/v1/cafes:
 *   get:
 *     summary: Get all cafes
 *     tags: [Cafes]
 *     responses:
 *       200:
 *         description: List of cafes
 */
router.get('/', cafeController.getCafes);

/**
 * @swagger
 * /api/v1/cafes/{id}:
 *   get:
 *     summary: Get cafe by ID
 *     tags: [Cafes]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The cafe ID
 *     responses:
 *       200:
 *         description: Cafe details
 */
router.get('/:id', cafeController.getCafeById);

/**
 * @swagger
 * /api/v1/cafes:
 *   post:
 *     summary: Create a new cafe
 *     tags: [Cafes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               price_per_hour:
 *                 type: number
 *               provides_event_services:
 *                 type: boolean
 *               cover_image:
 *                 type: string
 *     responses:
 *       201:
 *         description: Cafe created
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Not a CAFE_OWNER)
 */
router.post('/', protect, authorizeRoles('CAFE_OWNER'), validateRequest(cafeSchema), cafeController.createCafe);

/**
 * @swagger
 * /api/v1/cafes/{id}:
 *   put:
 *     summary: Update a cafe
 *     tags: [Cafes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price_per_hour:
 *                 type: number
 *     responses:
 *       200:
 *         description: Cafe updated
 */
router.put('/:id', protect, authorizeRoles('CAFE_OWNER', 'ADMIN'), validateRequest(cafeSchema), cafeController.updateCafe);

/**
 * @swagger
 * /api/v1/cafes/{id}/business-hours:
 *   put:
 *     summary: Update cafe business hours
 *     tags: [Cafes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               business_hours:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     day_of_week:
 *                       type: string
 *                     open_time:
 *                       type: string
 *                       format: time
 *                     close_time:
 *                       type: string
 *                       format: time
 *                     is_closed:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Business hours updated
 */
router.put('/:id/business-hours', protect, authorizeRoles('CAFE_OWNER'), cafeController.updateBusinessHours);

/**
 * @swagger
 * /api/v1/cafes/{id}:
 *   delete:
 *     summary: Delete a cafe
 *     tags: [Cafes]
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
 *         description: Cafe deleted
 */
router.delete('/:id', protect, authorizeRoles('CAFE_OWNER'), cafeController.deleteCafe);

// --- Cafe Packages ---

/**
 * @swagger
 * /api/v1/cafes/{cafeId}/packages:
 *   post:
 *     summary: Add a package to a cafe
 *     tags: [Cafes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cafeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event_type
 *               - package_name
 *               - price
 *             properties:
 *               event_type:
 *                 type: string
 *               package_name:
 *                 type: string
 *               price:
 *                 type: number
 *               food:
 *                 type: boolean
 *               cake:
 *                 type: boolean
 *               decoration:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Package added
 */
router.post('/:cafeId/packages', protect, authorizeRoles('CAFE_OWNER'), validateRequest(packageSchema), cafeController.addPackage);

/**
 * @swagger
 * /api/v1/cafes/packages/{packageId}:
 *   get:
 *     summary: Get a cafe package by ID
 *     tags: [Cafes]
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Package details
 */
router.get('/packages/:packageId', cafeController.getPackageById);

/**
 * @swagger
 * /api/v1/cafes/packages/{packageId}:
 *   put:
 *     summary: Update a cafe package
 *     tags: [Cafes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               package_name:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Package updated
 */
router.put('/packages/:packageId', protect, authorizeRoles('CAFE_OWNER'), validateRequest(packageSchema), cafeController.updatePackage);

/**
 * @swagger
 * /api/v1/cafes/packages/{packageId}:
 *   delete:
 *     summary: Delete a cafe package
 *     tags: [Cafes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Package deleted
 */
router.delete('/packages/:packageId', protect, authorizeRoles('CAFE_OWNER'), cafeController.deletePackage);

// --- Payment Account & Bank Verification Routes ---
router.get('/:cafeId/payment-account', protect, authorizeRoles('CAFE_OWNER', 'ADMIN'), cafeController.getPaymentAccount);
router.patch('/:cafeId/payment-account', protect, authorizeRoles('CAFE_OWNER'), cafeController.updatePaymentAccount);
router.put('/:cafeId/payment-account', protect, authorizeRoles('CAFE_OWNER'), cafeController.updatePaymentAccount);

module.exports = router;

