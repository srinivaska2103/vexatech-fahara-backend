const express = require('express');
const Joi = require('joi');
const tableController = require('../controllers/tableController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router({ mergeParams: true });

const createTableSchema = Joi.object({
  table_number: Joi.string().trim().required(),
  capacity: Joi.number().integer().min(1).required(),
  table_type: Joi.string().allow('', null).default('2 Seater'),
  location: Joi.string().allow('', null).default('Indoor'),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'MAINTENANCE').default('ACTIVE'),
  is_combinable: Joi.boolean().default(false),
  description: Joi.string().allow('', null),
  position_x: Joi.number().default(0),
  position_y: Joi.number().default(0),
  rotation: Joi.number().integer().default(0),
  combined_table_ids: Joi.array().items(Joi.string().uuid()).default([])
});

const updateTableSchema = Joi.object({
  table_number: Joi.string().trim(),
  capacity: Joi.number().integer().min(1),
  table_type: Joi.string().allow('', null),
  location: Joi.string().allow('', null),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'MAINTENANCE'),
  is_combinable: Joi.boolean(),
  description: Joi.string().allow('', null),
  position_x: Joi.number(),
  position_y: Joi.number(),
  rotation: Joi.number().integer(),
  combined_table_ids: Joi.array().items(Joi.string().uuid())
});

const statusSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'MAINTENANCE').required()
});

const combinationSchema = Joi.object({
  combined_table_ids: Joi.array().items(Joi.string().uuid()).required()
});

// GET cafe table availability for booking engine
router.get('/availability', tableController.getRealtimeTableAvailability);

// GET next suggested table number
router.get('/next-number', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), tableController.getNextTableNumber);

// GET all tables for a cafe
router.get(['/', ''], tableController.getTablesByCafe);

// POST create table
router.post(['/', ''], protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), validateRequest(createTableSchema), tableController.createTable);

// PATCH / PUT update table
router.patch('/:tableId', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), validateRequest(updateTableSchema), tableController.updateTable);
router.put('/:tableId', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), validateRequest(updateTableSchema), tableController.updateTable);

// PATCH update status
router.patch('/:tableId/status', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), validateRequest(statusSchema), tableController.updateTableStatus);

// DELETE table
router.delete('/:tableId', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), tableController.deleteTable);

// POST / PUT table combinations
router.post('/:tableId/combinations', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), validateRequest(combinationSchema), tableController.setTableCombinations);
router.put('/:tableId/combinations', protect, authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN'), validateRequest(combinationSchema), tableController.setTableCombinations);

module.exports = router;
