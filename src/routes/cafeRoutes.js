const express = require('express');
const Joi = require('joi');
const cafeController = require('../controllers/cafeController');
const validateRequest = require('../middlewares/validateRequest');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { requireActivePartnerSubscription } = require('../middlewares/subscriptionMiddleware');
const tableRoutes = require('./tableRoutes');
const availabilityRoutes = require('./availabilityRoutes');

const router = express.Router();

// Validation Schemas
const cafeSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('', null),
  address: Joi.string().allow('', null),
  city: Joi.string().allow('', null),
  state: Joi.string().allow('', null),
  country: Joi.string().allow('', null),
  pincode: Joi.string().allow('', null),
  postalPincode: Joi.string().allow('', null),
  email: Joi.string().allow('', null),
  phone: Joi.string().allow('', null),
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
}).unknown(true);

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
router.get('/', optionalAuth, cafeController.getCafes);
router.get('/categories', cafeController.getCategories);

// --- Cafe Tables Routes ---
router.use('/:cafeId/tables', tableRoutes);

// --- Cafe Availability Routes ---
router.use('/:cafeId/availability', availabilityRoutes);

// --- Cafe Packages Routes (defined before /:id to prevent route clashing) ---
router.get('/packages/:packageId', cafeController.getPackageById);
router.put('/packages/:packageId', protect, authorizeRoles('CAFE_OWNER', 'ADMIN'), requireActivePartnerSubscription, cafeController.updatePackage);
router.delete('/packages/:packageId', protect, authorizeRoles('CAFE_OWNER', 'ADMIN'), requireActivePartnerSubscription, cafeController.deletePackage);

// --- Cafe Routes ---
router.get('/:id/edit', optionalAuth, cafeController.getCafeById);
router.get('/:id', optionalAuth, cafeController.getCafeById);
router.post('/', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), validateRequest(cafeSchema), cafeController.createCafe);
router.put('/:id/edit', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), requireActivePartnerSubscription, validateRequest(cafeSchema), cafeController.updateCafe);
router.put('/:id', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), requireActivePartnerSubscription, validateRequest(cafeSchema), cafeController.updateCafe);
router.put('/:id/business-hours', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), requireActivePartnerSubscription, cafeController.updateBusinessHours);
router.delete('/:id', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), requireActivePartnerSubscription, cafeController.deleteCafe);

// --- Cafe Packages Routes ---
router.post('/:cafeId/packages', protect, authorizeRoles('CAFE_OWNER', 'ADMIN'), requireActivePartnerSubscription, validateRequest(packageSchema), cafeController.addPackage);


// --- Payment Account & Bank Verification Routes ---
router.get('/:cafeId/payment-account', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), cafeController.getPaymentAccount);
router.patch('/:cafeId/payment-account', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), cafeController.updatePaymentAccount);
router.put('/:cafeId/payment-account', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER'), cafeController.updatePaymentAccount);

// --- Cafe Dynamic QR Routes ---
const qrController = require('../controllers/qrController');
router.get('/:cafeId/qr', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), qrController.getCafeQr);
router.get('/:cafeId/qr/download', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), qrController.downloadCafeQr);

module.exports = router;
