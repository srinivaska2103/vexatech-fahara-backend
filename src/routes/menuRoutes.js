const express = require('express');
const Joi = require('joi');
const menuController = require('../controllers/menuController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

// Allowed roles for cafe/restaurant vendor management
const vendorRoles = authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN');

// Validation Schemas
const categorySchema = Joi.object({
  cafeId: Joi.string().uuid().allow('', null),
  name: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().allow('', null).max(500),
  imageUrl: Joi.string().allow('', null),
  displayOrder: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true)
});

const categoryUpdateSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  description: Joi.string().allow('', null).max(500),
  imageUrl: Joi.string().allow('', null),
  displayOrder: Joi.number().integer().min(0),
  isActive: Joi.boolean()
});

const categoryStatusSchema = Joi.object({
  isActive: Joi.boolean().required()
});

const itemSchema = Joi.object({
  cafeId: Joi.string().uuid().allow('', null),
  categoryId: Joi.string().uuid().required(),
  name: Joi.string().trim().min(1).max(160).required(),
  description: Joi.string().allow('', null).max(1000),
  imageUrl: Joi.string().allow('', null),
  price: Joi.number().min(0).required(),
  foodType: Joi.string().valid('VEG', 'NON_VEG', 'EGG').default('VEG'),
  isAvailable: Joi.boolean().default(true),
  preparationTime: Joi.number().integer().min(1).max(180).default(15),
  displayOrder: Joi.number().integer().min(0).default(0),
  isFeatured: Joi.boolean().default(false)
});

const itemUpdateSchema = Joi.object({
  categoryId: Joi.string().uuid(),
  name: Joi.string().trim().min(1).max(160),
  description: Joi.string().allow('', null).max(1000),
  imageUrl: Joi.string().allow('', null),
  price: Joi.number().min(0),
  foodType: Joi.string().valid('VEG', 'NON_VEG', 'EGG'),
  isAvailable: Joi.boolean(),
  preparationTime: Joi.number().integer().min(1).max(180),
  displayOrder: Joi.number().integer().min(0),
  isFeatured: Joi.boolean()
});

const itemAvailabilitySchema = Joi.object({
  isAvailable: Joi.boolean().required()
});

// ==================== OVERVIEW & STATS ====================
router.get('/overview', protect, vendorRoles, menuController.getMenuStats);
router.get('/stats', protect, vendorRoles, menuController.getMenuStats);

// ==================== CATEGORY ROUTES ====================
// GET /api/cafe/menu/categories
router.get('/categories', protect, vendorRoles, menuController.getCategories);

// POST /api/cafe/menu/categories
router.post('/categories', protect, vendorRoles, validateRequest(categorySchema), menuController.createCategory);

// PUT /api/cafe/menu/categories/:id
router.put('/categories/:id', protect, vendorRoles, validateRequest(categoryUpdateSchema), menuController.updateCategory);

// DELETE /api/cafe/menu/categories/:id
router.delete('/categories/:id', protect, vendorRoles, menuController.deleteCategory);

// PATCH /api/cafe/menu/categories/:id/status
router.patch('/categories/:id/status', protect, vendorRoles, validateRequest(categoryStatusSchema), menuController.updateCategoryStatus);

// ==================== FOOD ITEM ROUTES ====================
// GET /api/cafe/menu/items
router.get('/items', protect, vendorRoles, menuController.getMenuItems);

// POST /api/cafe/menu/items
router.post('/items', protect, vendorRoles, validateRequest(itemSchema), menuController.createMenuItem);

// PUT /api/cafe/menu/items/:id
router.put('/items/:id', protect, vendorRoles, validateRequest(itemUpdateSchema), menuController.updateMenuItem);

// DELETE /api/cafe/menu/items/:id
router.delete('/items/:id', protect, vendorRoles, menuController.deleteMenuItem);

// PATCH /api/cafe/menu/items/:id/availability
router.patch('/items/:id/availability', protect, vendorRoles, validateRequest(itemAvailabilitySchema), menuController.updateMenuItemAvailability);

module.exports = router;

