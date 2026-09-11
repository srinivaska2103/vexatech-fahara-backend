const express = require('express');
const Joi = require('joi');
const loyaltyController = require('../controllers/loyaltyController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

const redeemSchema = Joi.object({
  credits: Joi.number().integer().min(50).required().messages({
    'number.min': 'Minimum 50 credits required to redeem'
  })
});

const adminAdjustSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  credits: Joi.number().integer().invalid(0).required(),
  type: Joi.string().valid('ADJUSTMENT', 'EARN', 'REVERSE').default('ADJUSTMENT'),
  reason: Joi.string().trim().min(3).required()
});

const adminSuspendSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  status: Joi.string().valid('ACTIVE', 'SUSPENDED').required(),
  reason: Joi.string().allow('', null)
});

// Customer Loyalty Endpoints
router.get('/', protect, loyaltyController.getAccountSummary);
router.get('/transactions', protect, loyaltyController.getTransactions);
router.get('/redemptions', protect, loyaltyController.getRedemptions);
router.post('/redeem', protect, validateRequest(redeemSchema), loyaltyController.redeemCredits);

// Admin Loyalty Endpoints
router.post('/admin/adjust', protect, authorizeRoles('ADMIN'), validateRequest(adminAdjustSchema), loyaltyController.adminAdjustCredits);
router.post('/admin/suspend', protect, authorizeRoles('ADMIN'), validateRequest(adminSuspendSchema), loyaltyController.adminSuspendAccount);

module.exports = router;
