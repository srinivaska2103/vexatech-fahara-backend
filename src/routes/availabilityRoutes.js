const express = require('express');
const Joi = require('joi');
const availabilityController = require('../controllers/availabilityController');
const validateRequest = require('../middlewares/validateRequest');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { requireActivePartnerSubscription } = require('../middlewares/subscriptionMiddleware');

const router = express.Router({ mergeParams: true });

// Validation Schemas
const blockSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255).required(),
  reason: Joi.string().valid('HOLIDAY', 'PRIVATE_EVENT', 'MAINTENANCE', 'PERSONAL_CLOSURE', 'OTHER').default('OTHER'),
  startAt: Joi.date().iso().required(),
  endAt: Joi.date().iso().required(),
  isAllDay: Joi.boolean().default(false),
  notes: Joi.string().allow('', null).max(1000),
  recurrence: Joi.string().valid('NONE', 'DAILY', 'WEEKLY').default('NONE'),
  allowOverlap: Joi.boolean().default(false)
});

const updateBlockSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255),
  reason: Joi.string().valid('HOLIDAY', 'PRIVATE_EVENT', 'MAINTENANCE', 'PERSONAL_CLOSURE', 'OTHER'),
  startAt: Joi.date().iso(),
  endAt: Joi.date().iso(),
  isAllDay: Joi.boolean(),
  notes: Joi.string().allow('', null).max(1000),
  recurrence: Joi.string().valid('NONE', 'DAILY', 'WEEKLY'),
  isActive: Joi.boolean(),
  allowOverlap: Joi.boolean().default(false)
});

// GET /api/v1/cafes/:cafeId/availability?from=...&to=... (Public / Customer / Vendor)
router.get(['/', ''], optionalAuth, availabilityController.getAvailability);

// GET /api/v1/cafes/:cafeId/availability/summary (Vendor / Admin only)
router.get(
  '/summary',
  protect,
  authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'),
  availabilityController.getAvailabilitySummary
);

// POST /api/v1/cafes/:cafeId/availability/blocks (Vendor / Admin only)
router.post(
  '/blocks',
  protect,
  authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'),
  requireActivePartnerSubscription,
  validateRequest(blockSchema),
  availabilityController.createBlock
);

// PATCH /api/v1/cafes/:cafeId/availability/blocks/:blockId (Vendor / Admin only)
router.patch(
  '/blocks/:blockId',
  protect,
  authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'),
  requireActivePartnerSubscription,
  validateRequest(updateBlockSchema),
  availabilityController.updateBlock
);

// DELETE /api/v1/cafes/:cafeId/availability/blocks/:blockId (Vendor / Admin only)
router.delete(
  '/blocks/:blockId',
  protect,
  authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'),
  requireActivePartnerSubscription,
  availabilityController.deleteBlock
);

module.exports = router;
