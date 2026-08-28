const paymentService = require('../services/paymentService');

const createOrder = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    const result = await paymentService.createOrder(req.user.id, bookingId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const result = await paymentService.verifyPayment(req.user?.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const checkPaymentStatus = async (req, res, next) => {
  try {
    const bookingId = req.params.bookingId || req.query.bookingId;
    const result = await paymentService.checkPaymentStatusByBookingId(bookingId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const processRefund = async (req, res, next) => {
  try {
    const { bookingId, paymentId, refundAmount, reason } = req.body;
    const refundService = require('../services/refundService');
    const result = await refundService.initiateRefund({
      bookingId,
      paymentId,
      refundAmount,
      reason,
      initiatedBy: req.user?.role?.name || 'CUSTOMER'
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getOwnerPaymentAccount = async (req, res, next) => {
  try {
    const roleName = String(req.user?.roles?.name || '').toUpperCase();
    const isEventManager = roleName === 'EVENT_MANAGER' || (req.user?.event_management_profiles && !req.user?.cafes?.length);

    let account;
    if (isEventManager) {
      const eventProfileService = require('../services/eventProfileService');
      account = await eventProfileService.getEventPaymentAccount(req.user.id);
    } else {
      const cafeService = require('../services/cafeService');
      account = await cafeService.getCafePaymentAccount(req.user.id, 'my-cafe');
    }

    res.status(200).json({
      success: true,
      data: {
        status: account.bankVerificationStatus === 'VERIFIED' ? 'CONNECTED' : account.bankVerificationStatus,
        businessVerification: 'VERIFIED',
        bankVerification: account.bankVerificationStatus,
        kycStatus: 'APPROVED',
        settlementStatus: account.settlementStatus,
        maskedBankAccount: account.maskedBankAccount,
        rawAccountNumber: '',
        bankName: account.accountHolderName || 'Verified Bank',
        ifsc: account.ifsc,
        rawIfsc: account.ifsc,
        accountHolderName: account.accountHolderName,
        email: account.email || req.user?.email || '',
        phone: account.phone || req.user?.phone || '',
        vendorId: account.linkedAccountId || account.cashfreeVendorId,
        linkedAccountId: account.linkedAccountId,
        settlementCycle: 'Razorpay Route Auto-Settlement',
        lastUpdated: account.bankVerifiedAt || new Date().toISOString()
      }
    });
  } catch (error) { next(error); }
};

const updateOwnerPaymentAccount = async (req, res, next) => {
  try {
    const roleName = String(req.user?.roles?.name || '').toUpperCase();
    const isEventManager = roleName === 'EVENT_MANAGER' || (req.user?.event_management_profiles && !req.user?.cafes?.length);

    let result;
    if (isEventManager) {
      const eventProfileService = require('../services/eventProfileService');
      result = await eventProfileService.updateEventPaymentAccount(req.user.id, req.body);
    } else {
      const cafeService = require('../services/cafeService');
      result = await cafeService.updateCafePaymentAccount(req.user.id, 'my-cafe', req.body);
    }

    res.status(200).json({ success: true, message: result.message, data: result });
  } catch (error) { next(error); }
};

const verifyBankDetails = async (req, res, next) => {
  try {
    const roleName = String(req.user?.roles?.name || '').toUpperCase();
    const isEventManager = roleName === 'EVENT_MANAGER' || (req.user?.event_management_profiles && !req.user?.cafes?.length);

    let entityId;
    let vendorType;

    if (isEventManager) {
      vendorType = 'EVENT_MANAGER';
      entityId = req.user?.event_management_profiles?.id;
      if (!entityId) {
        const prisma = require('../config/prisma');
        const profile = await prisma.event_management_profiles.findUnique({ where: { user_id: req.user.id } });
        entityId = profile?.id;
      }
    } else {
      vendorType = 'CAFE';
      entityId = req.user?.cafes?.[0]?.id;
      if (!entityId) {
        const prisma = require('../config/prisma');
        const cafe = await prisma.cafes.findFirst({ where: { owner_id: req.user.id } });
        entityId = cafe?.id;
      }
    }

    if (!entityId) {
      const error = new Error('No associated Cafe or Event Profile found to connect bank account.');
      error.statusCode = 404;
      throw error;
    }

    const linkedAccountService = require('../services/linkedAccountService');
    const { accountNumber, confirmAccountNumber, accountHolder, ifsc, phone, email } = req.body;

    const result = await linkedAccountService.updateBankDetailsAndVerify({
      user: req.user,
      vendorType,
      entityId,
      accountNumber,
      confirmAccountNumber: confirmAccountNumber || accountNumber,
      accountHolder,
      ifsc,
      phone: phone || req.user?.phone,
      email: email || req.user?.email
    });

    res.status(200).json({ success: result.success, message: result.message, data: result });
  } catch (error) { next(error); }
};

const getOwnerPayments = async (req, res, next) => {
  try {
    const data = await paymentService.getOwnerPayments(req.user.id, req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getOwnerInvoices = async (req, res, next) => {
  try {
    const data = await paymentService.getOwnerInvoices(req.user.id, req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getOwnerRefunds = async (req, res, next) => {
  try {
    const data = await paymentService.getOwnerRefunds(req.user.id, req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getOwnerPayouts = async (req, res, next) => {
  try {
    const data = await paymentService.getOwnerPayouts(req.user.id, req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getOwnerSettlements = async (req, res, next) => {
  try {
    const data = await paymentService.getOwnerSettlements(req.user.id, req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const syncOwnerSettlements = async (req, res, next) => {
  try {
    const { checkVendorSettlements } = require('../services/transferService');
    const syncResult = await checkVendorSettlements();
    const data = await paymentService.getOwnerSettlements(req.user.id, req.query);
    res.status(200).json({
      success: true,
      message: `Razorpay settlements synced successfully. ${syncResult.updatedCount || 0} settlement(s) updated.`,
      ...data
    });
  } catch (error) { next(error); }
};

const getOwnerSettlementById = async (req, res, next) => {
  try {
    const data = await paymentService.getOwnerSettlementById(req.user.id, req.params.id);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getOwnerRevenueSummary = async (req, res, next) => {
  try {
    const data = await paymentService.getOwnerRevenueSummary(req.user.id, req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const exportOwnerReport = async (req, res, next) => {
  try {
    const payments = await paymentService.getOwnerPayments(req.user.id, {});
    const data = payments.data || [];
    
    let csv = 'Transaction ID,Date,Customer,Cafe,Amount,Status\n';
    data.forEach(p => {
      const date = p.date ? new Date(p.date).toLocaleDateString() : '';
      csv += `${p.transaction_id},${date},${p.customer_name},${p.cafe_name},${p.amount},${p.status}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=financial_report.csv');
    res.status(200).send(csv);
  } catch (error) { next(error); }
};

const getOwnerPaymentById = async (req, res, next) => {
  try {
    const data = await paymentService.getOwnerPaymentById(req.user.id, req.params.id);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const PDFDocument = require('pdfkit');

const downloadOwnerInvoice = async (req, res, next) => {
  try {
    const paymentId = req.params.id;
    const payment = await paymentService.getOwnerPaymentById(req.user.id, paymentId);
    
    if (!payment || !payment.data) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const data = payment.data;
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${data.id.substring(0,8)}.pdf`);
    
    doc.pipe(res);

    doc.fontSize(20).text('FAHARA CAFE INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Invoice #: INV-${data.id.substring(0,8).toUpperCase()}`);
    doc.text(`Date: ${new Date(data.date || data.created_at).toLocaleDateString()}`);
    doc.moveDown();

    doc.fontSize(14).text('Cafe Details', { underline: true });
    doc.fontSize(12).text(`Name: ${data.cafe_name}`);
    doc.text(`Address: ${data.cafe_address || 'N/A'}`);
    doc.moveDown();

    doc.fontSize(14).text('Customer Details', { underline: true });
    doc.fontSize(12).text(`Name: ${data.customer_name}`);
    doc.text(`Email: ${data.customer_email || 'N/A'}`);
    doc.text(`Phone: ${data.customer_phone || 'N/A'}`);
    doc.moveDown();

    doc.fontSize(14).text('Service Details', { underline: true });
    doc.fontSize(12).text(`Booking Ref: #${data.booking_id ? data.booking_id : 'N/A'}`);
    doc.text(`Payment Method: ${data.method || 'CASH'}`);
    doc.text(`Status: ${data.status}`);
    doc.moveDown();

    doc.fontSize(16).text(`TOTAL AMOUNT: Rs. ${data.amount}`, { align: 'right' });
    doc.moveDown();
    doc.fontSize(10).text('Thank you for your business!', { align: 'center' });

    doc.end();
  } catch (error) { next(error); }
};

const getAdminPayouts = async (req, res, next) => {
  try {
    const data = await paymentService.getAdminPayouts(req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getAdminPayoutById = async (req, res, next) => {
  try {
    const data = await paymentService.getAdminPayoutById(req.params.id);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const completeAdminPayout = async (req, res, next) => {
  try {
    const data = await paymentService.completeAdminPayout(req.params.id);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const syncCashfreePayoutStatus = async (req, res, next) => {
  try {
    const data = await paymentService.syncCashfreePayoutStatus(req.params.id);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const updatePayoutStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Payout status is required' });
    }
    const data = await paymentService.updatePayoutStatus(req.params.id, status);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getAdminRevenueSummary = async (req, res, next) => {
  try {
    console.log("REVENUE HIT", req.query);
    const data = await paymentService.getAdminRevenueSummary(req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getAdminTransactions = async (req, res, next) => {
  try {
    const data = await paymentService.getAdminTransactions(req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getAdminPayments = async (req, res, next) => {
  try {
    const data = await paymentService.getAdminPayments(req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getAdminPaymentById = async (req, res, next) => {
  try {
    const data = await paymentService.getAdminPaymentDetails(req.params.id);
    if (!data.data) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getAdminRefunds = async (req, res, next) => {
  try {
    const data = await paymentService.getAdminRefunds(req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getAdminRefundById = async (req, res, next) => {
  try {
    const data = await paymentService.getAdminRefundDetails(req.params.id);
    if (!data.data) return res.status(404).json({ success: false, message: 'Refund not found' });
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const processAdminRefund = async (req, res, next) => {
  try {
    const data = await paymentService.processAdminRefund(req.params.id);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const syncCashfreeRefundStatus = async (req, res, next) => {
  try {
    const data = await paymentService.syncCashfreeRefundStatus(req.params.id);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const getAdminDisputes = async (req, res, next) => {
  try {
    const data = await paymentService.getAdminDisputes(req.query);
    res.status(200).json(data);
  } catch (error) { next(error); }
};

const createCafeLinkedAccount = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const user = req.user;
    
    const cafe = await prisma.cafes.findUnique({ where: { id: cafeId } });
    if (!cafe) {
      return res.status(404).json({ success: false, message: 'Cafe not found' });
    }
    if (cafe.owner_id !== user.id && user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not own this cafe' });
    }

    const linkedAccountService = require('../services/linkedAccountService');
    const result = await linkedAccountService.getOrCreateLinkedAccount({
      user,
      vendorType: 'CAFE',
      entityId: cafeId,
      accountHolder: req.body?.accountHolder
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const createEventManagerLinkedAccount = async (req, res, next) => {
  try {
    const { eventManagerId } = req.params;
    const user = req.user;

    const profile = await prisma.event_management_profiles.findUnique({ where: { id: eventManagerId } });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Event management profile not found' });
    }
    if (profile.user_id !== user.id && user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not own this event profile' });
    }

    const linkedAccountService = require('../services/linkedAccountService');
    const result = await linkedAccountService.getOrCreateLinkedAccount({
      user,
      vendorType: 'EVENT_MANAGER',
      entityId: eventManagerId,
      accountHolder: req.body?.accountHolder
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getLinkedAccountById = async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const linkedAccountService = require('../services/linkedAccountService');
    const result = await linkedAccountService.getAccountStatusByAccountId(accountId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getCafeLinkedAccountStatus = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const linkedAccountService = require('../services/linkedAccountService');
    const result = await linkedAccountService.getCafeAccountStatus(cafeId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getEventManagerLinkedAccountStatus = async (req, res, next) => {
  try {
    const { eventManagerId } = req.params;
    const linkedAccountService = require('../services/linkedAccountService');
    const result = await linkedAccountService.getEventManagerAccountStatus(eventManagerId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getPaymentDebugInfo = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const prisma = require('../config/prisma');
    
    const payment = await prisma.payments.findFirst({
      where: {
        OR: [
          { id: paymentId },
          { gateway_payment_id: paymentId },
          { provider_payment_id: paymentId },
          { gateway_order_id: paymentId },
          { provider_order_id: paymentId },
          { booking_id: paymentId }
        ]
      },
      include: {
        bookings: {
          include: {
            cafes: true,
            event_services: true
          }
        },
        payment_splits: true
      }
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    const cafe = payment.bookings?.cafes;
    const eventService = payment.bookings?.event_services;
    const splits = payment.payment_splits || [];

    const debugInfo = {
      payment: {
        id: payment.id,
        bookingId: payment.booking_id,
        bookingNumber: payment.bookings?.booking_number || 'N/A',
        status: payment.status,
        amount: Number(payment.amount || 0),
        faharaFee: Number(payment.platform_fee || 0),
        providerOrderId: payment.provider_order_id || payment.gateway_order_id || null,
        providerPaymentId: payment.provider_payment_id || payment.gateway_payment_id || null,
        paymentProvider: payment.payment_provider || 'RAZORPAY',
        paidAt: payment.paid_at
      },
      recipient: {
        cafe: cafe ? {
          id: cafe.id,
          name: cafe.name,
          linkedAccountId: cafe.payment_account_id || cafe.razorpay_linked_account_id || null,
          accountStatus: cafe.razorpay_account_status || 'NOT_CREATED',
          bankStatus: cafe.bank_verification_status || 'PENDING'
        } : null,
        eventManager: eventService ? {
          id: eventService.id,
          name: eventService.service_name || eventService.title || 'Event Service',
          userId: eventService.user_id
        } : null
      },
      transfers: splits.map(s => ({
        id: s.id,
        vendorType: s.vendor_type,
        linkedAccountId: s.payment_account_id || s.razorpay_account_id,
        providerTransferId: s.provider_transfer_id,
        transferStatus: s.transfer_status,
        settlementStatus: s.settlement_status,
        splitAmount: Number(s.split_amount)
      })),
      diagnostics: {
        paymentVerified: payment.status === 'SUCCESS',
        paymentCaptured: Boolean(payment.provider_payment_id && !payment.provider_payment_id.startsWith('pay_a06b')),
        hasValidLinkedAccount: Boolean(cafe?.payment_account_id || cafe?.razorpay_linked_account_id),
        transferAttempted: splits.some(s => s.provider_transfer_id !== null),
        transferSuccessful: splits.some(s => s.transfer_status === 'PROCESSED' && s.provider_transfer_id && !s.provider_transfer_id.startsWith('trf_fahara_'))
      }
    };

    res.status(200).json({ success: true, data: debugInfo });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  checkPaymentStatus,
  processRefund,
  getOwnerPaymentAccount,
  updateOwnerPaymentAccount,
  verifyBankDetails,
  getOwnerPayments,
  getOwnerInvoices,
  getOwnerRefunds,
  getOwnerPayouts,
  getOwnerSettlements,
  syncOwnerSettlements,
  getOwnerSettlementById,
  getOwnerRevenueSummary,
  exportOwnerReport,
  getOwnerPaymentById,
  downloadOwnerInvoice,
  getAdminPayouts,
  getAdminPayoutById,
  completeAdminPayout,
  syncCashfreePayoutStatus,
  updatePayoutStatus,
  getAdminRevenueSummary,
  getAdminTransactions,
  getAdminPayments,
  getAdminPaymentById,
  getAdminRefunds,
  getAdminRefundById,
  processAdminRefund,
  syncCashfreeRefundStatus,
  getAdminDisputes,
  createCafeLinkedAccount,
  createEventManagerLinkedAccount,
  getLinkedAccountById,
  getCafeLinkedAccountStatus,
  getEventManagerLinkedAccountStatus,
  getPaymentDebugInfo
};


