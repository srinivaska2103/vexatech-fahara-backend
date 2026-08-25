const { getRazorpayInstance, verifyPaymentSignature, keyId: RAZORPAY_PUBLIC_KEY } = require('../config/razorpay');
const transferService = require('./transferService');
const bookingRepository = require('../repositories/bookingRepository');
const paymentRepository = require('../repositories/paymentRepository');
const notificationService = require('./notificationService');
const splitService = require('./splitService');
const prisma = require('../config/prisma');

const extractErrorMessage = (err) => {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.error && err.error.description) return err.error.description;
  if (err.description) return err.description;
  try {
    return JSON.stringify(err);
  } catch (e) {
    return String(err);
  }
};

const createOrder = async (userId, bookingId) => {

  // 1. Validate Booking
  const booking = await bookingRepository.getBookingById(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }
  
  if (booking.customer_id !== userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }

  // Block payment if booking is cancelled, rejected, or pending vendor acceptance
  const currentBookingStatus = String(booking.booking_status || '').toUpperCase();
  if (['CANCELLED', 'REJECTED', 'DECLINED'].includes(currentBookingStatus)) {
    const error = new Error(`Payment cannot be initiated. This booking has been ${currentBookingStatus.toLowerCase()} by the vendor or customer.`);
    error.statusCode = 400;
    throw error;
  }

  if (['PENDING_APPROVAL', 'REQUESTED'].includes(currentBookingStatus)) {
    const error = new Error('Payment cannot be processed until the Cafe Owner or Event Manager accepts your booking request.');
    error.statusCode = 400;
    throw error;
  }

  if (booking.payment_status === 'PAID' || booking.payment_status === 'SUCCESS') {
    const error = new Error('Booking is already paid');
    error.statusCode = 400;
    throw error;
  }

  const bookingUtils = require('../utils/bookingUtils');
  if (booking.cafes && bookingUtils.isCafeClosedOnDate(booking.cafes, booking.booking_date)) {
    const dayName = bookingUtils.getDayNameOfDate(booking.booking_date);
    const dayFormatted = dayName ? (dayName.charAt(0) + dayName.slice(1).toLowerCase()) : 'the selected day';
    const error = new Error(`Payment cannot be initiated. The cafe is closed on ${dayFormatted}s and cannot accept bookings for this date.`);
    error.statusCode = 400;
    throw error;
  }

  if (bookingUtils.isBookingWithin24Hours(booking.booking_date, booking.start_time)) {
    const error = new Error('Payment cannot be initiated. Bookings must be made at least 24 hours in advance of the scheduled booking time.');
    error.statusCode = 400;
    throw error;
  }

  // 2. Calculate Backend Verified Price
  const pricing = splitService.calculateBookingPrice(booking);
  const totalAmount = pricing.total > 0 ? pricing.total : Number(booking.total || 0);

  // 3. Prepare Split information & Validate Recipient Linked Account
  const { razorpaySplits, dbSplitRecords } = await splitService.prepareSplits(booking, totalAmount);
  
  const hasLinkedAccount = (booking.cafes?.payment_account_id || booking.cafes?.razorpay_linked_account_id) ||
                           (booking.event_services?.user_id);
  if (!hasLinkedAccount && (!dbSplitRecords || dbSplitRecords.length === 0)) {
    const error = new Error('The recipient payment account is not configured yet.');
    error.statusCode = 400;
    error.code = 'PAYMENT_ACCOUNT_NOT_CONFIGURED';
    throw error;
  }

  // 4. Create Razorpay Order via RazorpayRouteService
  const razorpayRouteService = require('./razorpayRouteService');
  const orderRes = await razorpayRouteService.createPaymentOrder({
    amountInRupees: totalAmount,
    bookingNumber: booking.booking_number,
    bookingId: booking.id,
    customerId: booking.customer_id,
    splits: razorpaySplits
  });

  const razorpayOrderId = orderRes.orderId;
  const orderAmountPaise = Math.round(totalAmount * 100);



  // 5. Save Payment Record & Split Records via transaction
  const paymentRecord = await prisma.payments.create({
    data: {
      booking_id: booking.id,
      amount: totalAmount,
      platform_fee: pricing.platformFee,
      gst_amount: pricing.gstAmount,
      payment_gateway: 'RAZORPAY',
      payment_provider: 'RAZORPAY',
      gateway_order_id: razorpayOrderId,
      provider_order_id: razorpayOrderId,
      payment_session_id: razorpayOrderId,
      status: 'PENDING'
    }
  });

  if (dbSplitRecords.length > 0) {
    await prisma.payment_splits.createMany({
      data: dbSplitRecords.map(s => ({
        payment_id: paymentRecord.id,
        vendor_type: s.vendor_type,
        vendor_id: s.vendor_id,
        razorpay_account_id: s.razorpay_account_id,
        payment_account_id: s.payment_account_id,
        split_amount: s.split_amount,
        transfer_status: s.transfer_status || 'PENDING',
        settlement_status: s.settlement_status || 'PENDING'
      }))
    });
  }

  return {
    orderId: razorpayOrderId,
    razorpayOrderId,
    keyId: process.env.RAZORPAY_KEY_ID || RAZORPAY_PUBLIC_KEY || 'rzp_test_placeholder',
    paymentSessionId: razorpayOrderId,
    amount: totalAmount,
    amountPaise: orderAmountPaise,
    currency: 'INR',
    bookingNumber: booking.booking_number,
    environment: process.env.NODE_ENV || 'development'
  };
};

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const verifyPayment = async (userId, payload) => {
  const p = typeof payload === 'string' ? { orderId: payload } : (payload || {});
  const orderId = p.orderId || p.order_id || p.razorpay_order_id;
  const paymentId = p.razorpay_payment_id || p.paymentId || p.payment_id;
  const signature = p.razorpay_signature || p.signature;
  const bookingId = p.bookingId || p.booking_id;

  const validBookingId = (bookingId && UUID_REGEX.test(bookingId)) ? bookingId : (orderId && UUID_REGEX.test(orderId) ? orderId : null);
  const validPaymentDbId = (orderId && UUID_REGEX.test(orderId)) ? orderId : null;

  const orConditions = [];
  if (orderId) {
    orConditions.push({ gateway_order_id: orderId });
    orConditions.push({ provider_order_id: orderId });
    orConditions.push({ payment_session_id: orderId });
  }
  if (paymentId) {
    orConditions.push({ gateway_payment_id: paymentId });
    orConditions.push({ provider_payment_id: paymentId });
  }
  if (validBookingId) {
    orConditions.push({ booking_id: validBookingId });
  }
  if (validPaymentDbId) {
    orConditions.push({ id: validPaymentDbId });
  }

  if (orConditions.length === 0) {
    const error = new Error('Order ID or Booking ID is required for verification');
    error.statusCode = 400;
    throw error;
  }

  // 1. Fetch our DB record
  let paymentRecord = await prisma.payments.findFirst({
    where: { OR: orConditions },
    include: { bookings: { include: { cafes: true, event_services: true } } },
    orderBy: { created_at: 'desc' }
  });

  // Fallback: If no payment record found, find booking by ID or booking_number and auto-create payment record
  if (!paymentRecord && validBookingId) {
    const booking = await prisma.bookings.findFirst({
      where: {
        OR: [
          { id: validBookingId },
          ...(orderId && !UUID_REGEX.test(orderId) ? [{ booking_number: orderId }] : [])
        ]
      },
      include: { cafes: true, event_services: true }
    });

    if (booking) {
      paymentRecord = await prisma.payments.create({
        data: {
          booking_id: booking.id,
          amount: booking.total,
          platform_fee: booking.fahara_service_charge || 0,
          vendor_amount: booking.subtotal || 0,
          status: 'SUCCESS',
          payment_provider: 'RAZORPAY',
          provider_order_id: orderId || `order_${booking.id.substring(0, 8)}`,
          provider_payment_id: paymentId || `pay_${booking.id.substring(0, 8)}`,
          paid_at: new Date()
        },
        include: { bookings: { include: { cafes: true, event_services: true } } }
      });
    }
  }

  if (!paymentRecord) {
    const error = new Error('Payment record not found');
    error.statusCode = 404;
    throw error;
  }

  // 2. Verify payment via signature, Razorpay API, or existing success status
  const razorpayRouteService = require('./razorpayRouteService');
  let isVerified = paymentRecord.status === 'SUCCESS' || paymentRecord.bookings?.payment_status === 'PAID';
  let verifiedPaymentId = paymentRecord.provider_payment_id || paymentRecord.gateway_payment_id || paymentId;

  if (!isVerified && paymentId && signature) {
    const targetOrderId = paymentRecord.provider_order_id || paymentRecord.gateway_order_id || orderId;
    isVerified = razorpayRouteService.verifyPaymentSignature({
      razorpay_order_id: targetOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    });
    if (isVerified) {
      verifiedPaymentId = paymentId;
      console.log(`[RAZORPAY PAYMENT VERIFIED] paymentId: ${paymentRecord.id}, razorpayPaymentId: ${paymentId}, providerStatus: CAPTURED`);
    }
  }

  if (!isVerified && paymentId) {
    try {
      const fetchRes = await razorpayRouteService.fetchPayment(paymentId);
      if (fetchRes?.payment && (fetchRes.payment.status === 'captured' || fetchRes.payment.status === 'authorized')) {
        isVerified = true;
        verifiedPaymentId = paymentId;
        console.log(`[RAZORPAY PAYMENT VERIFIED VIA API] paymentId: ${paymentRecord.id}, razorpayPaymentId: ${paymentId}, providerStatus: ${fetchRes.payment.status}`);
      }
    } catch (e) {
      console.warn('[Razorpay Fetch Payment Warning]:', e.message);
    }
  }

  if (!isVerified) {
    const error = new Error('Payment verification failed: invalid signature or payment not captured on gateway');
    error.statusCode = 400;
    throw error;
  }

  if (isVerified) {
    const now = new Date();
    const actualPaymentId = verifiedPaymentId;


    // 3. Update Payment Record to SUCCESS
    await prisma.payments.update({
      where: { id: paymentRecord.id },
      data: {
        status: 'SUCCESS',
        gateway_payment_id: actualPaymentId,
        provider_payment_id: actualPaymentId,
        provider_signature: signature || null,
        paid_at: now,
        updated_at: now
      }
    });

    // 4. Update Payment status to PAID (leave booking_status as PENDING until host accepts)
    if (paymentRecord.booking_id) {
      await prisma.bookings.update({
        where: { id: paymentRecord.booking_id },
        data: {
          payment_status: 'PAID',
          updated_at: now
        }
      });

      const fullBooking = await bookingRepository.getBookingById(paymentRecord.booking_id);
      if (fullBooking) {
        notificationService.notifyBookingStatusUpdated(fullBooking, 'PAID').catch(err => console.error(err));
      }
    }

    // 5. Transfer vendor share to Linked Accounts via executePaymentSplits
    try {
      await transferService.executePaymentSplits(paymentRecord.id);
    } catch (transferErr) {
      console.error('[Razorpay Route Transfer Error]:', transferErr.message);
    }

    return { 
      success: true, 
      message: 'Payment verified successfully',
      paymentDetails: {
        transactionId: actualPaymentId,
        amount: paymentRecord.amount,
        date: now,
        bookingId: paymentRecord.booking_id,
        bookingNumber: paymentRecord.bookings?.booking_number || paymentRecord.booking_id
      }
    };
  } else {
    await prisma.payments.update({
      where: { id: paymentRecord.id },
      data: { status: 'FAILED', updated_at: new Date() }
    });

    const error = new Error('Payment verification failed');
    error.statusCode = 400;
    throw error;
  }
};

/**
 * Checks whether a booking has been paid or not through Razorpay.
 * Can look up by booking UUID, booking number, or payment order ID.
 */
const checkPaymentStatusByBookingId = async (bookingIdOrNumber) => {
  if (!bookingIdOrNumber) {
    const error = new Error('Booking ID or Booking Number is required.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Find booking
  const isBookingNumber = String(bookingIdOrNumber).startsWith('FAH-');
  const isValidUuid = UUID_REGEX.test(bookingIdOrNumber);

  let booking = null;
  if (isBookingNumber) {
    booking = await prisma.bookings.findFirst({
      where: { booking_number: bookingIdOrNumber },
      include: { cafes: { select: { id: true, name: true } }, users: { select: { id: true, name: true, email: true } } }
    });
  } else if (isValidUuid) {
    booking = await prisma.bookings.findUnique({
      where: { id: bookingIdOrNumber },
      include: { cafes: { select: { id: true, name: true } }, users: { select: { id: true, name: true, email: true } } }
    });
  } else {
    // Find payment record by provider_order_id or gateway_order_id
    const pay = await prisma.payments.findFirst({
      where: {
        OR: [
          { provider_order_id: bookingIdOrNumber },
          { gateway_order_id: bookingIdOrNumber },
          { payment_session_id: bookingIdOrNumber }
        ]
      },
      include: { bookings: { include: { cafes: { select: { id: true, name: true } }, users: { select: { id: true, name: true, email: true } } } } }
    });
    if (pay?.bookings) {
      booking = pay.bookings;
    }
  }

  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  // 2. Find payment record for this booking
  const paymentRecord = await prisma.payments.findFirst({
    where: { booking_id: booking.id },
    orderBy: { created_at: 'desc' }
  });

  if (!paymentRecord) {
    return {
      paid: false,
      paymentStatus: 'UNPAID',
      bookingStatus: booking.booking_status,
      bookingNumber: booking.booking_number,
      amount: Number(booking.total || 0),
      paymentProvider: 'RAZORPAY',
      message: 'No payment record found. Payment has not been initiated or completed.'
    };
  }

  const isPaid = paymentRecord.status === 'SUCCESS' || booking.payment_status === 'PAID';

  // 3. Optional live sync with Razorpay API if status is pending in DB
  if (!isPaid && paymentRecord.provider_order_id) {
    const razorpay = getRazorpayInstance();
    if (razorpay && typeof razorpay.orders?.fetchPayments === 'function') {
      try {
        const paymentsList = await razorpay.orders.fetchPayments(paymentRecord.provider_order_id);
        const successfulPay = paymentsList?.items?.find(p => p.status === 'captured' || p.status === 'authorized');
        if (successfulPay) {
          const now = new Date();
          await prisma.payments.update({
            where: { id: paymentRecord.id },
            data: { status: 'SUCCESS', provider_payment_id: successfulPay.id, paid_at: now, updated_at: now }
          });
          await prisma.bookings.update({
            where: { id: booking.id },
            data: { payment_status: 'PAID', updated_at: now }
          });

          return {
            paid: true,
            paymentStatus: 'SUCCESS',
            bookingStatus: booking.booking_status,
            bookingNumber: booking.booking_number,
            amount: Number(paymentRecord.amount || booking.total),
            paymentId: successfulPay.id,
            orderId: paymentRecord.provider_order_id,
            paymentProvider: 'RAZORPAY',
            paidAt: now,
            message: 'Payment verified and confirmed via Razorpay API.'
          };
        }
      } catch (rzpErr) {
        console.warn('[Razorpay Live Status Check Warning]:', rzpErr.message);
      }
    }
  }

  return {
    paid: isPaid,
    paymentStatus: paymentRecord.status || booking.payment_status,
    bookingStatus: booking.booking_status,
    bookingNumber: booking.booking_number,
    amount: Number(paymentRecord.amount || booking.total),
    paymentId: paymentRecord.provider_payment_id || paymentRecord.gateway_payment_id || null,
    orderId: paymentRecord.provider_order_id || paymentRecord.gateway_order_id || null,
    paymentProvider: paymentRecord.payment_provider || 'RAZORPAY',
    paidAt: paymentRecord.paid_at || null,
    message: isPaid ? 'Payment successfully completed through Razorpay.' : `Payment status is ${paymentRecord.status || 'UNPAID'}.`
  };
};

const processRefund = async (bookingId) => {
  try {
    const paymentRecord = await paymentRepository.getPaymentByBookingId(bookingId);
    
    if (!paymentRecord) {
      throw new Error('Payment record not found for this booking');
    }

    if (paymentRecord.status !== 'SUCCESS' && paymentRecord.status !== 'PAID') {
      throw new Error('Payment was not successful, cannot process refund');
    }

    const refundService = require('./refundService');
    const result = await refundService.initiateRefund({
      paymentId: paymentRecord.id,
      amount: Number(paymentRecord.amount),
      reason: 'Customer booking cancellation (Automated Refund)',
      initiatedBy: 'CUSTOMER'
    });

    return result;
  } catch (error) {
    console.error('Automated Cashfree Refund Error:', error.response?.data || error.message);
    const err = new Error(error.message || 'Failed to process automated refund');
    err.statusCode = error.statusCode || 502;
    throw err;
  }
};

const processAdminRefund = async (paymentId) => {
  let targetId = paymentId;
  if (typeof paymentId === 'string' && paymentId.startsWith('REF_')) {
    const rawId = paymentId.replace('REF_', '');
    const all = await paymentRepository.getAllSuccessfulPayments();
    const found = all.find(p => p.id.toUpperCase().startsWith(rawId.toUpperCase()));
    if (found) targetId = found.id;
  }

  let payment = await paymentRepository.getAdminPaymentById(targetId);
  if (!payment) {
    const err = new Error('Payment transaction not found');
    err.statusCode = 404;
    throw err;
  }

  if (payment.status === 'REFUNDED') {
    return { success: true, message: 'Refund has already been processed by Cashfree Payments PG', status: 'REFUNDED' };
  }

  let cashfreeRefundSuccess = false;
  let cashfreeRefundId = `REFUND_${payment.gateway_order_id || payment.id.substring(0, 8)}_${Date.now()}`;

  // Execute live Cashfree refund via Cashfree Gateway SDK
  if (payment.gateway_order_id && Cashfree && typeof Cashfree.PGOrderCreateRefund === 'function') {
    try {
      const refundRequest = {
        refund_amount: Number(payment.amount),
        refund_id: cashfreeRefundId,
        refund_note: 'Automated Cashfree Refund via Fahara Platform'
      };
      const cfRes = await Cashfree.PGOrderCreateRefund(payment.gateway_order_id, refundRequest);
      const cfData = cfRes.data || cfRes;
      if (cfData?.refund_status === 'SUCCESS' || cfData?.refund_status === 'PENDING') {
        cashfreeRefundSuccess = true;
      }
    } catch (error) {
      console.warn('Cashfree API Gateway Refund note:', error.response?.data || error.message);
      // In sandbox/testing mode or if order already refunded on gateway
      const errMessage = error.response?.data?.message || error.message || '';
      if (errMessage.toLowerCase().includes('already') || errMessage.toLowerCase().includes('success')) {
        cashfreeRefundSuccess = true;
      }
    }
  } else {
    // Standard processing for non-gateway test orders
    cashfreeRefundSuccess = true;
  }

  // Update status in repository based on Cashfree gateway response
  const newStatus = cashfreeRefundSuccess ? 'REFUNDED' : 'REFUND_PENDING';
  await paymentRepository.updatePaymentStatus(payment.id, newStatus);

  // Send automated notification email to customer
  const customerEmail = payment.bookings?.users?.email;
  const customerName = payment.bookings?.users?.name || 'Customer';
  const bookingNumber = payment.bookings?.booking_number || payment.id.substring(0, 8).toUpperCase();
  const referenceNumber = cashfreeRefundId;

  if (customerEmail && newStatus === 'REFUNDED') {
    const emailService = require('../utils/emailService');
    try {
      await emailService.sendRefundCompletedEmail(
        customerEmail,
        customerName,
        bookingNumber,
        Number(payment.amount || 0).toFixed(2),
        referenceNumber
      );
    } catch (eErr) {
      console.warn('Refund notification email warning:', eErr.message);
    }
  }

  // Create in-app notification for customer
  const customerUserId = payment.bookings?.customer_id || payment.bookings?.users?.id;
  if (customerUserId && newStatus === 'REFUNDED') {
    try {
      const notificationRepository = require('../repositories/notificationRepository');
      if (notificationRepository && notificationRepository.createNotification) {
        await notificationRepository.createNotification({
          user_id: customerUserId,
          booking_id: payment.booking_id,
          title: 'Refund Processed 🔄',
          message: `Your refund of ₹${Number(payment.amount).toFixed(2)} for booking #${bookingNumber} has been processed via Cashfree Payments. (Ref: ${referenceNumber})`,
          notification_type: 'REFUND_COMPLETED',
          channel: 'IN_APP',
          status: 'UNREAD'
        });
      }
    } catch (e) {
      console.error('Failed to create refund in-app notification:', e);
    }
  }

  return {
    success: true,
    message: cashfreeRefundSuccess
      ? 'Cashfree refund initiated successfully and status updated.'
      : 'Refund requested on Cashfree PG; awaiting gateway completion.',
    status: newStatus
  };
};

const getOwnerPayments = async (ownerId, query) => {
  const payments = await paymentRepository.getOwnerPayments(ownerId);
  
  const formattedData = payments.map(p => ({
    id: p.id,
    booking_id: p.booking_id,
    booking_number: p.bookings?.booking_number,
    amount: (() => {
      const b = p.bookings;
      if (!b) return Number(p.amount || 0);
      const eventCharge = (b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0);
      return Number(b.subtotal || 0) - eventCharge;
    })(),
    status: p.status,
    method: p.payment_gateway,
    date: p.paid_at || p.bookings?.created_at,
    booking_date: p.bookings?.booking_date || null,
    payment_date: p.paid_at || p.created_at || null,
    customer_name: p.bookings?.users?.name || 'Guest',
    cafe_name: p.bookings?.cafes?.name
  }));

  return {
    data: formattedData,
    pagination: {
      total: formattedData.length,
      page: 1,
      totalPages: 1
    }
  };
};

const getOwnerInvoices = async (ownerId, query) => {
  const allPayments = await paymentRepository.getOwnerPayments(ownerId);
  const successfulPayments = allPayments.filter(p => p.status === 'SUCCESS' || p.status === 'PAID');
  
  const mapped = successfulPayments.map(p => ({
    id: p.id,
    invoice_number: `INV-${p.id.substring(0, 8).toUpperCase()}`,
    amount: (() => {
      const b = p.bookings;
      if (!b) return Number(p.amount || 0);
      const eventCharge = (b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0);
      return Number(b.subtotal || 0) - eventCharge;
    })(),
    customer_name: p.bookings?.users?.name || 'Guest User',
    created_at: p.paid_at || p.created_at,
    status: p.status,
    customer_email: p.bookings?.users?.email,
    customer_phone: p.bookings?.users?.phone,
    cafe_name: p.bookings?.cafes?.name,
    cafe_address: p.bookings?.cafes?.address,
    booking_id: p.bookings?.booking_number || p.booking_id
  }));

  return {
    data: mapped,
    pagination: {
      total: mapped.length,
      page: 1,
      totalPages: 1
    }
  };
};

const getOwnerRefunds = async (ownerId, query) => {
  // 1. Fetch recorded payment_refunds
  const dbRefunds = await prisma.payment_refunds.findMany({
    where: {
      OR: [
        {
          payments: {
            bookings: {
              OR: [
                { cafes: { owner_id: ownerId } },
                { event_services: { user_id: ownerId } }
              ]
            }
          }
        },
        {
          bookings: {
            OR: [
              { cafes: { owner_id: ownerId } },
              { event_services: { user_id: ownerId } }
            ]
          }
        }
      ]
    },
    include: {
      bookings: {
        include: {
          users: true,
          cafes: true,
          event_services: true
        }
      },
      payments: true
    },
    orderBy: { created_at: 'desc' }
  });

  const formattedDbRefunds = dbRefunds.map(r => {
    const b = r.bookings;
    const isEventManager = b?.event_services?.user_id === ownerId;
    const isCafeOwner = b?.cafes?.owner_id === ownerId;

    const ownerBaseAmount = (() => {
      if (!b) return Number(r.refund_amount || 0);
      if (isEventManager && !isCafeOwner) {
        return Number(b.event_service_amount || 0);
      }
      if (isCafeOwner && !isEventManager) {
        const eventCharge = (b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0);
        return Number(b.subtotal || 0) - eventCharge;
      }
      return Number(b.subtotal || 0);
    })();

    const totalCustomerAmount = Number(b?.total || r.payments?.amount || r.refund_amount || 0);
    let netRefundAmount = Number(r.refund_amount || 0);
    if (totalCustomerAmount > 0 && ownerBaseAmount > 0 && totalCustomerAmount >= ownerBaseAmount) {
      const ratio = netRefundAmount / totalCustomerAmount;
      netRefundAmount = ratio >= 0.99 ? ownerBaseAmount : Number((ratio * ownerBaseAmount).toFixed(2));
    }

    const statusMap = {
      'SUCCESS': 'Refunded',
      'REFUNDED': 'Refunded',
      'COMPLETED': 'Refunded',
      'PENDING': 'Pending',
      'PROCESSING': 'Processing',
      'FAILED': 'Failed'
    };
    const mappedStatus = statusMap[String(r.refund_status || '').toUpperCase()] || r.refund_status || 'Refunded';

    return {
      id: r.id,
      bookingId: b?.booking_number || r.booking_id || 'N/A',
      booking_id: b?.booking_number || r.booking_id || 'N/A',
      customer: b?.users?.name || 'Guest Diner',
      customer_name: b?.users?.name || 'Guest Diner',
      refundAmount: netRefundAmount,
      refund_amount: netRefundAmount,
      amount: netRefundAmount,
      reason: r.reason || 'Booking cancellation refund',
      status: mappedStatus,
      refund_status: mappedStatus,
      date: r.created_at || r.completed_at,
      created_at: r.created_at,
      settlementAdjustment: true,
      adjustmentAmount: netRefundAmount
    };
  });

  // 2. Fallback / supplementary check for REFUNDED payments without explicit payment_refunds row
  const refundPaymentIds = new Set(dbRefunds.map(r => r.payment_id).filter(Boolean));
  const refundedPayments = await prisma.payments.findMany({
    where: {
      status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
      bookings: {
        OR: [
          { cafes: { owner_id: ownerId } },
          { event_services: { user_id: ownerId } }
        ]
      }
    },
    include: {
      bookings: {
        include: {
          users: true,
          cafes: true,
          event_services: true
        }
      }
    }
  });

  const formattedPaymentRefunds = refundedPayments
    .filter(p => !refundPaymentIds.has(p.id))
    .map(p => {
      const b = p.bookings;
      const isEventManager = b?.event_services?.user_id === ownerId;
      const isCafeOwner = b?.cafes?.owner_id === ownerId;

      const ownerBaseAmount = (() => {
        if (!b) return Number(p.amount || 0);
        if (isEventManager && !isCafeOwner) {
          return Number(b.event_service_amount || 0);
        }
        if (isCafeOwner && !isEventManager) {
          const eventCharge = (b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0);
          return Number(b.subtotal || 0) - eventCharge;
        }
        return Number(b.subtotal || 0);
      })();

      const netRefundAmount = ownerBaseAmount > 0 ? ownerBaseAmount : Number(p.amount || 0);

      return {
        id: `PAY_REF_${p.id}`,
        bookingId: b?.booking_number || p.booking_id || 'N/A',
        booking_id: b?.booking_number || p.booking_id || 'N/A',
        customer: b?.users?.name || 'Guest Diner',
        customer_name: b?.users?.name || 'Guest Diner',
        refundAmount: netRefundAmount,
        refund_amount: netRefundAmount,
        amount: netRefundAmount,
        reason: 'Customer cancellation refund',
        status: 'Refunded',
        refund_status: 'Refunded',
        date: p.updated_at || p.created_at,
        created_at: p.created_at,
        settlementAdjustment: true,
        adjustmentAmount: netRefundAmount
      };
    });

  const allRefunds = [...formattedDbRefunds, ...formattedPaymentRefunds];

  return {
    data: allRefunds,
    pagination: {
      total: allRefunds.length,
      page: 1,
      totalPages: 1
    }
  };
};

const getOwnerPayouts = async (ownerId, query) => {
  const dbRefunds = await prisma.payment_refunds.findMany({
    select: { payment_id: true, booking_id: true }
  });
  const refundedPaymentIds = new Set(dbRefunds.map(r => r.payment_id).filter(Boolean));
  const refundedBookingIds = new Set(dbRefunds.map(r => r.booking_id).filter(Boolean));

  const allPayments = await paymentRepository.getOwnerPayments(ownerId);
  const successfulPayments = allPayments.filter(p => {
    const b = p.bookings;
    const isRefunded = p.status === 'REFUNDED' || 
                       p.status === 'PARTIALLY_REFUNDED' || 
                       b?.payment_status === 'REFUNDED' || 
                       b?.payment_status === 'PARTIALLY_REFUNDED' ||
                       ['CANCELLED', 'REJECTED', 'DECLINED'].includes(String(b?.booking_status || '').toUpperCase()) ||
                       refundedPaymentIds.has(p.id) ||
                       (p.booking_id && refundedBookingIds.has(p.booking_id));
    return (p.status === 'SUCCESS' || p.status === 'PAID') && !isRefunded;
  });

  const mapped = successfulPayments.map(p => {
    const paymentDate = new Date(p.paid_at || p.created_at);
    // Add 7 days for payout
    const payoutDate = new Date(paymentDate);
    payoutDate.setDate(payoutDate.getDate() + 7);

    const now = new Date();
    const status = p.payout_status || (payoutDate <= now ? 'COMPLETED' : 'PROCESSING');

    const b = p.bookings;
    const isEventManager = b?.event_services?.user_id === ownerId;
    const isCafeOwner = b?.cafes?.owner_id === ownerId;

    const amount = (() => {
      if (!b) return Number(p.amount || 0);
      if (isEventManager && !isCafeOwner) {
        return Number(b.event_service_amount || b.subtotal || 0);
      }
      if (isCafeOwner && !isEventManager) {
        const eventCharge = (b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0);
        return Number(b.subtotal || 0) - eventCharge;
      }
      return Number(b.subtotal || p.amount || 0);
    })();

    const partnerUser = isEventManager ? b?.event_services?.users : b?.cafes?.users;
    const bankName = partnerUser?.bank_name || 'Bank Transfer';
    const accountLast4 = partnerUser?.account_number ? String(partnerUser.account_number).slice(-4) : '1234';

    const isCompletedStatus = status === 'COMPLETED' || status === 'Settled';

    return {
      id: p.id,
      transfer_date: p.payout_completed_at ? p.payout_completed_at.toISOString() : payoutDate.toISOString(),
      date: p.created_at,
      amount: amount,
      status: isCompletedStatus ? 'Settled' : (status === 'PROCESSING' ? 'Processing' : 'Pending'),
      payout_status: isCompletedStatus ? 'Settled' : (status === 'PROCESSING' ? 'Processing' : 'Pending'),
      tag: isCompletedStatus ? null : 'Date as Expected',
      payout_completed_at: p.payout_completed_at || null,
      reference_number: `REF-${p.id.substring(0,8).toUpperCase()}`,
      bank_name: bankName,
      account_last4: accountLast4
    };
  });

  return {
    data: mapped,
    pagination: {
      total: mapped.length,
      page: 1,
      totalPages: 1
    }
  };
};

const getOwnerRevenueSummary = async (ownerId, query) => {
  const dbRefunds = await prisma.payment_refunds.findMany({
    select: { payment_id: true, booking_id: true }
  });
  const refundedPaymentIds = new Set(dbRefunds.map(r => r.payment_id).filter(Boolean));
  const refundedBookingIds = new Set(dbRefunds.map(r => r.booking_id).filter(Boolean));

  const allPayments = await paymentRepository.getOwnerPayments(ownerId);
  const successfulPayments = allPayments.filter(p => {
    const b = p.bookings;
    const isRefunded = p.status === 'REFUNDED' || 
                       p.status === 'PARTIALLY_REFUNDED' || 
                       b?.payment_status === 'REFUNDED' || 
                       b?.payment_status === 'PARTIALLY_REFUNDED' ||
                       ['CANCELLED', 'REJECTED', 'DECLINED'].includes(String(b?.booking_status || '').toUpperCase()) ||
                       refundedPaymentIds.has(p.id) ||
                       (p.booking_id && refundedBookingIds.has(p.booking_id));
    return (p.status === 'SUCCESS' || p.status === 'PAID') && !isRefunded;
  });
  const refundedPayments = allPayments.filter(p => p.status === 'REFUNDED');
  
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  let todayRevenue = 0;
  let monthlyRevenue = 0;
  let ytdRevenue = 0;
  let totalRevenue = 0;
  let pendingSettlement = 0;
  let settledAmount = 0;
  
  const cafeRevenueMap = {};
  const eventRevenueMap = {};
  
  const months = [];
  const monthlyValues = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(monthNames[d.getMonth()]);
    monthlyValues.push(0);
  }

  successfulPayments.forEach(p => {
    const b = p.bookings;
    const isEventManager = b?.event_services?.user_id === ownerId;
    const isCafeOwner = b?.cafes?.owner_id === ownerId;

    const amt = (() => {
      if (!b) return Number(p.amount || 0);
      if (isEventManager && !isCafeOwner) {
        return Number(b.event_service_amount || b.subtotal || 0);
      }
      if (isCafeOwner && !isEventManager) {
        const eventCharge = (b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0);
        return Number(b.subtotal || 0) - eventCharge;
      }
      return Number(b.subtotal || p.amount || 0);
    })();
    const date = new Date(p.paid_at || p.bookings?.created_at || p.created_at);
    
    totalRevenue += amt;
    if (date >= startOfDay) todayRevenue += amt;
    if (date >= startOfMonth) monthlyRevenue += amt;
    if (date >= startOfYear) ytdRevenue += amt;

    // Check payout / settlement status from DB record
    const payoutDate = new Date(date);
    payoutDate.setDate(payoutDate.getDate() + 7);
    if (p.payout_status === 'COMPLETED' || payoutDate <= today) {
      settledAmount += amt;
    } else {
      pendingSettlement += amt;
    }
    
    const cafe = p.bookings?.cafes;
    if (cafe) {
      cafeRevenueMap[cafe.id] = cafeRevenueMap[cafe.id] || { name: cafe.name, revenue: 0 };
      cafeRevenueMap[cafe.id].revenue += amt;
    }
    
    const event = p.bookings?.event_services;
    if (event) {
      eventRevenueMap[event.id] = eventRevenueMap[event.id] || { name: event.service_name, revenue: 0 };
      eventRevenueMap[event.id].revenue += amt;
    }
    
    const monthDiff = (today.getFullYear() - date.getFullYear()) * 12 + (today.getMonth() - date.getMonth());
    if (monthDiff >= 0 && monthDiff <= 5) {
      const idx = 5 - monthDiff;
      monthlyValues[idx] += amt;
    }
  });

  const aov = successfulPayments.length > 0 ? totalRevenue / successfulPayments.length : 0;
  const successRate = allPayments.length > 0 ? (successfulPayments.length / allPayments.length) * 100 : 0;
  const refundRate = allPayments.length > 0 ? (refundedPayments.length / allPayments.length) * 100 : 0;
  const refundAmount = refundedPayments.reduce((sum, p) => {
    const b = p.bookings;
    const amt = b ? Number(b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0)) : Number(p.amount || 0);
    return sum + amt;
  }, 0);

  return {
    data: {
      total_booking_value: Number(totalRevenue.toFixed(2)),
      your_earnings: Number(totalRevenue.toFixed(2)),
      pending_settlement: Number(pendingSettlement.toFixed(2)),
      settled_amount: Number(settledAmount.toFixed(2)),
      today_revenue: Math.round(todayRevenue),
      monthly_revenue: Math.round(monthlyRevenue),
      completed_count: successfulPayments.length,
      refund_amount: Math.round(refundAmount),
      ytd_revenue: Math.round(ytdRevenue),
      aov: Math.round(aov),
      success_rate: Number(successRate.toFixed(1)),
      refund_rate: Number(refundRate.toFixed(1)),
      chart_data: { months, values: monthlyValues },
      top_revenue_cafes: Object.values(cafeRevenueMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      top_revenue_events: Object.values(eventRevenueMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    }
  };
};

const getOwnerPaymentById = async (ownerId, paymentId) => {
  const p = await paymentRepository.getOwnerPaymentById(ownerId, paymentId);
  if (!p) {
    return { data: null };
  }

  const b = p.bookings;
  const isEventManager = b?.event_services?.user_id === ownerId;
  const isCafeOwner = b?.cafes?.owner_id === ownerId;

  const amount = (() => {
    if (!b) return Number(p.amount || 0);
    if (isEventManager && !isCafeOwner) {
      return Number(b.event_service_amount || b.subtotal || 0);
    }
    if (isCafeOwner && !isEventManager) {
      const eventCharge = (b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0);
      return Number(b.subtotal || 0) - eventCharge;
    }
    return Number(b.subtotal || p.amount || 0);
  })();

  return {
    data: {
      id: p.id,
      transaction_id: p.gateway_payment_id || p.gateway_order_id,
      booking_id: p.booking_id,
      booking_number: p.bookings?.booking_number,
      amount: amount,
      status: p.status,
      method: p.payment_gateway,
      gateway: p.payment_gateway,
      date: p.paid_at || p.created_at,
      created_at: p.created_at,
      customer_name: p.bookings?.users?.name || 'Guest User',
      customer_email: p.bookings?.users?.email || 'N/A',
      customer_phone: p.bookings?.users?.phone || 'N/A',
      cafe_name: p.bookings?.cafes?.name || 'Fahara Cafe',
      cafe_address: p.bookings?.cafes?.address || 'N/A'
    }
  };
};

const syncCashfreePayoutStatus = async (paymentId) => {
  const prisma = require('../config/prisma');
  const [rawId] = (paymentId || '').split(':');

  if (!rawId) {
    const err = new Error('Invalid payout ID');
    err.statusCode = 400;
    throw err;
  }

  const payment = await prisma.payments.findUnique({
    where: { id: rawId },
    include: { bookings: true }
  });

  if (!payment) {
    const err = new Error('Payout payment record not found');
    err.statusCode = 404;
    throw err;
  }

  let updatedStatus = payment.payout_status || 'PENDING';
  let isSettled = updatedStatus === 'COMPLETED';

  if (payment.gateway_order_id && Cashfree) {
    try {
      let cfPayments = null;
      let cfSettlement = null;

      try {
        if (typeof Cashfree.PGOrderFetchPayments === 'function') {
          const res = await Cashfree.PGOrderFetchPayments(payment.gateway_order_id);
          cfPayments = res.data || res;
        }
      } catch (err) {
        console.warn('Cashfree fetch payments warning:', err.message);
      }

      try {
        if (typeof Cashfree.PGOrderFetchSettlement === 'function') {
          const res = await Cashfree.PGOrderFetchSettlement(payment.gateway_order_id);
          cfSettlement = res.data || res;
        }
      } catch (err) {
        console.warn('Cashfree fetch settlement warning:', err.message);
      }

      const hasSuccessPayment = Array.isArray(cfPayments) && cfPayments.some(p => p.payment_status === 'SUCCESS');
      const settlementStatus = cfSettlement?.settlement_status || cfSettlement?.status;

      if (settlementStatus === 'SETTLED' || settlementStatus === 'SUCCESS') {
        updatedStatus = 'COMPLETED';
        isSettled = true;
      } else if (hasSuccessPayment) {
        const paidAt = new Date(payment.paid_at || payment.created_at);
        const autoSettledDate = new Date(paidAt);
        autoSettledDate.setDate(autoSettledDate.getDate() + 1);

        if (new Date() >= autoSettledDate || payment.payout_status === 'COMPLETED') {
          updatedStatus = 'COMPLETED';
          isSettled = true;
        } else {
          updatedStatus = 'PROCESSING';
        }
      } else if (payment.status === 'FAILED' || payment.status === 'CANCELLED') {
        updatedStatus = 'FAILED';
      }
    } catch (cfErr) {
      console.error('Cashfree status sync error:', cfErr.message);
    }
  } else {
    if (payment.status === 'SUCCESS' || payment.status === 'PAID') {
      updatedStatus = 'COMPLETED';
      isSettled = true;
    }
  }

  await prisma.payments.update({
    where: { id: rawId },
    data: {
      payout_status: updatedStatus,
      ...(isSettled ? { payout_completed_at: payment.payout_completed_at || new Date() } : {})
    }
  });

  return getAdminPayoutById(paymentId);
};

const getAdminPayouts = async (query) => {
  const dbRefunds = await prisma.payment_refunds.findMany({
    select: { payment_id: true, booking_id: true }
  });
  const refundedPaymentIds = new Set(dbRefunds.map(r => r.payment_id).filter(Boolean));
  const refundedBookingIds = new Set(dbRefunds.map(r => r.booking_id).filter(Boolean));

  const allSuccessfulPayments = await paymentRepository.getAllSuccessfulPayments();
  const successfulPayments = allSuccessfulPayments.filter(p => {
    const b = p.bookings;
    const isRefunded = p.status === 'REFUNDED' || 
                       p.status === 'PARTIALLY_REFUNDED' || 
                       b?.payment_status === 'REFUNDED' || 
                       b?.payment_status === 'PARTIALLY_REFUNDED' ||
                       ['CANCELLED', 'REJECTED', 'DECLINED'].includes(String(b?.booking_status || '').toUpperCase()) ||
                       refundedPaymentIds.has(p.id) ||
                       (p.booking_id && refundedBookingIds.has(p.booking_id));
    return !isRefunded;
  });
  const mapped = [];

  for (const p of successfulPayments) {
    const paymentDate = new Date(p.paid_at || Date.now());
    const payoutDate = new Date(paymentDate);
    payoutDate.setDate(payoutDate.getDate() + 7);

    const now = new Date();
    let status = p.payout_status;

    if (!status || status === 'PENDING' || status === 'PROCESSING') {
      status = payoutDate <= now ? 'COMPLETED' : 'PROCESSING';
    }

    const b = p.bookings;
    const eventAmount = Number(b?.event_service_amount || 0);
    const totalSubtotal = Number(b?.subtotal || p?.amount || 0);
    const cafeAmount = Math.max(0, totalSubtotal - eventAmount);

    const hasCafeOwner = !!(b?.cafes?.users) && cafeAmount > 0;
    const hasEventManager = !!(b?.event_service_id && b?.event_services?.users) && eventAmount > 0;

    if (hasCafeOwner && hasEventManager) {
      // Cafe Owner Payout
      mapped.push({
        id: `${p.id}:CAFE_OWNER`,
        payment_id: p.id,
        transfer_date: p.payout_completed_at ? p.payout_completed_at.toISOString() : payoutDate.toISOString(),
        date: p.paid_at || new Date().toISOString(),
        created_at: p.paid_at || new Date().toISOString(),
        gross_amount: cafeAmount,
        fahara_fee: 0,
        payable_amount: cafeAmount,
        amount: cafeAmount,
        status: status,
        payout_status: status,
        payout_completed_at: p.payout_completed_at || null,
        reference_number: `REF-C-${p.id.substring(0,6).toUpperCase()}`,
        partner_type: 'CAFE_OWNER',
        partner_name: b.cafes.users.name || 'Cafe Owner',
        name: b.cafes.users.name || 'Cafe Owner',
        bank_name: b.cafes.users.bank_name || 'N/A'
      });

      // Event Manager Payout
      mapped.push({
        id: `${p.id}:EVENT_MANAGER`,
        payment_id: p.id,
        transfer_date: p.payout_completed_at ? p.payout_completed_at.toISOString() : payoutDate.toISOString(),
        date: p.paid_at || new Date().toISOString(),
        created_at: p.paid_at || new Date().toISOString(),
        gross_amount: eventAmount,
        fahara_fee: 0,
        payable_amount: eventAmount,
        amount: eventAmount,
        status: status,
        payout_status: status,
        payout_completed_at: p.payout_completed_at || null,
        reference_number: `REF-E-${p.id.substring(0,6).toUpperCase()}`,
        partner_type: 'EVENT_MANAGER',
        partner_name: b.event_services.users.name || 'Event Manager',
        name: b.event_services.users.name || 'Event Manager',
        bank_name: b.event_services.users.bank_name || 'N/A'
      });
    } else {
      let partnerType = 'CAFE_OWNER';
      let partnerUser = b?.cafes?.users;
      let grossAmount = cafeAmount > 0 ? cafeAmount : totalSubtotal;

      if (hasEventManager || (!hasCafeOwner && b?.event_services?.users)) {
        partnerType = 'EVENT_MANAGER';
        partnerUser = b?.event_services?.users;
        grossAmount = eventAmount > 0 ? eventAmount : totalSubtotal;
      }

      mapped.push({
        id: p.id,
        payment_id: p.id,
        transfer_date: p.payout_completed_at ? p.payout_completed_at.toISOString() : payoutDate.toISOString(),
        date: p.paid_at || new Date().toISOString(),
        created_at: p.paid_at || new Date().toISOString(),
        gross_amount: grossAmount,
        fahara_fee: 0,
        payable_amount: grossAmount,
        amount: grossAmount,
        status: status,
        payout_status: status,
        payout_completed_at: p.payout_completed_at || null,
        reference_number: `REF-${p.id.substring(0,8).toUpperCase()}`,
        partner_type: partnerType,
        partner_name: partnerUser?.name || 'Unknown Partner',
        name: partnerUser?.name || 'Unknown Partner',
        bank_name: partnerUser?.bank_name || 'N/A'
      });
    }
  }

  return {
    data: mapped,
    pagination: {
      total: mapped.length,
      page: 1,
      totalPages: 1
    }
  };
};

const getAdminPayoutById = async (paymentId) => {
  const [rawId, partnerTypeFilter] = paymentId.split(':');
  const p = await paymentRepository.getAdminPaymentById(rawId);
  if (!p) {
    return { data: null };
  }

  const paymentDate = new Date(p.paid_at || Date.now());
  const payoutDate = new Date(paymentDate);
  payoutDate.setDate(payoutDate.getDate() + 7);

  const now = new Date();
  const status = p.payout_status || (payoutDate <= now ? 'COMPLETED' : 'PROCESSING');

  const b = p.bookings;
  let partnerType = partnerTypeFilter || 'CAFE_OWNER';
  let partnerUser = b?.cafes?.users;
  let grossAmount = Number(b?.subtotal || p.amount || 0);

  if (partnerTypeFilter === 'EVENT_MANAGER' || (!b?.cafes?.users && b?.event_services?.users)) {
    partnerType = 'EVENT_MANAGER';
    partnerUser = b?.event_services?.users;
    grossAmount = Number(b?.event_service_amount || b?.subtotal || p.amount || 0);
  } else if (b?.event_services?.users && partnerType === 'CAFE_OWNER') {
    const eventAmount = Number(b?.event_service_amount || 0);
    grossAmount = Number(b?.subtotal || p.amount || 0) - eventAmount;
  }

  return {
    data: {
      id: paymentId,
      transaction_id: p.gateway_payment_id || p.gateway_order_id,
      reference_number: `REF-${p.id.substring(0,8).toUpperCase()}`,
      booking_number: b?.booking_number,
      gross_amount: grossAmount,
      fahara_fee: 0,
      taxes: 0,
      refund_adjustments: 0,
      payable_amount: grossAmount,
      status: status,
      payout_status: status,
      payout_completed_at: p.payout_completed_at || null,
      date: p.paid_at || new Date().toISOString(),
      booking_date: b?.booking_date || null,
      transfer_date: p.payout_completed_at ? p.payout_completed_at.toISOString() : payoutDate.toISOString(),
      partner_type: partnerType,
      partner_name: partnerUser?.name || 'Unknown',
      partner_email: partnerUser?.email || null,
      bank_name: partnerUser?.bank_name || 'Not provided',
      account_holder: partnerUser?.account_holder || 'Not provided',
      account_number: partnerUser?.account_number || 'Not provided',
      ifsc_code: partnerUser?.ifsc_code || 'Not provided'
    }
  };
};

const updatePayoutStatus = async (paymentId, status) => {
  const prisma = require('../config/prisma');
  const validStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'];
  const formattedStatus = (status || '').toUpperCase();

  if (!validStatuses.includes(formattedStatus)) {
    const err = new Error(`Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const [rawId] = paymentId.split(':');
  const existing = await prisma.payments.findUnique({ where: { id: rawId } });
  if (!existing) {
    const err = new Error('Payout payment record not found');
    err.statusCode = 404;
    throw err;
  }

  const isCompleted = formattedStatus === 'COMPLETED';

  await prisma.payments.update({
    where: { id: rawId },
    data: {
      payout_status: formattedStatus,
      ...(isCompleted ? { payout_completed_at: new Date() } : {})
    }
  });

  const updatedPayout = await getAdminPayoutById(paymentId);

  if (isCompleted && updatedPayout?.data) {
    const { partner_email, partner_name, payable_amount, reference_number, partner_type } = updatedPayout.data;
    const emailService = require('../utils/emailService');
    
    if (partner_email) {
      try {
        await emailService.sendPayoutCompletedEmail(partner_email, partner_name, payable_amount, reference_number, partner_type);
      } catch (e) {
        console.error('Failed to send payout completed email:', e);
      }
    }

    try {
      const pRecord = await prisma.payments.findUnique({
        where: { id: rawId },
        include: {
          bookings: {
            include: {
              cafes: true,
              event_services: true
            }
          }
        }
      });
      const partnerUserId = partner_type === 'EVENT_MANAGER' 
        ? pRecord?.bookings?.event_services?.user_id 
        : pRecord?.bookings?.cafes?.owner_id;

      if (partnerUserId) {
        const notificationRepository = require('../repositories/notificationRepository');
        if (notificationRepository && notificationRepository.createNotification) {
          await notificationRepository.createNotification({
            user_id: partnerUserId,
            booking_id: pRecord?.booking_id,
            title: 'Payout Transferred 💸',
            message: `Your payout of ₹${Number(payable_amount).toFixed(2)} (Ref: ${reference_number}) has been transferred by Fahara Admin.`,
            notification_type: 'PAYOUT_COMPLETED',
            channel: 'IN_APP',
            status: 'UNREAD'
          });
        }
      }
    } catch (e) {
      console.error('Failed to create payout in-app notification:', e);
    }
  }

  return updatedPayout;
};

const completeAdminPayout = async (paymentId) => {
  return await updatePayoutStatus(paymentId, 'COMPLETED');
};

const getAdminRevenueSummary = async (query) => {
  // Parse filter to startDate and endDate
  if (query.filter && !query.startDate && !query.endDate) {
    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (query.filter === 'Today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (query.filter === 'Week') {
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(startDate.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    } else if (query.filter === 'Month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (query.filter === 'Quarter') {
      const quarter = Math.floor(today.getMonth() / 3);
      startDate = new Date(today.getFullYear(), quarter * 3, 1);
    } else if (query.filter === 'Year') {
      startDate = new Date(today.getFullYear(), 0, 1);
    } else {
      startDate = null;
      endDate = null;
    }
    
    if (startDate && endDate) {
      query.startDate = startDate.toISOString();
      query.endDate = endDate.toISOString();
    }
  }

  const allPayments = await paymentRepository.getAllAdminTransactions(query);
  const successfulPayments = allPayments.filter(p => p.status === 'SUCCESS' || p.status === 'PAID');
  const refundedPayments = allPayments.filter(p => p.status === 'REFUNDED');

  let grossBookingValue = 0;
  let faharaPlatformRevenue = 0;
  let gstTax = 0;
  let discounts = 0;
  let refunds = 0;
  let cafePayable = 0;
  let eventManagerPayable = 0;
  let pendingSettlement = 0;

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); 

  let todayRevenue = 0;
  let monthlyRevenue = 0;
  let ytdRevenue = 0;

  const months = [];
  const monthlyValues = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(monthNames[d.getMonth()]);
    monthlyValues.push(0);
  }

  successfulPayments.forEach(p => {
    const b = p.bookings;
    if (!b) return;

    // Direct Database Fields
    const gv = Number(b.total || p.amount || 0);
    const platformRev = Number(b.fahara_service_charge || p.platform_fee || (Number(b.subtotal || 0) * 0.04));
    const tax = Number(b.gst || 0);
    const disc = Number(b.discount || 0);

    grossBookingValue += gv;
    faharaPlatformRevenue += platformRev;
    gstTax += tax;
    discounts += disc;

    // Calculate Partner Payables (Gross - Platform Rev - Tax)
    // Wait, if Platform Rev and Tax are deducted from the Gross, we can compute Payable:
    const netPayable = gv - platformRev - tax;

    const cafeAmt = Number(b.cafe_amount || 0) + Number(b.food_amount || 0) + Number(b.decoration_amount || 0) + Number(b.extra_person_amount || 0);
    const eventAmt = Number(b.event_service_amount || 0);
    const totalAmt = cafeAmt + eventAmt;

    if (b.event_service_id != null && totalAmt > 0) {
      // Mixed booking: split netPayable proportionally between cafe and event manager
      const cafeShare = netPayable * (cafeAmt / totalAmt);
      const eventShare = netPayable * (eventAmt / totalAmt);
      cafePayable += cafeShare;
      eventManagerPayable += eventShare;
    } else {
      // Cafe-only booking: full net amount goes to cafe
      cafePayable += netPayable;
    }

    const date = new Date(p.paid_at || b.booking_date || new Date());
    
    // Check pending settlements
    const payoutDate = new Date(date);
    payoutDate.setDate(payoutDate.getDate() + 7);
    if (payoutDate > today) {
      pendingSettlement += netPayable;
    }

    if (date >= startOfDay) todayRevenue += platformRev;
    if (date >= startOfMonth) monthlyRevenue += platformRev;
    ytdRevenue += platformRev;

    const monthDiff = (today.getFullYear() - date.getFullYear()) * 12 + (today.getMonth() - date.getMonth());
    if (monthDiff >= 0 && monthDiff <= 5) {
      const idx = 5 - monthDiff;
      monthlyValues[idx] += platformRev;
    }
  });

  refundedPayments.forEach(p => {
    refunds += Number(p.amount || 0);
  });

  const netRevenue = faharaPlatformRevenue; // Already net of refunds if we count them separate or we subtract refunds from it
  
  const successRate = allPayments.length > 0 ? (successfulPayments.length / allPayments.length) * 100 : 0;
  const refundRate = allPayments.length > 0 ? (refundedPayments.length / allPayments.length) * 100 : 0;

  const formatDec = (val) => Number(Number(val || 0).toFixed(2));

  return {
    data: {
      gross_booking_value: formatDec(grossBookingValue),
      grossBookingValue: formatDec(grossBookingValue),
      fahara_platform_revenue: formatDec(faharaPlatformRevenue),
      fahara_revenue: formatDec(faharaPlatformRevenue),
      faharaRevenue: formatDec(faharaPlatformRevenue),
      gst_tax: formatDec(gstTax),
      discounts: formatDec(discounts),
      refunds: formatDec(refunds),
      cafe_payable: formatDec(cafePayable),
      cafePayable: formatDec(cafePayable),
      event_manager_payable: formatDec(eventManagerPayable),
      eventManagerPayable: formatDec(eventManagerPayable),
      net_revenue: formatDec(netRevenue),
      netRevenue: formatDec(netRevenue),
      pending_settlement: formatDec(pendingSettlement),
      today_revenue: formatDec(todayRevenue),
      monthly_revenue: formatDec(monthlyRevenue),
      ytd_revenue: formatDec(ytdRevenue),
      success_rate: Number(successRate.toFixed(1)),
      refund_rate: Number(refundRate.toFixed(1)),
      chart_data: { months, values: monthlyValues }
    }
  };
};

const getAdminTransactions = async (query) => {
  // Parse filter to startDate and endDate
  if (query.filter && !query.startDate && !query.endDate) {
    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (query.filter === 'Today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (query.filter === 'Week') {
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(startDate.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
    } else if (query.filter === 'Month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (query.filter === 'Quarter') {
      const quarter = Math.floor(today.getMonth() / 3);
      startDate = new Date(today.getFullYear(), quarter * 3, 1);
    } else if (query.filter === 'Year') {
      startDate = new Date(today.getFullYear(), 0, 1);
    } else {
      startDate = null;
      endDate = null;
    }
    
    if (startDate && endDate) {
      query.startDate = startDate.toISOString();
      query.endDate = endDate.toISOString();
    }
  }

  const transactions = await paymentRepository.getAllAdminTransactions(query);
  
  const rows = [];

  for (const p of transactions) {
    const b = p.bookings;

    const gross = Number(b?.total || p.amount || 0);
    const platformFee = Number(b?.fahara_service_charge || 0);
    const tax = Number(b?.gst || 0);
    const totalPayable = gross - platformFee - tax;

    const isThreeParty = !!(b?.event_service_id && b?.event_services);

    if (isThreeParty) {
      // Split the net payable proportionally between cafe and event manager
      const cafeRawAmt = Number(b.cafe_amount || 0) + Number(b.food_amount || 0) +
                         Number(b.decoration_amount || 0) + Number(b.extra_person_amount || 0);
      const eventRawAmt = Number(b.event_service_amount || 0);
      const totalRawAmt = cafeRawAmt + eventRawAmt;

      const cafeShare = totalRawAmt > 0 ? Number(((cafeRawAmt / totalRawAmt) * totalPayable).toFixed(2)) : 0;
      const eventShare = totalRawAmt > 0 ? Number(((eventRawAmt / totalRawAmt) * totalPayable).toFixed(2)) : 0;

      // Row 1 — Cafe Owner
      rows.push({
        id: `${p.id}_cafe`,
        transaction_id: p.gateway_payment_id || p.gateway_order_id || p.id,
        booking_number: b?.booking_number || 'N/A',
        date: p.paid_at || p.created_at || new Date().toISOString(),
        customer_name: b?.users?.name || 'Guest',
        gross_amount: gross,
        platform_fee: platformFee,
        gst: tax,
        net_payable: cafeShare,
        status: p.status,
        partner_name: b?.cafes?.users?.name || 'Unknown Cafe Owner',
        partner_type: 'CAFE_OWNER',
        is_split: true
      });

      // Row 2 — Event Manager
      rows.push({
        id: `${p.id}_event`,
        transaction_id: p.gateway_payment_id || p.gateway_order_id || p.id,
        booking_number: b?.booking_number || 'N/A',
        date: p.paid_at || p.created_at || new Date().toISOString(),
        customer_name: b?.users?.name || 'Guest',
        gross_amount: gross,
        platform_fee: platformFee,
        gst: tax,
        net_payable: eventShare,
        status: p.status,
        partner_name: b?.event_services?.users?.name || b?.event_services?.service_name || 'Unknown Event Manager',
        partner_type: 'EVENT_MANAGER',
        is_split: true
      });
    } else {
      // Single-partner (cafe only) booking
      rows.push({
        id: p.id,
        transaction_id: p.gateway_payment_id || p.gateway_order_id || p.id,
        booking_number: b?.booking_number || 'N/A',
        date: p.paid_at || p.created_at || new Date().toISOString(),
        customer_name: b?.users?.name || 'Guest',
        gross_amount: gross,
        platform_fee: platformFee,
        gst: tax,
        net_payable: totalPayable,
        status: p.status,
        partner_name: b?.cafes?.users?.name || 'Unknown',
        partner_type: 'CAFE_OWNER',
        is_split: false
      });
    }
  }

  return {
    data: rows,
    pagination: {
      total: rows.length,
      page: 1,
      totalPages: 1
    }
  };
};

const getAdminPayments = async (query) => {
  const transactions = await paymentRepository.getAllAdminTransactions(query);
  
  const mapped = transactions.map(p => ({
    id: p.id,
    booking_id: p.bookings?.booking_number || 'N/A',
    gateway_order_id: p.gateway_order_id || 'N/A',
    transaction_id: p.gateway_payment_id || 'N/A',
    customer: p.bookings?.users?.name || 'Guest',
    amount: Number(p.amount || p.bookings?.total || 0),
    payment_method: p.payment_gateway || 'CASHFREE',
    gateway_status: p.status,
    internal_status: p.status,
    payment_date: p.paid_at || p.created_at || new Date().toISOString()
  }));

  return { data: mapped };
};

const getAdminPaymentDetails = async (id) => {
  const p = await paymentRepository.getAdminPaymentById(id);
  if (!p) return { data: null };

  return {
    data: {
      id: p.id,
      booking_id: p.bookings?.booking_number || 'N/A',
      gateway_order_id: p.gateway_order_id || 'N/A',
      transaction_id: p.gateway_payment_id || 'N/A',
      customer: p.bookings?.users?.name || 'Guest',
      customer_email: p.bookings?.users?.email || 'N/A',
      customer_phone: p.bookings?.users?.phone || 'N/A',
      amount: Number(p.amount || p.bookings?.total || 0),
      payment_method: p.payment_gateway || 'CASHFREE',
      gateway_status: p.status,
      internal_status: p.status,
      payment_date: p.paid_at || p.created_at || new Date().toISOString()
    }
  };
};

const getAdminRefunds = async (query) => {
  const transactions = await paymentRepository.getAllAdminTransactions(query);
  const refunds = transactions.filter(t => t.status === 'REFUNDED' || t.status === 'REFUND_PENDING');

  const mapped = refunds.map(p => ({
    id: `REF_${p.id.substring(0, 8).toUpperCase()}`,
    payment_id: p.id,
    booking: p.bookings?.booking_number || 'N/A',
    customer: p.bookings?.users?.name || 'Guest',
    amount: Number(p.amount || p.bookings?.total || 0),
    reason: 'Customer requested cancellation',
    status: p.status === 'REFUNDED' ? 'Completed' : 'Processing',
    requested_date: p.bookings?.updated_at || p.paid_at || new Date().toISOString(),
    processed_date: p.status === 'REFUNDED' ? (p.updated_at || new Date().toISOString()) : null
  }));

  return { data: mapped };
};

const syncCashfreeRefundStatus = async (paymentId) => {
  let targetId = paymentId;
  if (typeof paymentId === 'string' && paymentId.startsWith('REF_')) {
    const rawId = paymentId.replace('REF_', '');
    const prisma = require('../config/prisma');
    const found = await prisma.payments.findFirst({
      where: {
        id: { contains: rawId, mode: 'insensitive' }
      }
    });
    if (found) targetId = found.id;
  }

  const payment = await paymentRepository.getAdminPaymentById(targetId);
  if (!payment) {
    const err = new Error('Refund payment record not found');
    err.statusCode = 404;
    throw err;
  }

  let updatedStatus = payment.status;

  if (payment.gateway_order_id && Cashfree && typeof Cashfree.PGOrderFetchRefunds === 'function') {
    try {
      const res = await Cashfree.PGOrderFetchRefunds(payment.gateway_order_id);
      const refunds = res.data || res;
      if (Array.isArray(refunds)) {
        const successRefund = refunds.find(r => r.refund_status === 'SUCCESS');
        const failedRefund = refunds.find(r => r.refund_status === 'FAILED');
        if (successRefund) {
          updatedStatus = 'REFUNDED';
        } else if (failedRefund) {
          updatedStatus = 'FAILED';
        }
      }
    } catch (cfErr) {
      console.warn('Cashfree refund status sync warning:', cfErr.message);
    }
  }

  if (updatedStatus !== payment.status) {
    await paymentRepository.updatePaymentStatus(payment.id, updatedStatus);
  }

  return getAdminRefundDetails(payment.id);
};

const getAdminRefundDetails = async (id) => {
  // Extract payment id from REF_XXX format if needed or just use id
  // For simplicity, we just search for all transactions and filter
  let pId = id;
  if (id.startsWith('REF_')) {
    // Just find the transaction that matches the substring, or pass the actual payment id from frontend
  }

  const p = await paymentRepository.getAdminPaymentById(id); // assuming frontend sends actual payment id
  if (!p) return { data: null };

  return {
    data: {
      id: `REF_${p.id.substring(0, 8).toUpperCase()}`,
      payment_id: p.id,
      booking: p.bookings?.booking_number || 'N/A',
      customer: p.bookings?.users?.name || 'Guest',
      customer_email: p.bookings?.users?.email || 'N/A',
      customer_phone: p.bookings?.users?.phone || 'N/A',
      amount: Number(p.amount || p.bookings?.total || 0),
      reason: 'Customer requested cancellation',
      status: p.status === 'REFUNDED' ? 'Completed' : 'Processing',
      requested_date: p.bookings?.updated_at || p.paid_at || new Date().toISOString(),
      processed_date: p.status === 'REFUNDED' ? (p.updated_at || new Date().toISOString()) : null,
      gateway_refund_id: `GW_REF_${p.id.substring(0, 6)}`
    }
  };
};

const getAdminDisputes = async (query) => {
  return { data: [] };
};

const getOwnerSettlements = async (ownerId, query) => {
  const dbRefunds = await prisma.payment_refunds.findMany({
    select: { payment_id: true, booking_id: true }
  });
  const refundedPaymentIds = Array.from(new Set(dbRefunds.map(r => r.payment_id).filter(Boolean)));
  const refundedBookingIds = Array.from(new Set(dbRefunds.map(r => r.booking_id).filter(Boolean)));

  const targetVendorType = query.vendor_type || 'CAFE';
  const splits = await prisma.payment_splits.findMany({
    where: {
      vendor_type: targetVendorType,
      settlement_status: { notIn: ['REVERSED', 'CANCELLED'] },
      payments: {
        id: { notIn: refundedPaymentIds },
        status: { notIn: ['REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED', 'FAILED'] },
        bookings: {
          id: { notIn: refundedBookingIds },
          booking_status: { notIn: ['CANCELLED', 'REJECTED', 'DECLINED', 'REFUNDED'] },
          payment_status: { notIn: ['REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED', 'FAILED'] }
        }
      },
      OR: [
        { vendor_id: ownerId },
        {
          payments: {
            bookings: {
              cafes: { owner_id: ownerId }
            }
          }
        }
      ]
    },
    include: {
      payments: {
        include: {
          bookings: {
            include: {
              cafes: true,
              event_services: true,
              users: true
            }
          }
        }
      }
    },
    orderBy: { created_at: 'desc' }
  });

  if (splits && splits.length > 0) {
    const formatted = splits.map(s => {
      const b = s.payments?.bookings;
      const statusMap = {
        'SETTLED': 'Settled',
        'COMPLETED': 'Settled',
        'PENDING': 'Pending',
        'PROCESSING': 'Processing',
        'FAILED': 'Failed',
        'REVERSED': 'Reversed'
      };
      const mappedStatus = statusMap[String(s.settlement_status || '').toUpperCase()] || s.settlement_status || 'Pending';

      const invoiceDate = new Date(s.payments?.paid_at || s.payments?.created_at || s.created_at);
      const expectedSettlementDate = new Date(invoiceDate);
      expectedSettlementDate.setDate(expectedSettlementDate.getDate() + 7);

      return {
        id: s.id,
        bookingId: b?.booking_number || b?.id || 'N/A',
        booking_id: b?.booking_number || b?.id || 'N/A',
        date: s.settled_at || (mappedStatus === 'Settled' ? s.created_at : expectedSettlementDate.toISOString()),
        amount: Number(s.split_amount || 0),
        settled_amount: Number(s.split_amount || 0),
        status: mappedStatus,
        settlement_status: mappedStatus,
        vendor_type: s.vendor_type || 'CAFE',
        razorpayRef: s.razorpay_account_id || s.payment_account_id || s.settlement_id || `RZP_SETTLE_${s.id.substring(0, 8).toUpperCase()}`,
        razorpay_reference: s.razorpay_account_id || s.payment_account_id || s.settlement_id || `RZP_SETTLE_${s.id.substring(0, 8).toUpperCase()}`
      };
    });

    return { data: formatted, pagination: { total: formatted.length, page: 1, totalPages: 1 } };
  }

  const allPayments = await paymentRepository.getOwnerPayments(ownerId);
  const successfulPayments = allPayments.filter(p => {
    const b = p.bookings;
    const isRefunded = p.status === 'REFUNDED' || 
                       p.status === 'PARTIALLY_REFUNDED' || 
                       b?.payment_status === 'REFUNDED' || 
                       b?.payment_status === 'PARTIALLY_REFUNDED' ||
                       ['CANCELLED', 'REJECTED', 'DECLINED'].includes(String(b?.booking_status || '').toUpperCase()) ||
                       refundedPaymentIds.includes(p.id) ||
                       (p.booking_id && refundedBookingIds.includes(p.booking_id));
    return (p.status === 'SUCCESS' || p.status === 'PAID') && 
           !isRefunded && 
           p.payout_status !== 'REVERSED';
  });

  const now = new Date();
  const formatted = successfulPayments.map(p => {
    const b = p.bookings;
    const amount = (() => {
      if (!b) return Number(p.amount || 0);
      const eventCharge = (b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0);
      return Number(b.subtotal || 0) - eventCharge;
    })();

    const invoiceDate = new Date(p.paid_at || p.created_at);
    const payoutDate = new Date(invoiceDate);
    payoutDate.setDate(payoutDate.getDate() + 7);

    const isSettled = p.payout_status === 'COMPLETED' || p.settlement_status === 'SETTLED';
    const status = isSettled ? 'Settled' : 'Pending';

    return {
      id: `SETTLE_${p.id}`,
      bookingId: b?.booking_number || p.booking_id || 'N/A',
      booking_id: b?.booking_number || p.booking_id || 'N/A',
      date: p.payout_completed_at || (isSettled ? invoiceDate.toISOString() : payoutDate.toISOString()),
      amount: amount,
      settled_amount: amount,
      status: status,
      settlement_status: status,
      vendor_type: 'CAFE',
      cashfreeRef: p.gateway_payment_id ? `CF_SETTLE_${p.gateway_payment_id}` : `CF_SPLIT_${p.id.substring(0, 8).toUpperCase()}`,
      cashfree_reference: p.gateway_payment_id ? `CF_SETTLE_${p.gateway_payment_id}` : `CF_SPLIT_${p.id.substring(0, 8).toUpperCase()}`
    };
  });

  return {
    data: formatted,
    pagination: { total: formatted.length, page: 1, totalPages: 1 }
  };
};

const getOwnerSettlementById = async (ownerId, settlementId) => {
  const settlements = await getOwnerSettlements(ownerId, {});
  const found = (settlements.data || []).find(s => s.id === settlementId || s.id === `SETTLE_${settlementId}`);
  return { data: found || null };
};

module.exports = {
  createOrder,
  verifyPayment,
  checkPaymentStatusByBookingId,
  processRefund,
  processAdminRefund,
  getOwnerPayments,
  getOwnerInvoices,
  getOwnerRefunds,
  getOwnerPayouts,
  getOwnerSettlements,
  getOwnerSettlementById,
  getOwnerRevenueSummary,
  getOwnerPaymentById,
  getAdminPayouts,
  getAdminPayoutById,
  updatePayoutStatus,
  completeAdminPayout,
  syncCashfreePayoutStatus,
  getAdminRevenueSummary,
  getAdminTransactions,
  getAdminPayments,
  getAdminPaymentDetails,
  getAdminRefunds,
  getAdminRefundDetails,
  syncCashfreeRefundStatus,
  getAdminDisputes
};
