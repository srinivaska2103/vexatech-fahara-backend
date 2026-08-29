const express = require('express');
const Joi = require('joi');
const eventProfileController = require('../controllers/eventProfileController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

const profileSchema = Joi.object({
  company_name: Joi.string().required(),
  company_logo: Joi.string().allow('', null),
  company_banner: Joi.string().allow('', null),
  description: Joi.string().allow('', null),
  business_registration_number: Joi.string().allow('', null),
  established_year: Joi.number().integer().allow(null),
  experience_years: Joi.number().integer().min(0).allow(null),
  business_email: Joi.string().email().allow('', null),
  business_phone: Joi.string().allow('', null),
  alternate_phone: Joi.string().allow('', null),
  website_url: Joi.string().allow('', null),
  websiteUrl: Joi.string().allow('', null),
  website: Joi.string().allow('', null),
  instagram_url: Joi.string().allow('', null),
  instagramUrl: Joi.string().allow('', null),
  instagram: Joi.string().allow('', null),
  social_media_url: Joi.string().allow('', null),
  socialMediaUrl: Joi.string().allow('', null),
  socialUrl: Joi.string().allow('', null),
  facebook_url: Joi.string().allow('', null),
  facebookUrl: Joi.string().allow('', null),
  facebook: Joi.string().allow('', null),
  youtube_url: Joi.string().allow('', null),
  youtubeUrl: Joi.string().allow('', null),
  youtube: Joi.string().allow('', null),
  linkedin_url: Joi.string().allow('', null),
  linkedinUrl: Joi.string().allow('', null),
  linkedin: Joi.string().allow('', null),
  address_line1: Joi.string().allow('', null),
  address_line2: Joi.string().allow('', null),
  city: Joi.string().required(),
  state: Joi.string().required(),
  country: Joi.string().default('India'),
  postal_code: Joi.string().allow('', null),
  latitude: Joi.number().allow(null),
  longitude: Joi.number().allow(null),
  service_radius_km: Joi.number().integer().min(0).default(25),
  business_hours: Joi.any().optional(),
  businessHours: Joi.any().optional(),
  event_business_hours: Joi.any().optional(),
  working_hours: Joi.any().optional(),
  workingHours: Joi.any().optional(),
});

/**
 * @swagger
 * tags:
 *   name: EventProfiles
 *   description: Event Profile Management APIs
 */

/**
 * @swagger
 * /api/v1/event-profiles/me:
 *   get:
 *     summary: Get logged-in user's event profile
 *     tags: [EventProfiles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Event profile details
 */
router.get('/me', protect, authorizeRoles('EVENT_MANAGER'), eventProfileController.getProfile);

/**
 * @swagger
 * /api/v1/event-profiles:
 *   post:
 *     summary: Create event profile
 *     tags: [EventProfiles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - company_name
 *               - city
 *               - state
 *             properties:
 *               company_name:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *     responses:
 *       201:
 *         description: Event profile created
 */
router.post('/', protect, authorizeRoles('EVENT_MANAGER'), validateRequest(profileSchema), eventProfileController.createProfile);

/**
 * @swagger
 * /api/v1/event-profiles/me:
 *   put:
 *     summary: Update logged-in user's event profile
 *     tags: [EventProfiles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Event profile updated
 */
router.put('/me', protect, authorizeRoles('EVENT_MANAGER'), validateRequest(profileSchema), eventProfileController.updateProfile);

/**
 * @swagger
 * /api/v1/event-profiles/me/business-hours:
 *   put:
 *     summary: Update logged-in user's event profile business hours
 *     tags: [EventProfiles]
 *     security:
 *       - bearerAuth: []
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
router.put('/me/business-hours', protect, authorizeRoles('EVENT_MANAGER'), eventProfileController.updateBusinessHours);

/**
 * @swagger
 * /api/v1/event-profiles/{userId}/status:
 *   put:
 *     summary: Update event profile verification status (Admin only)
 *     tags: [EventProfiles]
 *     security:
 *       - bearerAuth: []
 */
const statusSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'SUSPENDED').optional(),
  verification_status: Joi.string().valid('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED').optional(),
  is_featured: Joi.boolean().optional(),
  rejection_reason: Joi.string().allow('', null).optional()
});
router.put('/:userId/status', protect, authorizeRoles('ADMIN'), validateRequest(statusSchema), eventProfileController.updateProfileStatus);

// --- Event Profile Payment Account & Bank Verification Routes ---
router.get('/me/payment-account', protect, eventProfileController.getPaymentAccount);
router.patch('/me/payment-account', protect, eventProfileController.updatePaymentAccount);
router.put('/me/payment-account', protect, eventProfileController.updatePaymentAccount);

module.exports = router;

