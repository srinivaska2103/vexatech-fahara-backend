const crypto = require('crypto');
const prisma = require('../config/prisma');
const bookingRepository = require('../repositories/bookingRepository');
const notificationService = require('../services/notificationService');
const webhookService = require('../services/webhookService');

/**
 * Handles Razorpay webhook notifications.
 * Endpoint: POST /api/v1/payments/webhook/razorpay or POST /api/webhooks/razorpay
 */
const handleRazorpayWebhook = async (req, res) => {
  try {
    const result = await webhookService.processRazorpayWebhook(req);
    return res.status(result.status || 200).json({ success: true, message: result.message });
  } catch (error) {
    console.error('Razorpay Webhook Controller Error:', error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
};

/**
 * Legacy Cashfree webhook signature verifier (maintained for historical backward compatibility).
 */
const verifyWebhookSignature = (rawBody, signature, timestamp) => {
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!secretKey || !signature || !timestamp) return false;

  try {
    const dataToSign = timestamp + rawBody;
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(dataToSign)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Legacy Cashfree webhook signature verification error:', error);
    return false;
  }
};

/**
 * Legacy Cashfree webhook handler (maintained for historical backward compatibility).
 */
const handleWebhook = async (req, res) => {
  // If request contains Razorpay signature or event structure, delegate to Razorpay handler
  if (req.headers['x-razorpay-signature'] || req.body?.event?.startsWith('payment.') || req.body?.event?.startsWith('order.')) {
    return handleRazorpayWebhook(req, res);
  }

  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (process.env.NODE_ENV === 'production' || signature) {
    const isValid = verifyWebhookSignature(rawBody, signature, timestamp);
    if (!isValid) {
      console.warn('Invalid Cashfree Webhook Signature received');
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }
  }

  const { type, data } = req.body || {};
  if (!data || !data.order) {
    return res.status(400).json({ success: false, message: 'Invalid webhook payload structure' });
  }

  const orderId = data.order.order_id;
  const paymentId = data.payment?.cf_payment_id ? String(data.payment.cf_payment_id) : null;
  const paymentStatus = data.payment?.payment_status;

  console.log(`Processing Cashfree Webhook Event: ${type} for order: ${orderId}`);

  try {
    const paymentRecord = await prisma.payments.findFirst({
      where: { gateway_order_id: orderId },
      include: { bookings: true }
    });

    if (!paymentRecord) {
      return res.status(404).json({ success: false, message: 'Order payment record not found' });
    }

    const bookingStatus = String(paymentRecord.bookings?.booking_status || '').toUpperCase();
    if (['CANCELLED', 'REJECTED', 'DECLINED'].includes(bookingStatus)) {
      const refundService = require('../services/refundService');
      await refundService.initiateRefund({
        paymentId: paymentRecord.id,
        reason: `Payment received after booking was ${bookingStatus.toLowerCase()} by vendor`,
        initiatedBy: 'SYSTEM'
      });
      return res.status(200).json({ success: true, message: 'Booking was cancelled/rejected. Auto-refund initiated.' });
    }

    if (paymentRecord.status === 'SUCCESS' && (type === 'PAYMENT_SUCCESS_WEBHOOK' || paymentStatus === 'SUCCESS')) {
      return res.status(200).json({ success: true, message: 'Webhook already processed' });
    }

    if (type === 'PAYMENT_SUCCESS_WEBHOOK' || paymentStatus === 'SUCCESS') {
      await prisma.payments.update({
        where: { id: paymentRecord.id },
        data: {
          status: 'SUCCESS',
          gateway_payment_id: paymentId,
          payment_method: data.payment?.payment_group || 'ONLINE',
          paid_at: new Date(data.payment?.payment_time || Date.now()),
          updated_at: new Date()
        }
      });

      if (paymentRecord.booking_id) {
        await prisma.bookings.update({
          where: { id: paymentRecord.booking_id },
          data: {
            payment_status: 'PAID',
            booking_status: 'CONFIRMED',
            updated_at: new Date()
          }
        });

        const fullBooking = await bookingRepository.getBookingById(paymentRecord.booking_id);
        if (fullBooking) {
          notificationService.notifyBookingStatusUpdated(fullBooking, 'CONFIRMED').catch(e => console.error(e));
        }
      }
    } else if (type === 'PAYMENT_FAILED_WEBHOOK' || paymentStatus === 'FAILED') {
      await prisma.payments.update({
        where: { id: paymentRecord.id },
        data: {
          status: 'FAILED',
          gateway_payment_id: paymentId,
          updated_at: new Date()
        }
      });

      if (paymentRecord.booking_id) {
        await prisma.bookings.update({
          where: { id: paymentRecord.booking_id },
          data: {
            payment_status: 'FAILED',
            updated_at: new Date()
          }
        });
      }
    }

    return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Error handling Cashfree webhook:', error);
    return res.status(500).json({ success: false, message: 'Internal server error processing webhook' });
  }
};

module.exports = {
  handleWebhook,
  handleRazorpayWebhook,
  verifyWebhookSignature
};
