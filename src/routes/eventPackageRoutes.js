const express = require('express');
const router = express.Router();
const eventPackageController = require('../controllers/eventPackageController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Public route to fetch packages for booking
router.get('/provider/:providerId', eventPackageController.getPackagesByProvider);
router.get('/provider/:providerId/event/:eventType', eventPackageController.getPackagesByEvent);
router.get('/:id', eventPackageController.getPackageById);

// Owner / Manager Protected Routes
router.post(
  '/',
  protect,
  authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'),
  eventPackageController.createOrUpdatePackage
);

router.delete(
  '/:id',
  protect,
  authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'),
  eventPackageController.deletePackage
);

module.exports = router;
