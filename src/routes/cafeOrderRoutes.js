const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const fulfilmentController = require('../controllers/fulfilmentController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const vendorRoles = authorizeRoles('CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'ADMIN');

router.use(protect);
router.use(vendorRoles);

// Orders Management
router.get('/orders/stats', orderController.getCafeOrderStats);
router.get('/orders', orderController.getCafeOrders);
router.get('/orders/:id', orderController.getCafeOrderById);
router.patch('/orders/:id/status', orderController.updateCafeOrderStatus);
router.post('/orders/:id/assign-delivery', orderController.assignDelivery);
router.post('/orders/:id/cancellation/approve', orderController.approveOwnerCancellation);
router.post('/orders/:id/cancellation/reject', orderController.rejectOwnerCancellation);

// Fulfilment Settings
router.get('/fulfilment-settings', fulfilmentController.getFulfilmentSettings);
router.put('/fulfilment-settings', fulfilmentController.updateFulfilmentSettings);

// Delivery Employees Management
router.get('/delivery-employees', fulfilmentController.getDeliveryEmployees);
router.post('/delivery-employees', fulfilmentController.createDeliveryEmployee);
router.put('/delivery-employees/:id', fulfilmentController.updateDeliveryEmployee);
router.patch('/delivery-employees/:id/status', fulfilmentController.toggleEmployeeStatus);

module.exports = router;

