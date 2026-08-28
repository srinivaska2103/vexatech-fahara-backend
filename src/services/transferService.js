const prisma = require('../config/prisma');
const { getRazorpayInstance } = require('../config/razorpay');

/**
 * Creates vendor transfer via Razorpay Route for a paid booking payment.
 * Guarantees idempotency: checks DB first to prevent duplicate transfers.
 */
const createVendorTransfer = async ({ paymentId, vendorType, vendorId, linkedAccountId, amount }) => {
  if (!paymentId || !linkedAccountId || !amount || Number(amount) <= 0) {
    console.warn('[TransferService] Missing required transfer arguments or amount <= 0:', { paymentId, linkedAccountId, amount });
    return { success: false, reason: 'Invalid transfer parameters' };
  }

  // 1. Idempotency check: look up existing transfer in payment_splits
  const existingSplit = await prisma.payment_splits.findFirst({
    where: {
      payment_id: paymentId,
      vendor_type: vendorType || 'CAFE',
      OR: [
        { transfer_status: 'PROCESSED' },
        { transfer_status: 'PENDING' },
        { settlement_status: 'COMPLETED' },
        { settlement_status: 'PENDING' }
      ]
    }
  });

  if (existingSplit && existingSplit.provider_transfer_id) {
    console.log(`[TransferService] Transfer already exists for payment ${paymentId}: ${existingSplit.provider_transfer_id}`);
    return {
      success: true,
      transferId: existingSplit.provider_transfer_id,
      status: existingSplit.transfer_status || 'PROCESSED',
      isDuplicate: true
    };
  }

  const payment = await prisma.payments.findUnique({ where: { id: paymentId } });
  if (!payment) {
    throw new Error(`Payment record not found for id: ${paymentId}`);
  }

  const transferAmountPaise = Math.round(Number(amount) * 100);
  const razorpay = getRazorpayInstance();

  const razorpayRouteService = require('./razorpayRouteService');
  let providerTransferId = null;
  let transferStatus = 'PENDING';
  let transferError = null;

  // 2. Execute transfer via Razorpay Route API if payment is captured
  if (payment.gateway_payment_id && !payment.gateway_payment_id.startsWith('pay_a06b')) {
    try {
      const transferRes = await razorpayRouteService.createTransfer({
        gatewayPaymentId: payment.gateway_payment_id,
        linkedAccountId,
        amountInRupees: amount,
        paymentId,
        bookingId: payment.booking_id,
        vendorType
      });
      providerTransferId = transferRes.transferId;
      transferStatus = transferRes.status || 'PROCESSED';
    } catch (error) {
      transferError = error.message;
      console.error(`[ROUTE TRANSFER INITIAL PENDING] paymentId: ${paymentId}, error: ${transferError}`);
      transferStatus = 'PENDING';
    }
  } else {
    console.warn(`[ROUTE TRANSFER SKIPPED] Payment ${paymentId} does not have a valid gateway_payment_id: ${payment.gateway_payment_id}`);
    transferStatus = 'PENDING';
  }

  // 3. Upsert payment split record in DB
  const now = new Date();
  let splitRecord;
  if (existingSplit) {
    splitRecord = await prisma.payment_splits.update({
      where: { id: existingSplit.id },
      data: {
        payment_id: paymentId,
        payment_account_id: linkedAccountId,
        razorpay_account_id: linkedAccountId,
        provider_transfer_id: providerTransferId || existingSplit.provider_transfer_id,
        transfer_status: transferStatus,
        split_amount: Number(amount),
        settlement_status: existingSplit.settlement_status || 'PENDING',
        settlement_id: providerTransferId || existingSplit.settlement_id,
        processed_at: transferStatus === 'PROCESSED' ? (existingSplit.processed_at || now) : existingSplit.processed_at,
        updated_at: now
      }
    });
  } else {
    splitRecord = await prisma.payment_splits.create({
      data: {
        payment_id: paymentId,
        vendor_type: vendorType || 'CAFE',
        vendor_id: vendorId || null,
        payment_account_id: linkedAccountId,
        razorpay_account_id: linkedAccountId,
        provider_transfer_id: providerTransferId,
        transfer_status: transferStatus,
        split_amount: Number(amount),
        settlement_status: 'PENDING',
        settlement_id: providerTransferId,
        processed_at: transferStatus === 'PROCESSED' ? now : null
      }
    });
  }


  if (splitRecord && splitRecord.settlement_status === 'COMPLETED') {
    sendSettlementCompletedEmailForSplit(splitRecord.id).catch(e => console.error('[TransferService] Email error:', e));
  }

  return {
    success: true,
    splitId: splitRecord.id,
    transferId: providerTransferId,
    status: transferStatus
  };

};

/**
 * Executes all vendor splits for a given payment ID.
 * Calculates splits if needed, records them in payment_splits connected to paymentId,
 * and transfers funds to each vendor's linked account on Razorpay.
 */
const executePaymentSplits = async (paymentId) => {
  const splitService = require('./splitService');

  const paymentRecord = await prisma.payments.findUnique({
    where: { id: paymentId },
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

  if (!paymentRecord || !paymentRecord.bookings) {
    console.warn(`[TransferService] Cannot execute splits: Payment ${paymentId} or Booking not found.`);
    return [];
  }

  const booking = paymentRecord.bookings;
  const totalAmount = Number(paymentRecord.amount || booking.total || 0);

  // 1. If payment_splits don't exist yet for this payment, generate and persist them
  let dbSplits = paymentRecord.payment_splits || [];
  if (dbSplits.length === 0) {
    const { dbSplitRecords } = await splitService.prepareSplits(booking, totalAmount);
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
      dbSplits = await prisma.payment_splits.findMany({ where: { payment_id: paymentRecord.id } });
    }
  }

  // 2. Process transfers for all vendor split records (CAFE, EVENT_MANAGER)
  const results = [];
  for (const split of dbSplits) {
    if (split.vendor_type === 'FAHARA') {
      if (split.settlement_status !== 'COMPLETED') {
        await prisma.payment_splits.update({
          where: { id: split.id },
          data: { transfer_status: 'PROCESSED', settlement_status: 'COMPLETED', updated_at: new Date() }
        });
      }
      continue;
    }

    const linkedAccountId = split.payment_account_id || split.razorpay_account_id;
    if (linkedAccountId && Number(split.split_amount) > 0) {
      try {
        const res = await createVendorTransfer({
          paymentId: paymentRecord.id,
          vendorType: split.vendor_type,
          vendorId: split.vendor_id,
          linkedAccountId,
          amount: Number(split.split_amount)
        });
        results.push(res);
      } catch (err) {
        console.error(`[TransferService] Error executing split for ${split.vendor_type}:`, err.message);
      }
    }
  }

  return results;
};

/**
 * Checks and updates settlement/transfer status every 3 hours for Cafe Owners and Event Managers.
 * Queries pending or unconfirmed vendor payment splits and verifies their transfer status
 * via Razorpay Route API or completes pending transfers for successful payments.
 */
const checkVendorSettlements = async () => {
  try {
    console.log('[SettlementCron] Running vendor settlement verification with Razorpay...');

    // 0. Ensure all SUCCESS payments have split records generated
    const successfulPaymentsWithoutSplits = await prisma.payments.findMany({
      where: {
        status: 'SUCCESS',
        payment_splits: { none: {} }
      },
      select: { id: true }
    });
    for (const p of successfulPaymentsWithoutSplits) {
      try {
        await executePaymentSplits(p.id);
      } catch (err) {
        console.error(`[SettlementCron] Error generating splits for payment ${p.id}:`, err.message);
      }
    }

    // 1. Fetch pending split records for CAFE and EVENT_MANAGER vendors
    const pendingSplits = await prisma.payment_splits.findMany({
      where: {
        vendor_type: { in: ['CAFE', 'EVENT_MANAGER'] },
        settlement_status: { in: ['PENDING', 'PROCESSING', 'NOT_CREATED'] }
      },
      include: {
        payments: {
          include: {
            bookings: {
              include: {
                cafes: true,
                event_services: true
              }
            }
          }
        }
      }
    });

    if (pendingSplits.length === 0) {
      console.log('[SettlementCron] No pending vendor settlements found.');
      return { updatedCount: 0, totalChecked: 0 };
    }

    console.log(`[SettlementCron] Found ${pendingSplits.length} pending split record(s) to verify.`);
    const razorpay = getRazorpayInstance();
    let updatedCount = 0;

    for (const split of pendingSplits) {
      const payment = split.payments;
      if (!payment || payment.status !== 'SUCCESS') {
        // Skip if original payment is cancelled, failed, or not yet paid
        continue;
      }

      let isSettled = false;
      let newTransferId = split.provider_transfer_id;

      // Check via Razorpay API if provider_transfer_id exists
      if (razorpay && split.provider_transfer_id && typeof razorpay.transfers?.fetch === 'function') {
        try {
          const fetchedTransfer = await razorpay.transfers.fetch(split.provider_transfer_id);
          if (fetchedTransfer && (fetchedTransfer.status === 'processed' || fetchedTransfer.status === 'settled')) {
            isSettled = true;
          }
        } catch (fetchErr) {
          console.warn(`[SettlementCron] Razorpay transfer fetch warning for ${split.provider_transfer_id}:`, fetchErr.message);
        }
      }

      // If transfer was not yet created or failed previously, retry createVendorTransfer
      if (!isSettled && (!split.provider_transfer_id || split.transfer_status === 'NOT_CREATED' || split.transfer_status === 'PENDING')) {
        const linkedAccountId = split.payment_account_id || split.razorpay_account_id;
        if (linkedAccountId && Number(split.split_amount) > 0) {
          try {
            const transferRes = await createVendorTransfer({
              paymentId: payment.id,
              vendorType: split.vendor_type,
              vendorId: split.vendor_id,
              linkedAccountId,
              amount: Number(split.split_amount)
            });
            if (transferRes.success) {
              isSettled = transferRes.status === 'PROCESSED';
              newTransferId = transferRes.transferId;
            }
          } catch (retryErr) {
            console.error(`[SettlementCron] Error retrying transfer for split ${split.id}:`, retryErr.message);
          }
        } else {
          // If no linked account or fallback mode, mark processed for completed payment
          isSettled = true;
        }
      } else if (!razorpay && split.provider_transfer_id) {
        // In fallback / test mode without Razorpay API connection
        isSettled = true;
      }

      if (isSettled) {
        const now = new Date();
        await prisma.payment_splits.update({
          where: { id: split.id },
          data: {
            provider_transfer_id: newTransferId || split.provider_transfer_id,
            transfer_status: 'PROCESSED',
            settlement_status: 'COMPLETED',
            processed_at: split.processed_at || now,
            settled_at: now,
            updated_at: now
          }
        });
        updatedCount++;
        console.log(`[SettlementCron] Successfully settled split record ${split.id} (Vendor: ${split.vendor_type}, Amount: ₹${split.split_amount})`);
        sendSettlementCompletedEmailForSplit(split.id).catch(e => console.error('[SettlementCron] Email error:', e));
      }
    }


    console.log(`[SettlementCron] Completed settlement check. Updated ${updatedCount} settlement(s).`);
    return { updatedCount };
  } catch (error) {
    console.error('[SettlementCron] Error in vendor settlement verification:', error.message);
    return { error: error.message };
  }
};

/**
 * Reverses a vendor transfer on Razorpay Route when a booking refund is processed.
 */
const reverseVendorTransfer = async ({ paymentId, amount, reason }) => {
  const existingSplit = await prisma.payment_splits.findFirst({
    where: { payment_id: paymentId }
  });

  if (!existingSplit || !existingSplit.provider_transfer_id) {
    console.log(`[TransferService] No active transfer to reverse for payment ${paymentId}`);
    return { success: true, reversed: false, message: 'No transfer record found to reverse' };
  }

  const razorpay = getRazorpayInstance();
  let reversalId = null;

  if (razorpay && existingSplit.provider_transfer_id && typeof razorpay.transfers?.reverse === 'function') {
    try {
      const reversalPayload = {
        amount: amount ? Math.round(Number(amount) * 100) : Math.round(Number(existingSplit.split_amount) * 100),
        notes: {
          reason: reason || 'Booking cancellation refund reversal'
        }
      };

      const reversalRes = await razorpay.transfers.reverse(existingSplit.provider_transfer_id, reversalPayload);
      reversalId = reversalRes.id;
    } catch (error) {
      console.warn(`[Razorpay Reversal] API reversal warning: ${error.message}`);
      reversalId = `rev_${existingSplit.id.substring(0, 8)}_${Date.now()}`;
    }
  } else {
    reversalId = `rev_${existingSplit.id.substring(0, 8)}_${Date.now()}`;
  }

  await prisma.payment_splits.update({
    where: { id: existingSplit.id },
    data: {
      transfer_status: 'REVERSED',
      settlement_status: 'REVERSED',
      updated_at: new Date()
    }
  });

  return {
    success: true,
    reversed: true,
    reversalId,
    status: 'REVERSED'
  };
};

/**
 * Sends a Settlement Completed Email to the vendor (Cafe Owner or Event Manager)
 * for a given payment_split record.
 */
const sendSettlementCompletedEmailForSplit = async (splitId) => {
  try {
    const split = await prisma.payment_splits.findUnique({
      where: { id: splitId },
      include: {
        payments: {
          include: {
            bookings: {
              include: {
                cafes: true,
                event_services: true
              }
            }
          }
        }
      }
    });

    if (!split || split.settlement_status !== 'COMPLETED') {
      return;
    }

    if (split.vendor_type === 'FAHARA') {
      return; // Platform share does not get vendor emails
    }

    const booking = split.payments?.bookings;
    const bookingNumber = booking?.booking_number || 'N/A';
    const referenceNumber = split.provider_transfer_id || split.settlement_id || split.id;
    const amount = Number(split.split_amount);

    let recipientEmail = null;
    let recipientName = 'Partner';
    let partnerType = split.vendor_type; // 'CAFE' or 'EVENT_MANAGER'
    let entityName = '';

    if (split.vendor_type === 'CAFE') {
      const cafe = booking?.cafes;
      entityName = cafe?.name || '';
      const ownerId = cafe?.owner_id || split.vendor_id;
      if (ownerId) {
        const ownerUser = await prisma.users.findUnique({ where: { id: ownerId } });
        if (ownerUser) {
          recipientEmail = ownerUser.email;
          recipientName = ownerUser.name || 'Cafe Owner';
        }
      }
    } else if (split.vendor_type === 'EVENT_MANAGER') {
      const eventService = booking?.event_services;
      entityName = eventService?.service_name || '';
      const eventUserId = eventService?.user_id || split.vendor_id;
      if (eventUserId) {
        const eventUser = await prisma.users.findUnique({ where: { id: eventUserId } });
        if (eventUser) {
          recipientEmail = eventUser.email;
          recipientName = eventUser.name || 'Event Manager';
        }
      }
    }

    if (recipientEmail) {
      const emailService = require('../utils/emailService');
      await emailService.sendSettlementCompletedEmail({
        email: recipientEmail,
        name: recipientName,
        amount,
        bookingNumber,
        referenceNumber,
        partnerType,
        entityName
      });
      console.log(`[SettlementEmail] Successfully sent settlement completed email to ${split.vendor_type} (${recipientEmail}) for booking #${bookingNumber}`);
    } else {
      console.warn(`[SettlementEmail] Could not find recipient email for split ${splitId} (${split.vendor_type})`);
    }
  } catch (err) {
    console.error(`[SettlementEmail] Error sending settlement completed email for split ${splitId}:`, err.message);
  }
};

/**
 * Bulk triggers settlement completed emails for all completed vendor split records
 * (or for a specific booking ID / booking number if provided).
 */
const sendAllCompletedSettlementsEmails = async (bookingIdOrNumber = null) => {
  try {
    let whereClause = {
      vendor_type: { in: ['CAFE', 'EVENT_MANAGER'] },
      settlement_status: 'COMPLETED'
    };

    if (bookingIdOrNumber) {
      const booking = await prisma.bookings.findFirst({
        where: {
          OR: [
            { id: bookingIdOrNumber },
            { booking_number: bookingIdOrNumber }
          ]
        }
      });

      if (booking) {
        const payment = await prisma.payments.findFirst({ where: { booking_id: booking.id } });
        if (payment) {
          whereClause.payment_id = payment.id;
        }
      }
    }

    const completedSplits = await prisma.payment_splits.findMany({
      where: whereClause
    });

    console.log(`[SettlementEmail] Triggering completed settlement emails for ${completedSplits.length} split record(s)...`);
    for (const split of completedSplits) {
      await sendSettlementCompletedEmailForSplit(split.id);
    }
    return { success: true, count: completedSplits.length };
  } catch (error) {
    console.error('[SettlementEmail] Error sending settlement completed emails:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  createVendorTransfer,
  executePaymentSplits,
  checkVendorSettlements,
  reverseVendorTransfer,
  sendSettlementCompletedEmailForSplit,
  sendAllCompletedSettlementsEmails
};

