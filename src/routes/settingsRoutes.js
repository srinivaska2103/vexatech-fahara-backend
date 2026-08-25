const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect); // Protect all settings routes

router.get('/profile', settingsController.getBusinessProfile);
router.put('/profile', settingsController.updateBusinessProfile);
router.delete('/account', settingsController.deleteAccount);

module.exports = router;
