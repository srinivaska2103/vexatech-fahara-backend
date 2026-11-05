const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const vendorRoles = authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN');

// Owner & Admin protected routes
router.use(protect);
router.use(vendorRoles);

router.get('/stats', offerController.getOfferStats);
router.get('/', offerController.getOffers);
router.post('/', offerController.createOffer);
router.get('/:id', offerController.getOfferById);
router.put('/:id', offerController.updateOffer);
router.delete('/:id', offerController.deleteOffer);
router.patch('/:id/status', offerController.updateOfferStatus);

module.exports = router;
