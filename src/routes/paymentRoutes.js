const express = require('express');
const Joi = require('joi');
const paymentController = require('../controllers/paymentController');
const webhookController = require('../controllers/webhookController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

const createOrderSchema = Joi.object({
  bookingId: Joi.string().uuid().required(),
});

const verifyPaymentSchema = Joi.object({
  bookingId: Joi.string().optional(),
  booking_id: Joi.string().optional(),
  orderId: Joi.string().optional(),
  order_id: Joi.string().optional(),
  razorpay_order_id: Joi.string().optional(),
  razorpay_payment_id: Joi.string().optional(),
  razorpay_signature: Joi.string().optional(),
  paymentId: Joi.string().optional(),
  payment_id: Joi.string().optional(),
  signature: Joi.string().optional()
}).or('bookingId', 'booking_id', 'orderId', 'order_id', 'razorpay_order_id', 'paymentId', 'payment_id');

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment Gateway Integration (Razorpay Route)
 */

router.post('/create-order', protect, validateRequest(createOrderSchema), paymentController.createOrder);
router.post('/create', protect, validateRequest(createOrderSchema), paymentController.createOrder);

// Webhook Endpoints
router.post('/webhook/razorpay', webhookController.handleRazorpayWebhook);
router.post('/webhook', webhookController.handleRazorpayWebhook);
router.post('/webhook/cashfree', webhookController.handleWebhook);

// Refund & Verification
router.post('/refund', protect, paymentController.processRefund);
router.post('/verify', protect, validateRequest(verifyPaymentSchema), paymentController.verifyPayment);
router.get('/status/:bookingId', protect, paymentController.checkPaymentStatus);
router.get('/check-status/:bookingId', protect, paymentController.checkPaymentStatus);

// Razorpay Route Linked Account Endpoints
router.post('/razorpay/linked-accounts/cafe/:cafeId', protect, paymentController.createCafeLinkedAccount);
router.post('/razorpay/linked-accounts/event-manager/:eventManagerId', protect, paymentController.createEventManagerLinkedAccount);
router.get('/razorpay/linked-accounts/:accountId', protect, paymentController.getLinkedAccountById);
router.get('/razorpay/linked-accounts/cafe/:cafeId/status', protect, paymentController.getCafeLinkedAccountStatus);
router.get('/razorpay/linked-accounts/event-manager/:eventManagerId/status', protect, paymentController.getEventManagerLinkedAccountStatus);


// Owner routes
router.get('/owner/payment-account', protect, paymentController.getOwnerPaymentAccount);
router.patch('/owner/payment-account', protect, paymentController.updateOwnerPaymentAccount);
router.put('/owner/payment-account', protect, paymentController.updateOwnerPaymentAccount);
router.post('/owner/bank-verification', protect, paymentController.verifyBankDetails);
router.get('/owner', protect, paymentController.getOwnerPayments);
router.get('/owner/invoices', protect, paymentController.getOwnerInvoices);
router.get('/owner/refunds', protect, paymentController.getOwnerRefunds);
router.get('/owner/payouts', protect, paymentController.getOwnerPayouts);
router.get('/owner/settlements', protect, paymentController.getOwnerSettlements);
router.post('/owner/settlements/sync', protect, paymentController.syncOwnerSettlements);
router.get('/owner/settlements/sync', protect, paymentController.syncOwnerSettlements);
router.get('/owner/settlements/:id', protect, paymentController.getOwnerSettlementById);
router.get('/owner/revenue/summary', protect, paymentController.getOwnerRevenueSummary);
router.post('/owner/reports/export', protect, paymentController.exportOwnerReport);
router.get('/owner/invoices/:id/download', protect, paymentController.downloadOwnerInvoice);
router.get('/owner/:id', protect, paymentController.getOwnerPaymentById);

// Admin routes
router.get('/admin/revenue', protect, authorizeRoles('ADMIN'), paymentController.getAdminRevenueSummary);
router.get('/admin/transactions', protect, authorizeRoles('ADMIN'), paymentController.getAdminTransactions);
router.get('/admin/payouts', protect, authorizeRoles('ADMIN'), paymentController.getAdminPayouts);
router.get('/admin/payouts/:id', protect, authorizeRoles('ADMIN'), paymentController.getAdminPayoutById);
router.post('/admin/payouts/:id/sync', protect, authorizeRoles('ADMIN'), paymentController.syncCashfreePayoutStatus);
router.put('/admin/payouts/:id/status', protect, authorizeRoles('ADMIN'), paymentController.updatePayoutStatus);
router.patch('/admin/payouts/:id/status', protect, authorizeRoles('ADMIN'), paymentController.updatePayoutStatus);
router.post('/admin/payouts/:id/complete', protect, authorizeRoles('ADMIN'), paymentController.completeAdminPayout);
router.get('/admin/payments', protect, authorizeRoles('ADMIN'), paymentController.getAdminPayments);
router.get('/admin/payments/:paymentId/debug', protect, authorizeRoles('ADMIN'), paymentController.getPaymentDebugInfo);
router.get('/admin/payments/:id', protect, authorizeRoles('ADMIN'), paymentController.getAdminPaymentById);

router.get('/admin/refunds', protect, authorizeRoles('ADMIN'), paymentController.getAdminRefunds);
router.get('/admin/refunds/:id', protect, authorizeRoles('ADMIN'), paymentController.getAdminRefundById);
router.post('/admin/refunds/:id/sync', protect, authorizeRoles('ADMIN'), paymentController.syncCashfreeRefundStatus);
router.post('/admin/refunds/:id/process', protect, authorizeRoles('ADMIN'), paymentController.processAdminRefund);
router.get('/admin/disputes', protect, authorizeRoles('ADMIN'), paymentController.getAdminDisputes);

module.exports = router;
