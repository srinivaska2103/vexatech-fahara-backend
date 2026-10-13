const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { protect } = require('../middlewares/authMiddleware');
const { requireActivePartnerSubscription } = require('../middlewares/subscriptionMiddleware');

router.use(protect); // Protect all settings routes

// Profile and Account management are accessible even if subscription is inactive/expired
router.get('/profile', settingsController.getBusinessProfile);
router.put('/profile', settingsController.updateBusinessProfile);
router.delete('/account', settingsController.deleteAccount);

module.exports = router;

