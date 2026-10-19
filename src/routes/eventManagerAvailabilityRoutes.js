const express = require('express');
const Joi = require('joi');
const eventAvailabilityController = require('../controllers/eventAvailabilityController');
const validateRequest = require('../middlewares/validateRequest');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { requireActivePartnerSubscription } = require('../middlewares/subscriptionMiddleware');

const router = express.Router();

// Validation Schemas
const blockSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255).required(),
  reason: Joi.string().valid(
    'PRIVATE_EVENT',
    'PERSONAL_BOOKING',
    'HOLIDAY',
    'MAINTENANCE',
    'UNAVAILABLE',
    'EQUIPMENT_SETUP',
    'OTHER'
  ).default('UNAVAILABLE'),
  startAt: Joi.date().iso().required(),
  endAt: Joi.date().iso().required(),
  isAllDay: Joi.boolean().default(false),
  serviceId: Joi.string().uuid().allow(null, '').optional(),
  venueId: Joi.string().uuid().allow(null, '').optional(),
  notes: Joi.string().allow('', null).max(1000),
  recurrence: Joi.string().valid('NONE', 'DAILY', 'WEEKLY', 'CUSTOM').default('NONE'),
  bufferMinutes: Joi.number().integer().min(0).max(1440).default(0),
  maxConcurrentEvents: Joi.number().integer().min(1).max(50).default(1),
  allowOverlap: Joi.boolean().default(false)
});

const updateBlockSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255),
  reason: Joi.string().valid(
    'PRIVATE_EVENT',
    'PERSONAL_BOOKING',
    'HOLIDAY',
    'MAINTENANCE',
    'UNAVAILABLE',
    'EQUIPMENT_SETUP',
    'OTHER'
  ),
  startAt: Joi.date().iso(),
  endAt: Joi.date().iso(),
  isAllDay: Joi.boolean(),
  serviceId: Joi.string().uuid().allow(null, '').optional(),
  venueId: Joi.string().uuid().allow(null, '').optional(),
  notes: Joi.string().allow('', null).max(1000),
  recurrence: Joi.string().valid('NONE', 'DAILY', 'WEEKLY', 'CUSTOM'),
  bufferMinutes: Joi.number().integer().min(0).max(1440),
  maxConcurrentEvents: Joi.number().integer().min(1).max(50),
  isActive: Joi.boolean(),
  allowOverlap: Joi.boolean().default(false)
});

// GET /api/v1/event-managers/availability?from=...&to=...&eventManagerId=... (Public / Customer / Manager / Admin)
router.get('/', optionalAuth, eventAvailabilityController.getAvailability);

// GET /api/v1/event-managers/availability/summary (Event Manager / Admin only)
router.get(
  '/summary',
  protect,
  authorizeRoles('EVENT_MANAGER', 'ADMIN'),
  eventAvailabilityController.getAvailabilitySummary
);

// GET /api/v1/event-managers/bookings/calendar?from=...&to=... (Event Manager / Admin only)
router.get(
  '/bookings/calendar',
  protect,
  authorizeRoles('EVENT_MANAGER', 'ADMIN'),
  requireActivePartnerSubscription,
  eventAvailabilityController.getCalendarBookings
);

// POST /api/v1/event-managers/availability/blocks (Event Manager / Admin only)
router.post(
  '/blocks',
  protect,
  authorizeRoles('EVENT_MANAGER', 'ADMIN'),
  requireActivePartnerSubscription,
  validateRequest(blockSchema),
  eventAvailabilityController.createBlock
);

// PATCH /api/v1/event-managers/availability/blocks/:blockId (Event Manager / Admin only)
router.patch(
  '/blocks/:blockId',
  protect,
  authorizeRoles('EVENT_MANAGER', 'ADMIN'),
  requireActivePartnerSubscription,
  validateRequest(updateBlockSchema),
  eventAvailabilityController.updateBlock
);

// DELETE /api/v1/event-managers/availability/blocks/:blockId (Event Manager / Admin only)
router.delete(
  '/blocks/:blockId',
  protect,
  authorizeRoles('EVENT_MANAGER', 'ADMIN'),
  requireActivePartnerSubscription,
  eventAvailabilityController.deleteBlock
);

module.exports = router;
