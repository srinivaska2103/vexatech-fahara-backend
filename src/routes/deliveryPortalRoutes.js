const express = require('express');
const router = express.Router();
const fulfilmentController = require('../controllers/fulfilmentController');

// Dedicated endpoints for delivery driver app/interface
router.post('/login', fulfilmentController.deliveryLogin);
router.get('/assigned-orders', fulfilmentController.getAssignedOrders);
router.get('/orders/:id', fulfilmentController.getDeliveryOrderDetails);
router.patch('/orders/:id/status', fulfilmentController.updateDeliveryOrderStatus);

module.exports = router;

