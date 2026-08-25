const express = require('express');
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Finance endpoints for partners (Cafe Owners and Event Managers)
router.get('/payouts', protect, paymentController.getOwnerPayouts);
router.get('/revenue', protect, paymentController.getOwnerRevenueSummary);
router.get('/transactions', protect, paymentController.getOwnerPayments);
router.get('/payments', protect, paymentController.getOwnerPayments);
router.get('/settlements', protect, paymentController.getOwnerPayouts);
router.get('/payment-account', protect, paymentController.getOwnerPaymentAccount);
router.get('/invoices', protect, paymentController.getOwnerInvoices);
router.get('/refunds', protect, paymentController.getOwnerRefunds);
router.post('/export', protect, paymentController.exportOwnerReport);

module.exports = router;
