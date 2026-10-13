const express = require('express');
const router = express.Router();
const eventPackageController = require('../controllers/eventPackageController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Public route to fetch packages for booking
router.get('/', eventPackageController.getAllPackages);
router.get('/provider/:providerId', eventPackageController.getPackagesByProvider);
router.get('/provider/:providerId/event/:eventType', eventPackageController.getPackagesByEvent);
router.get('/:id', eventPackageController.getPackageById);

const { requireActivePartnerSubscription } = require('../middlewares/subscriptionMiddleware');

// Owner / Manager Protected Routes (Only Cafes & Event Managers provide event packages)
router.post(
  '/',
  protect,
  authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'),
  requireActivePartnerSubscription,
  eventPackageController.createOrUpdatePackage
);

router.delete(
  '/:id',
  protect,
  authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'),
  requireActivePartnerSubscription,
  eventPackageController.deletePackage
);

module.exports = router;
