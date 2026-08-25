const prisma = require('../config/prisma');
const { verifyWebhookSignature } = require('../config/razorpay');
const bookingRepository = require('../repositories/bookingRepository');
const notificationService = require('./notificationService');
const transferService = require('./transferService');

/**
 * Process incoming Razorpay Webhook Event
 */
const processRazorpayWebhook = async (req) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  // 1. Signature Verification in Production or when header provided
  if (process.env.NODE_ENV === 'production' || signature) {
    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      const err = new Error('Invalid Razorpay webhook signature');
      err.statusCode = 400;
      throw err;
    }
  }

  const payload = req.body || {};
  const eventType = payload.event;
  const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity || payload.payload?.refund?.entity || payload.payload?.transfer?.entity || {};

  console.log(`[Razorpay Webhook] Received Event: ${eventType}`, {
    id: entity.id,
    order_id: entity.order_id
  });

  if (!eventType) {
    return { status: 200, message: 'Ignored webhook with empty event' };
  }

  // 2. Handle Payment Success (Captured or Order Paid)
  if (eventType === 'payment.captured' || eventType === 'order.paid' || eventType === 'payment.authorized') {
    const orderId = entity.order_id || entity.id;
    const paymentId = entity.id;
    const paymentMethod = entity.method || 'ONLINE';

    const paymentIdNote = entity.notes?.payment_id;
    const isUuid = paymentIdNote && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentIdNote);

    const paymentRecord = await prisma.payments.findFirst({
      where: {
        OR: [
          ...(orderId ? [{ gateway_order_id: orderId }, { provider_order_id: orderId }] : []),
          ...(isUuid ? [{ id: paymentIdNote }] : [])
        ]
      },
      include: { bookings: { include: { cafes: true, event_services: true } } }
    });

    if (!paymentRecord) {
      console.warn(`[Razorpay Webhook] Payment record not found for order/payment: ${orderId}`);
      return { status: 200, message: 'Order payment record not found, skipped.' };
    }

    // Check if booking was already cancelled or rejected
    const bookingStatus = String(paymentRecord.bookings?.booking_status || '').toUpperCase();
    if (['CANCELLED', 'REJECTED', 'DECLINED'].includes(bookingStatus)) {
      console.warn(`[Razorpay Webhook] Payment received for cancelled booking ${paymentRecord.booking_id}. Triggering refund.`);
      const refundService = require('./refundService');
      await refundService.initiateRefund({
        paymentId: paymentRecord.id,
        reason: `Payment captured after booking was ${bookingStatus.toLowerCase()}`,
        initiatedBy: 'SYSTEM'
      });
      return { status: 200, message: 'Booking was cancelled. Auto-refund initiated.' };
    }

    // Idempotency: Skip if already marked PAID/SUCCESS
    if (paymentRecord.status === 'SUCCESS' || paymentRecord.status === 'PAID') {
      return { status: 200, message: 'Webhook already processed for this payment.' };
    }

    const now = new Date();
    await prisma.payments.update({
      where: { id: paymentRecord.id },
      data: {
        status: 'SUCCESS',
        gateway_payment_id: paymentId,
        provider_payment_id: paymentId,
        payment_method: paymentMethod,
        paid_at: entity.created_at ? new Date(entity.created_at * 1000) : now,
        updated_at: now
      }
    });

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
        notificationService.notifyBookingStatusUpdated(fullBooking, 'PAID').catch(e => console.error(e));
      }
    }

    // Execute / Confirm Split Transfers to Vendor Linked Accounts
    try {
      await transferService.executePaymentSplits(paymentRecord.id);
    } catch (transferErr) {
      console.error('[Razorpay Webhook Transfer Warning]:', transferErr.message);
    }

    return { status: 200, message: 'Payment success webhook processed successfully.' };
  }

  // 3. Handle Payment Failed
  if (eventType === 'payment.failed') {
    const orderId = entity.order_id || entity.id;
    const paymentRecord = await prisma.payments.findFirst({
      where: {
        OR: [
          { gateway_order_id: orderId },
          { provider_order_id: orderId }
        ]
      }
    });

    if (paymentRecord) {
      await prisma.payments.update({
        where: { id: paymentRecord.id },
        data: {
          status: 'FAILED',
          gateway_payment_id: entity.id,
          provider_payment_id: entity.id,
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

    return { status: 200, message: 'Payment failure webhook processed successfully.' };
  }

  // 4. Handle Refund Events
  if (eventType === 'refund.processed' || eventType === 'refund.created' || eventType === 'refund.failed') {
    const refundId = entity.id;
    const paymentId = entity.payment_id;
    const status = eventType === 'refund.failed' ? 'FAILED' : 'SUCCESS';

    const refundRecord = await prisma.payment_refunds.findFirst({
      where: {
        OR: [
          { provider_refund_id: refundId },
          { razorpay_refund_id: refundId }
        ]
      }
    });

    if (refundRecord) {
      await prisma.payment_refunds.update({
        where: { id: refundRecord.id },
        data: {
          refund_status: status,
          completed_at: status === 'SUCCESS' ? new Date() : null,
          updated_at: new Date()
        }
      });
    }

    return { status: 200, message: 'Refund webhook processed successfully.' };
  }

  // 5. Handle Transfer Events
  if (eventType === 'transfer.processed' || eventType === 'transfer.failed' || eventType === 'transfer.reversed') {
    const transferId = entity.id;
    const statusMap = {
      'transfer.processed': 'PROCESSED',
      'transfer.failed': 'FAILED',
      'transfer.reversed': 'REVERSED'
    };
    const mappedStatus = statusMap[eventType] || 'PROCESSED';

    const splitRecord = await prisma.payment_splits.findFirst({
      where: {
        OR: [
          { provider_transfer_id: transferId },
          { settlement_id: transferId }
        ]
      }
    });

    if (splitRecord) {
      const isCompleted = mappedStatus === 'PROCESSED';
      await prisma.payment_splits.update({
        where: { id: splitRecord.id },
        data: {
          transfer_status: mappedStatus,
          settlement_status: isCompleted ? 'COMPLETED' : mappedStatus,
          processed_at: isCompleted ? new Date() : splitRecord.processed_at,
          updated_at: new Date()
        }
      });

      if (isCompleted) {
        const { sendSettlementCompletedEmailForSplit } = require('./transferService');
        sendSettlementCompletedEmailForSplit(splitRecord.id).catch(e => console.error('[Webhook] Settlement email error:', e));
      }
    }

    return { status: 200, message: 'Transfer webhook processed successfully.' };

  }

  // 6. Handle Account / Route Product Webhook Events (Verification Completed)
  if (
    eventType === 'account.updated' ||
    eventType === 'account.activated' ||
    eventType === 'account.under_review' ||
    eventType === 'product.route.activated' ||
    eventType === 'product.route.under_review' ||
    eventType.startsWith('account.') ||
    eventType.startsWith('product.route.')
  ) {
    const accountEntity = payload.payload?.account?.entity || payload.payload?.product?.entity || entity;
    const accountId = accountEntity.id || accountEntity.account_id;
    const status = accountEntity.status || accountEntity.activation_status || 'activated';

    console.log(`[Razorpay Account Webhook] Processing account webhook for ${accountId}, status: ${status}`);

    if (accountId) {
      // Find matching Cafe or Event Profile
      const cafe = await prisma.cafes.findFirst({
        where: {
          OR: [
            { razorpay_linked_account_id: accountId },
            { payment_account_id: accountId }
          ]
        },
        include: { users: true }
      });

      let targetUser = null;
      let vendorType = 'CAFE';
      let entityId = null;
      let bankLast4 = 'XXXX';

      if (cafe) {
        targetUser = cafe.users;
        vendorType = 'CAFE';
        entityId = cafe.id;
        bankLast4 = cafe.bank_account_last4 || 'XXXX';

        await prisma.cafes.update({
          where: { id: cafe.id },
          data: {
            bank_verification_status: 'VERIFIED',
            razorpay_account_status: 'ACTIVE',
            bank_verified_at: new Date()
          }
        });
      } else {
        const eventProfile = await prisma.event_management_profiles.findFirst({
          where: {
            OR: [
              { razorpay_linked_account_id: accountId },
              { payment_account_id: accountId }
            ]
          },
          include: { users: true }
        });

        if (eventProfile) {
          targetUser = eventProfile.users;
          vendorType = 'EVENT_MANAGER';
          entityId = eventProfile.id;
          bankLast4 = eventProfile.bank_account_last4 || 'XXXX';

          await prisma.event_management_profiles.update({
            where: { id: eventProfile.id },
            data: {
              bank_verification_status: 'VERIFIED',
              razorpay_account_status: 'ACTIVE',
              bank_verified_at: new Date()
            }
          });
        }
      }

      // Send Email Notification to Cafe Owner / Event Manager
      if (targetUser && targetUser.email) {
        try {
          const emailService = require('../utils/emailService');
          const maskedAccount = `XXXX XXXX ${bankLast4}`;
          const roleTitle = vendorType === 'CAFE' ? 'Cafe Owner' : 'Event Manager';

          await emailService.sendBankVerifiedEmail(
            targetUser.email,
            targetUser.name || 'Partner',
            roleTitle,
            maskedAccount
          );
          console.log(`[Razorpay Webhook Email] Sent bank verification email to ${targetUser.email}`);
        } catch (emailErr) {
          console.error('[Razorpay Webhook Email Error]:', emailErr.message);
        }
      }
    }

    return { status: 200, message: 'Account verification webhook processed and notification email sent.' };
  }

  return { status: 200, message: `Event ${eventType} received and ignored.` };
};

module.exports = {
  processRazorpayWebhook
};
