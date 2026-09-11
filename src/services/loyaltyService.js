const prisma = require('../config/prisma');

const CREDITS_PER_RUPEE = 50;

/**
 * Get or initialize user's loyalty account
 */
const getOrCreateLoyaltyAccount = async (userId, tx = prisma) => {
  let account = await tx.user_loyalty_accounts.findUnique({
    where: { user_id: userId }
  });

  if (!account) {
    account = await tx.user_loyalty_accounts.create({
      data: {
        user_id: userId,
        credit_balance: 0,
        lifetime_credits_earned: 0,
        lifetime_credits_redeemed: 0,
        status: 'ACTIVE'
      }
    });
  }

  return account;
};

/**
 * Award 1 credit when a booking is COMPLETED
 */
const awardBookingCredit = async (bookingId) => {
  if (!bookingId) return null;

  // 1. Fetch booking & validate
  const booking = await prisma.bookings.findUnique({
    where: { id: bookingId },
    include: { users: true }
  });

  if (!booking) {
    const err = new Error(`Booking ${bookingId} not found`);
    err.statusCode = 404;
    throw err;
  }

  if (!booking.users) {
    const err = new Error(`Customer for booking ${bookingId} not found`);
    err.statusCode = 404;
    throw err;
  }

  // Validate status is PAID or COMPLETED
  const currentBookingStatus = (booking.booking_status || '').toUpperCase();
  const currentPaymentStatus = (booking.payment_status || '').toUpperCase();
  if (currentPaymentStatus !== 'PAID' && currentBookingStatus !== 'COMPLETED' && currentBookingStatus !== 'PAID') {
    console.log(`[LoyaltyService] Skipping reward: booking ${bookingId} payment_status is '${currentPaymentStatus}', booking_status is '${currentBookingStatus}'.`);
    return null;
  }

  const userId = booking.customer_id;

  // Check if reward transaction already exists (Duplicate Protection)
  const existingReward = await prisma.loyalty_credit_transactions.findFirst({
    where: {
      user_id: userId,
      booking_id: bookingId,
      type: 'EARN'
    }
  });

  if (existingReward) {
    console.log(`[LoyaltyService] Duplicate reward blocked: Booking ${bookingId} already earned credit tx ${existingReward.id}`);
    const account = await getOrCreateLoyaltyAccount(userId);
    return { account, transaction: existingReward, awarded: false };
  }

  // Execute database transaction
  return await prisma.$transaction(async (tx) => {
    // Re-check inside transaction to prevent race conditions
    const raceCheck = await tx.loyalty_credit_transactions.findFirst({
      where: {
        user_id: userId,
        booking_id: bookingId,
        type: 'EARN'
      }
    });

    if (raceCheck) {
      const account = await getOrCreateLoyaltyAccount(userId, tx);
      return { account, transaction: raceCheck, awarded: false };
    }

    const account = await getOrCreateLoyaltyAccount(userId, tx);

    if (account.status === 'SUSPENDED') {
      const err = new Error('Loyalty account is suspended');
      err.statusCode = 403;
      throw err;
    }

    const balanceBefore = account.credit_balance;
    const creditsToAdd = 1;
    const balanceAfter = balanceBefore + creditsToAdd;

    // Create EARN transaction record
    const transaction = await tx.loyalty_credit_transactions.create({
      data: {
        user_id: userId,
        loyalty_account_id: account.id,
        booking_id: bookingId,
        type: 'EARN',
        credits: creditsToAdd,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason: `Completed booking #${booking.booking_number || bookingId.substring(0, 8)}`,
        status: 'COMPLETED'
      }
    });

    // Update account balance
    const updatedAccount = await tx.user_loyalty_accounts.update({
      where: { id: account.id },
      data: {
        credit_balance: balanceAfter,
        lifetime_credits_earned: account.lifetime_credits_earned + creditsToAdd,
        updated_at: new Date()
      }
    });

    return { account: updatedAccount, transaction, awarded: true };
  });
};

/**
 * Reverse a booking credit if cancelled/refunded after being awarded
 */
const reverseBookingCredit = async (bookingId, reason = 'Booking cancelled/refunded') => {
  if (!bookingId) return null;

  const earnTransaction = await prisma.loyalty_credit_transactions.findFirst({
    where: {
      booking_id: bookingId,
      type: 'EARN'
    }
  });

  if (!earnTransaction) {
    console.log(`[LoyaltyService] No EARN transaction found for booking ${bookingId}. Skipping reversal.`);
    return null;
  }

  // Check if REVERSE transaction already exists
  const existingReverse = await prisma.loyalty_credit_transactions.findFirst({
    where: {
      booking_id: bookingId,
      type: 'REVERSE'
    }
  });

  if (existingReverse) {
    console.log(`[LoyaltyService] Duplicate reversal blocked: Booking ${bookingId} already reversed tx ${existingReverse.id}`);
    const account = await getOrCreateLoyaltyAccount(earnTransaction.user_id);
    return { account, transaction: existingReverse, reversed: false };
  }

  const userId = earnTransaction.user_id;

  return await prisma.$transaction(async (tx) => {
    const account = await getOrCreateLoyaltyAccount(userId, tx);
    const balanceBefore = account.credit_balance;
    const creditsToDeduct = earnTransaction.credits || 1;
    
    // Prevent negative balance
    const balanceAfter = Math.max(0, balanceBefore - creditsToDeduct);

    const transaction = await tx.loyalty_credit_transactions.create({
      data: {
        user_id: userId,
        loyalty_account_id: account.id,
        booking_id: bookingId,
        type: 'REVERSE',
        credits: creditsToDeduct,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason,
        status: 'COMPLETED'
      }
    });

    const updatedAccount = await tx.user_loyalty_accounts.update({
      where: { id: account.id },
      data: {
        credit_balance: balanceAfter,
        updated_at: new Date()
      }
    });

    return { account: updatedAccount, transaction, reversed: true };
  });
};

/**
 * Redeem credits in multiples of 50
 */
const redeemCredits = async (userId, creditsToRedeem) => {
  const credits = Number(creditsToRedeem);
  if (!credits || isNaN(credits) || credits <= 0 || !Number.isInteger(credits)) {
    const err = new Error('Credits must be a positive integer');
    err.statusCode = 400;
    throw err;
  }

  if (credits % CREDITS_PER_RUPEE !== 0) {
    const err = new Error(`Credits can only be redeemed in multiples of ${CREDITS_PER_RUPEE}.`);
    err.statusCode = 400;
    throw err;
  }

  const rupeeValue = credits / CREDITS_PER_RUPEE;

  return await prisma.$transaction(async (tx) => {
    const account = await getOrCreateLoyaltyAccount(userId, tx);

    if (account.status === 'SUSPENDED') {
      const err = new Error('Loyalty account is suspended');
      err.statusCode = 403;
      throw err;
    }

    if (account.credit_balance < credits) {
      const err = new Error('Insufficient Fahara Credits.');
      err.statusCode = 400;
      throw err;
    }

    const balanceBefore = account.credit_balance;
    const balanceAfter = balanceBefore - credits;

    // Create REDEEM transaction
    const transaction = await tx.loyalty_credit_transactions.create({
      data: {
        user_id: userId,
        loyalty_account_id: account.id,
        type: 'REDEEM',
        credits: credits,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason: `Redeemed ${credits} credits for ₹${rupeeValue}`,
        status: 'COMPLETED'
      }
    });

    // Create Redemption record
    const redemption = await tx.loyalty_redemptions.create({
      data: {
        user_id: userId,
        loyalty_account_id: account.id,
        credits_used: credits,
        rupee_value: rupeeValue,
        status: 'COMPLETED'
      }
    });

    // Update account balance
    const updatedAccount = await tx.user_loyalty_accounts.update({
      where: { id: account.id },
      data: {
        credit_balance: balanceAfter,
        lifetime_credits_redeemed: account.lifetime_credits_redeemed + credits,
        updated_at: new Date()
      }
    });

    return { account: updatedAccount, transaction, redemption, rupeeValue };
  });
};

/**
 * Get account summary
 */
const getAccountSummary = async (userId) => {
  const account = await getOrCreateLoyaltyAccount(userId);
  const balance = account.credit_balance;
  const rupeeValue = balance / CREDITS_PER_RUPEE;

  return {
    id: account.id,
    user_id: account.user_id,
    credit_balance: balance,
    lifetime_credits_earned: account.lifetime_credits_earned,
    lifetime_credits_redeemed: account.lifetime_credits_redeemed,
    rupee_value: Number(rupeeValue.toFixed(2)),
    credits_per_rupee: CREDITS_PER_RUPEE,
    status: account.status,
    created_at: account.created_at,
    updated_at: account.updated_at
  };
};

/**
 * Get user transactions history
 */
const getTransactions = async (userId, query = {}) => {
  const page = parseInt(query.page || 1, 10);
  const limit = parseInt(query.limit || 20, 10);
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.loyalty_credit_transactions.count({ where: { user_id: userId } }),
    prisma.loyalty_credit_transactions.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      include: {
        bookings: {
          select: {
            id: true,
            booking_number: true,
            booking_date: true,
            total: true
          }
        }
      }
    })
  ]);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    transactions: items
  };
};

/**
 * Get user redemptions history
 */
const getRedemptions = async (userId, query = {}) => {
  const page = parseInt(query.page || 1, 10);
  const limit = parseInt(query.limit || 20, 10);
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.loyalty_redemptions.count({ where: { user_id: userId } }),
    prisma.loyalty_redemptions.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit
    })
  ]);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    redemptions: items
  };
};

/**
 * Admin manual adjustment
 */
const adminAdjustCredits = async (adminId, userId, creditsAmount, type = 'ADJUSTMENT', reason = '') => {
  if (!reason || !reason.trim()) {
    const err = new Error('Reason is required for admin adjustment');
    err.statusCode = 400;
    throw err;
  }

  const credits = Number(creditsAmount);
  if (isNaN(credits) || credits === 0 || !Number.isInteger(credits)) {
    const err = new Error('Adjustment credits must be a non-zero integer');
    err.statusCode = 400;
    throw err;
  }

  const result = await prisma.$transaction(async (tx) => {
    const account = await getOrCreateLoyaltyAccount(userId, tx);
    const balanceBefore = account.credit_balance;
    let balanceAfter = balanceBefore + credits;

    if (balanceAfter < 0) balanceAfter = 0; // prevent negative balance

    const transaction = await tx.loyalty_credit_transactions.create({
      data: {
        user_id: userId,
        loyalty_account_id: account.id,
        type: type.toUpperCase(),
        credits: Math.abs(credits),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason: `[Admin Adjustment] ${reason.trim()}`,
        status: 'COMPLETED'
      }
    });

    const updatedAccount = await tx.user_loyalty_accounts.update({
      where: { id: account.id },
      data: {
        credit_balance: balanceAfter,
        lifetime_credits_earned: credits > 0 ? account.lifetime_credits_earned + credits : account.lifetime_credits_earned,
        updated_at: new Date()
      }
    });

    // Record audit log
    if (adminId) {
      try {
        await tx.audit_logs.create({
          data: {
            admin_id: adminId,
            action: 'MANUAL_LOYALTY_ADJUSTMENT',
            entity: 'user_loyalty_accounts',
            entity_id: account.id,
            status: 'success',
            metadata: {
              customer_id: userId,
              credits,
              previous_balance: balanceBefore,
              new_balance: balanceAfter,
              reason
            }
          }
        });
      } catch (auditErr) {
        console.warn('[LoyaltyService] Audit log warning:', auditErr.message);
      }
    }

    return { account: updatedAccount, transaction };
  });

  return result;
};

/**
 * Admin suspend/reactivate account
 */
const adminSuspendAccount = async (adminId, userId, status, reason = '') => {
  const validStatus = (status || '').toUpperCase();
  if (!['ACTIVE', 'SUSPENDED'].includes(validStatus)) {
    const err = new Error('Status must be ACTIVE or SUSPENDED');
    err.statusCode = 400;
    throw err;
  }

  const account = await getOrCreateLoyaltyAccount(userId);
  const updated = await prisma.user_loyalty_accounts.update({
    where: { id: account.id },
    data: {
      status: validStatus,
      updated_at: new Date()
    }
  });

  await prisma.audit_logs.create({
    data: {
      admin_id: adminId,
      action: `LOYALTY_ACCOUNT_${validStatus}`,
      entity: 'user_loyalty_accounts',
      entity_id: account.id,
      status: 'success',
      metadata: { customer_id: userId, status: validStatus, reason }
    }
  });

  return updated;
};

module.exports = {
  CREDITS_PER_RUPEE,
  getOrCreateLoyaltyAccount,
  awardBookingCredit,
  reverseBookingCredit,
  redeemCredits,
  getAccountSummary,
  getTransactions,
  getRedemptions,
  adminAdjustCredits,
  adminSuspendAccount
};
