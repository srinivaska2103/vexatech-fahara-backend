const express = require('express');
const Joi = require('joi');
const cafeController = require('../controllers/cafeController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const tableRoutes = require('./tableRoutes');

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
  google_reviews_link: Joi.string().allow('', null),
  provides_event_services: Joi.boolean().default(false),
  cover_image: Joi.string().uri().allow('', null),
  gallery: Joi.alternatives().try(Joi.array(), Joi.object()).allow(null),
  amenities: Joi.alternatives().try(Joi.array(), Joi.object()).allow(null),
  discounts: Joi.alternatives().try(Joi.array(), Joi.object()).allow(null),
  business_hours: Joi.object().allow(null),
  status: Joi.string().valid('PENDING', 'ACTIVE', 'INACTIVE', 'DRAFT', 'APPROVED', 'REJECTED', 'SUSPENDED').default('PENDING'),
  category: Joi.string().allow('', null),
  rejection_reason: Joi.string().allow('', null),
  is_featured: Joi.boolean().allow(null),
});

const packageSchema = Joi.object({
  event_type: Joi.string().allow('', null).default('Special Event'),
  package_name: Joi.string().required(),
  description: Joi.string().allow('', null),
  price: Joi.number().min(0).default(0),
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
  inclusions: Joi.alternatives().try(Joi.array(), Joi.object()).allow(null)
}).unknown(true);

// --- Base Cafe Routes ---
router.get('/', cafeController.getCafes);

// --- Cafe Tables Routes ---
router.use('/:cafeId/tables', tableRoutes);

// --- Cafe Packages Routes (defined before /:id to prevent route clashing) ---
router.get('/packages/:packageId', cafeController.getPackageById);
router.put('/packages/:packageId', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), cafeController.updatePackage);
router.delete('/packages/:packageId', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), cafeController.deletePackage);

// --- Cafe Routes ---
router.get('/:id', cafeController.getCafeById);
router.get('/:id/edit', cafeController.getCafeById);
router.post('/', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), validateRequest(cafeSchema), cafeController.createCafe);
router.put('/:id', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), validateRequest(cafeSchema), cafeController.updateCafe);
router.put('/:id/edit', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), validateRequest(cafeSchema), cafeController.updateCafe);
router.put('/:id/business-hours', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), cafeController.updateBusinessHours);
router.delete('/:id', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), cafeController.deleteCafe);

// --- Cafe Packages Routes ---
router.post('/:cafeId/packages', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), validateRequest(packageSchema), cafeController.addPackage);

// --- Payment Account & Bank Verification Routes ---
router.get('/:cafeId/payment-account', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), cafeController.getPaymentAccount);
router.patch('/:cafeId/payment-account', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), cafeController.updatePaymentAccount);
router.put('/:cafeId/payment-account', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), cafeController.updatePaymentAccount);

module.exports = router;
