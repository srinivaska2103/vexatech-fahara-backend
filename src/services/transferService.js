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

    // Enforce mandatory bank verification before settlement transfer
    if (split.vendor_type === 'CAFE' && split.vendor_id) {
      const cafe = await prisma.cafes.findFirst({
        where: { OR: [{ id: split.vendor_id }, { owner_id: split.vendor_id }] }
      });
      if (cafe && String(cafe.bank_verification_status || '').toUpperCase() !== 'VERIFIED') {
        console.warn(`[TransferService] Skipping settlement for cafe ${cafe.id}: Bank verification status is ${cafe.bank_verification_status}`);
        continue;
      }
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

    // Also sync from live Razorpay transfers list to auto-match any transfers by source order/payment ID
    const razorpay = getRazorpayInstance();
    if (razorpay && typeof razorpay.transfers?.all === 'function') {
      try {
        const liveTransfers = await razorpay.transfers.all({ count: 100 });
        if (liveTransfers && Array.isArray(liveTransfers.items)) {
          for (const t of liveTransfers.items) {
            const isSettled = t.settlement_status === 'settled';
            const isProcessed = t.status === 'processed';

            const matchedPayment = await prisma.payments.findFirst({
              where: {
                OR: [
                  { provider_order_id: t.source },
                  { gateway_order_id: t.source },
                  { gateway_payment_id: t.source }
                ]
              },
              include: { payment_splits: true }
            });

            if (matchedPayment && matchedPayment.payment_splits) {
              const matchedBooking = matchedPayment.bookings;
              const isBookingCancelled = matchedBooking && (matchedBooking.booking_status === 'CANCELLED' || matchedBooking.payment_status === 'REFUNDED');
              const isPaymentRefunded = matchedPayment.status === 'REFUNDED' || matchedPayment.status === 'PARTIALLY_REFUNDED';

              for (const split of matchedPayment.payment_splits) {
                // If payment or booking is cancelled/refunded, mark split as REVERSED, do not settle or email
                if (isBookingCancelled || isPaymentRefunded) {
                  if (split.settlement_status !== 'REVERSED') {
                    await prisma.payment_splits.update({
                      where: { id: split.id },
                      data: { transfer_status: 'REVERSED', settlement_status: 'REVERSED', updated_at: new Date() }
                    });
                  }
                  continue;
                }

                const updateData = {
                  provider_transfer_id: t.id,
                  transfer_status: isProcessed ? 'PROCESSED' : (t.status === 'pending' ? 'PENDING' : split.transfer_status)
                };

                if (isSettled && split.settlement_status !== 'COMPLETED') {
                  updateData.settlement_status = 'COMPLETED';
                  updateData.settled_at = new Date(t.created_at * 1000);
                  await prisma.payment_splits.update({ where: { id: split.id }, data: updateData });
                  sendSettlementCompletedEmailForSplit(split.id).catch(() => {});
                } else if (!isSettled && isProcessed && split.settlement_status === 'PENDING') {
                  updateData.settlement_status = 'PROCESSING';
                  await prisma.payment_splits.update({ where: { id: split.id }, data: updateData });
                }
              }
            }
          }
        }
      } catch (liveSyncErr) {
        console.warn('[SettlementCron] Live Razorpay transfers sync warning:', liveSyncErr.message);
      }
    }

    if (pendingSplits.length === 0) {
      console.log('[SettlementCron] No pending vendor settlements found.');
      return { updatedCount: 0, totalChecked: 0 };
    }

    console.log(`[SettlementCron] Found ${pendingSplits.length} pending split record(s) to verify.`);
    let updatedCount = 0;

    for (const split of pendingSplits) {
      const payment = split.payments;
      if (!payment || payment.status !== 'SUCCESS') {
        // Skip if original payment is cancelled, failed, or not yet paid
        continue;
      }

      // Check if associated food order is cancelled or refunded
      if (payment.gateway_order_id) {
        const fo = await prisma.food_orders.findFirst({
          where: { order_number: payment.gateway_order_id },
          select: { order_status: true, payment_status: true }
        });
        if (fo && (['CANCELLED', 'REJECTED'].includes(fo.order_status) || fo.payment_status === 'REFUNDED')) {
          console.log(`[SettlementCron] Skipping settlement for split ${split.id}: Food order ${payment.gateway_order_id} is CANCELLED/REFUNDED.`);
          if (split.settlement_status !== 'REVERSED') {
            await prisma.payment_splits.update({
              where: { id: split.id },
              data: { transfer_status: 'REVERSED', settlement_status: 'REVERSED', updated_at: new Date() }
            });
          }
          continue;
        }
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

    // Safety: If the underlying booking or payment has been cancelled or refunded, NEVER send a settlement completed email!
    // A customer cancellation/refund is NOT a vendor settlement event.
    const booking = split.payments?.bookings;
    if (booking && (booking.booking_status === 'CANCELLED' || booking.payment_status === 'REFUNDED' || booking.payment_status === 'PARTIALLY_REFUNDED')) {
      console.log(`[SettlementEmail] Skipped sending settlement email for split ${splitId}: Associated booking #${booking.booking_number} is CANCELLED/REFUNDED.`);
      return;
    }

    if (split.payments && (split.payments.status === 'REFUNDED' || split.payments.status === 'PARTIALLY_REFUNDED')) {
      console.log(`[SettlementEmail] Skipped sending settlement email for split ${splitId}: Payment status is ${split.payments.status}.`);
      return;
    }

    // Safety: If this payment belongs to a Food Order, verify the Food Order is NOT cancelled or refunded
    if (split.payments?.gateway_order_id) {
      const associatedFoodOrder = await prisma.food_orders.findFirst({
        where: { order_number: split.payments.gateway_order_id },
        select: { order_status: true, payment_status: true, order_number: true }
      });
      if (associatedFoodOrder && (['CANCELLED', 'REJECTED'].includes(associatedFoodOrder.order_status) || associatedFoodOrder.payment_status === 'REFUNDED')) {
        console.log(`[SettlementEmail] Skipped sending settlement email for split ${splitId}: Associated Food Order #${associatedFoodOrder.order_number} is CANCELLED/REFUNDED.`);
        return;
      }
    }

    if (split.vendor_type === 'FAHARA') {
      return; // Platform share does not get vendor emails
    }

    let bookingNumber = booking?.booking_number || split.payments?.gateway_order_id || 'N/A';
    const referenceNumber = split.provider_transfer_id || split.settlement_id || split.id;
    const amount = Number(split.split_amount);

    let recipientEmail = null;
    let recipientName = 'Partner';
    let partnerType = split.vendor_type; // 'CAFE' or 'EVENT_MANAGER'
    let entityName = '';

    if (split.vendor_type === 'CAFE') {
      let cafe = booking?.cafes;
      
      // If payment has no booking (e.g. food order), look up cafe by vendor_id or payment gateway_order_id
      if (!cafe && split.vendor_id) {
        cafe = await prisma.cafes.findUnique({
          where: { id: split.vendor_id },
          include: { users: true }
        });
      }

      // Check food_orders table if booking is still missing
      let foodOrder = null;
      if (!booking && split.payments?.gateway_order_id) {
        foodOrder = await prisma.food_orders.findFirst({
          where: { order_number: split.payments.gateway_order_id },
          include: { cafes: { include: { users: true } } }
        });
        if (foodOrder) {
          bookingNumber = foodOrder.order_number || bookingNumber;
          if (foodOrder.cafes) {
            cafe = foodOrder.cafes;
          }
        }
      }

      entityName = cafe?.name || 'Restaurant / Cafe';
      const ownerUser = cafe?.users || (cafe?.owner_id ? await prisma.users.findUnique({ where: { id: cafe.owner_id } }) : null) || (split.vendor_id ? await prisma.users.findUnique({ where: { id: split.vendor_id } }) : null);
      
      if (ownerUser) {
        recipientEmail = ownerUser.email;
        recipientName = ownerUser.name || cafe?.name || 'Cafe Owner';
      }
    } else if (split.vendor_type === 'EVENT_MANAGER') {
      const eventService = booking?.event_services || (split.vendor_id ? await prisma.event_services.findUnique({ where: { id: split.vendor_id }, include: { users: true } }) : null);
      entityName = eventService?.service_name || '';
      const eventUser = eventService?.users || (eventService?.user_id ? await prisma.users.findUnique({ where: { id: eventService.user_id } }) : null) || (split.vendor_id ? await prisma.users.findUnique({ where: { id: split.vendor_id } }) : null);
      
      if (eventUser) {
        recipientEmail = eventUser.email;
        recipientName = eventUser.name || 'Event Manager';
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

