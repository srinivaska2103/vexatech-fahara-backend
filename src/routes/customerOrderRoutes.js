const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect } = require('../middlewares/authMiddleware');

// Customer protected order routes
router.use(protect);

router.post('/checkout', orderController.checkout);
router.post('/:id/create-payment', orderController.createPayment);
router.post('/:id/verify-payment', orderController.verifyPayment);
router.get('/', orderController.getCustomerOrders);
router.get('/:id', orderController.getCustomerOrderById);
router.get('/:id/tracking', orderController.getCustomerOrderTracking);
router.get('/:id/cancellation-policy', orderController.getCancellationPolicy);
router.get('/:id/refund', orderController.getOrderRefund);
router.post('/:id/cancel', orderController.cancelCustomerOrder);

module.exports = router;

