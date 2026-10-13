const prisma = require('../config/prisma');
const { getRazorpayInstance } = require('../config/razorpay');

/**
 * Returns default Fahara Partner plan details (₹1/month).
 */
/**
 * Returns role-specific feature list consistent with actual Fahara platform features.
 */
const getRolePlanFeatures = (businessType = 'CAFE') => {
  if (businessType === 'RESTAURANT') {
    return [
      'Restaurant profile and location',
      'Photos and business information',
      'Customer discovery',
      'Menu display & table arrangements',
      'Booking management',
      'Offers and promotions',
      'Reviews and ratings',
      'Business insights & notifications'
    ];
  } else if (businessType === 'EVENT_MANAGER') {
    return [
      'Event Manager profile',
      'Custom event services',
      'User-created packages and inclusions',
      'Service pricing and availability',
      'Customer enquiries and bookings',
      'Reviews and ratings',
      'Business insights & notifications'
    ];
  }
  // Default: CAFE
  return [
    'Business profile and location',
    'Photos and gallery',
    'Customer discovery',
    'Booking and availability management',
    'Custom event packages and inclusions',
    'Deals and offers',
    'Reviews and ratings',
    'Business analytics & notifications'
  ];
};

/**
 * Resolves human-readable partner type, business name, partner name, and dashboard/subscription portal links.
 */
const resolvePartnerDetails = (user, businessType = 'CAFE') => {
  const roleName = user?.roles?.name || user?.role || businessType;
  let normalizedType = 'Cafe Owner';
  let bType = 'CAFE';

  if (roleName === 'RESTAURANT_OWNER' || businessType === 'RESTAURANT') {
    normalizedType = 'Restaurant Owner';
    bType = 'RESTAURANT';
  } else if (roleName === 'EVENT_MANAGER' || businessType === 'EVENT_MANAGER') {
    normalizedType = 'Event Manager';
    bType = 'EVENT_MANAGER';
  } else if (roleName === 'WALKING_CAFE_OWNER') {
    normalizedType = 'Walking Cafe Owner';
    bType = 'CAFE';
  }

  let businessName = user?.business_name;
  if (!businessName) {
    if (bType === 'EVENT_MANAGER') {
      businessName = user?.event_management_profiles?.[0]?.company_name || user?.event_management_profiles?.company_name;
    } else {
      businessName = user?.cafes?.[0]?.name || user?.cafes?.name;
    }
  }
  if (!businessName) {
    businessName = user?.name || 'Partner Business';
  }

  const partnerName = user?.name || businessName || 'Partner';

  const CAFE_FRONTEND_URL = process.env.CAFE_FRONTEND_URL || 'https://cafe.fahara.in';
  const EM_FRONTEND_URL = process.env.EM_FRONTEND_URL || 'https://em.fahara.in';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://fahara.in';

  let dashboardUrl = `${CAFE_FRONTEND_URL}/owner/dashboard`;
  let subscriptionPageUrl = `${CAFE_FRONTEND_URL}/owner/subscription`;

  if (bType === 'EVENT_MANAGER') {
    dashboardUrl = `${EM_FRONTEND_URL}/event/dashboard`;
    subscriptionPageUrl = `${EM_FRONTEND_URL}/event/subscription`;
  } else if (bType === 'RESTAURANT') {
    dashboardUrl = `${FRONTEND_URL}/restaurant-owner/dashboard`;
    subscriptionPageUrl = `${FRONTEND_URL}/restaurant-owner/subscription`;
  }

  return {
    partnerName,
    businessName,
    partnerType: normalizedType,
    businessType: bType,
    dashboardUrl,
    subscriptionPageUrl,
    email: user?.email || '',
    phone: user?.phone || ''
  };
};

/**
 * Returns plan details based on planName, targetPrice, and businessType.
 */
const getOrCreatePlan = async (planName = 'FAHARA CAFE PARTNER', targetPrice = 299.00, businessType = 'CAFE') => {
  let plan = await prisma.subscription_plans.findFirst({
    where: { name: planName, is_active: true }
  });

  const features = getRolePlanFeatures(businessType);
  const description = `${planName} subscription for Fahara ${businessType.toLowerCase().replace('_', ' ')} partners.`;

  if (!plan) {
    plan = await prisma.subscription_plans.create({
      data: {
        name: planName,
        price: targetPrice,
        currency: 'INR',
        billing_cycle: 'MONTHLY',
        description,
        features,
        is_active: true
      }
    });
  } else if (Number(plan.price) !== Number(targetPrice)) {
    plan = await prisma.subscription_plans.update({
      where: { id: plan.id },
      data: { 
        price: targetPrice,
        features,
        description
      }
    });
  }

  return plan;
};


/**
 * Gets or creates the Razorpay Plan ID for given plan name, price (in INR), and description.
 */
const getRazorpayPlanId = async (planName = 'FAHARA PARTNER', priceInINR = 1) => {
  const razorpay = getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay SDK is not initialized. Check server configuration.');
  }

  const amountInPaise = Math.round(priceInINR * 100);

  try {
    const plansList = await razorpay.plans.all({ count: 50 });
    const existingRzpPlan = plansList.items?.find(p => 
      p.item?.name === planName && 
      p.item?.amount === amountInPaise && 
      p.period === 'monthly'
    );

    if (existingRzpPlan) {
      return existingRzpPlan.id;
    }

    const createdRzpPlan = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: planName,
        amount: amountInPaise,
        currency: 'INR',
        description: `${planName} Monthly Subscription ₹${priceInINR}/month`
      }
    });

    return createdRzpPlan.id;
  } catch (err) {
    console.error('[SubscriptionService] Error getting/creating Razorpay plan:', err.message);
    throw err;
  }
};

/**
 * Check user subscription status from database.
 */
const getSubscriptionStatus = async (userId) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: { roles: true }
  });

  const userRole = user?.roles?.name || user?.role || 'CAFE_OWNER';
  let defaultBusinessType = 'CAFE';
  let defaultPlanName = 'FAHARA CAFE PARTNER';
  let defaultPrice = 299;

  if (userRole === 'RESTAURANT_OWNER') {
    defaultBusinessType = 'RESTAURANT';
    defaultPlanName = 'FAHARA RESTAURANT PARTNER';
    defaultPrice = 149;
  } else if (userRole === 'EVENT_MANAGER') {
    defaultBusinessType = 'EVENT_MANAGER';
    defaultPlanName = 'FAHARA EVENT PARTNER';
    defaultPrice = 299;
  }

  const sub = await prisma.partner_subscriptions.findFirst({
    where: { user_id: userId },
    include: { subscription_plans: true },
    orderBy: { created_at: 'desc' }
  });

  if (!sub) {
    return {
      hasSubscription: false,
      isActive: false,
      status: 'INACTIVE',
      partnerType: userRole,
      businessType: defaultBusinessType,
      planName: defaultPlanName,
      amount: defaultPrice,
      currency: 'INR',
      billingInterval: 'monthly',
      subscription: null
    };
  }

  const now = new Date();
  const isPeriodActive = sub.current_period_end ? new Date(sub.current_period_end) > now : false;
  const isActive = sub.status === 'ACTIVE' && isPeriodActive;

  const actualPlanName = sub.subscription_plans?.name || (
    sub.business_type === 'EVENT_MANAGER' ? 'FAHARA EVENT PARTNER' :
    sub.business_type === 'RESTAURANT' ? 'FAHARA RESTAURANT PARTNER' : 'FAHARA CAFE PARTNER'
  );
  const actualPrice = sub.subscription_plans?.price ? Number(sub.subscription_plans.price) : (
    sub.business_type === 'RESTAURANT' ? 149 : 299
  );

  return {
    hasSubscription: true,
    isActive,
    status: isActive ? 'ACTIVE' : (sub.status === 'ACTIVE' && !isPeriodActive ? 'EXPIRED' : sub.status),
    partnerType: userRole,
    businessType: sub.business_type || defaultBusinessType,
    planName: actualPlanName,
    amount: actualPrice,
    currency: 'INR',
    billingInterval: 'monthly',
    subscription: {
      id: sub.id,
      userId: sub.user_id,
      businessId: sub.business_id,
      businessType: sub.business_type,
      planId: sub.plan_id,
      planName: actualPlanName,
      price: actualPrice,
      status: sub.status,
      razorpaySubscriptionId: sub.razorpay_subscription_id,
      razorpayCustomerId: sub.razorpay_customer_id,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at
    }
  };
};

/**
 * Creates a Razorpay Subscription for Cafe, Restaurant, or Event Manager.
 */
const createSubscription = async (user, targetRole = null) => {
  // 1. Role verification
  const userRole = user.roles?.name || user.role;

  // Strict check if specifically called for EVENT_MANAGER flow
  if (targetRole === 'EVENT_MANAGER' && userRole !== 'EVENT_MANAGER') {
    const error = new Error('Subscription is available only for Event Managers.');
    error.statusCode = 403;
    error.code = 'SUBSCRIPTION_NOT_ALLOWED';
    throw error;
  }

  const isAllowedRole = ['CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'EVENT_MANAGER'].includes(userRole);

  if (!isAllowedRole) {
    const error = new Error('Subscription is not available for your user role.');
    error.statusCode = 403;
    error.code = 'SUBSCRIPTION_NOT_ALLOWED';
    throw error;
  }

  let businessType = 'CAFE';
  let planName = 'FAHARA CAFE PARTNER';
  let planPrice = 299.00;

  if (userRole === 'RESTAURANT_OWNER') {
    businessType = 'RESTAURANT';
    planName = 'FAHARA RESTAURANT PARTNER';
    planPrice = 149.00;
  } else if (userRole === 'EVENT_MANAGER') {
    businessType = 'EVENT_MANAGER';
    planName = 'FAHARA EVENT PARTNER';
    planPrice = 299.00;
  }


  // 2. Identify business ID
  let businessId = null;
  if (userRole === 'EVENT_MANAGER') {
    const evProfile = await prisma.event_management_profiles.findFirst({
      where: { user_id: user.id }
    });
    businessId = evProfile ? evProfile.id : null;
  } else {
    const cafe = await prisma.cafes.findFirst({
      where: { owner_id: user.id }
    });
    businessId = cafe ? cafe.id : null;
  }

  // 3. Get or create Plan in DB and Razorpay
  const dbPlan = await getOrCreatePlan(planName, planPrice, businessType);

  // 4. Check existing active subscription
  const existingSubStatus = await getSubscriptionStatus(user.id);
  if (existingSubStatus.isActive && existingSubStatus.subscription) {
    return {
      alreadyActive: true,
      subscription: existingSubStatus.subscription,
      message: `Active ${planName} subscription already exists.`
    };
  }

  // 5. Create Razorpay Order & Subscription
  const razorpay = getRazorpayInstance();
  if (!razorpay) {
    throw new Error('Razorpay SDK is not initialized.');
  }

  const amountInPaise = Math.round(planPrice * 100);

  let rzpOrder = null;
  try {
    rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sub_${user.id.substring(0, 8)}_${Date.now()}`,
      notes: {
        user_id: user.id,
        user_email: user.email,
        business_type: businessType,
        business_id: businessId || '',
        type: 'PARTNER_SUBSCRIPTION'
      }
    });
  } catch (orderErr) {
    console.warn('[SubscriptionService] Razorpay order creation warning:', orderErr.message);
  }

  let rzpSubscription = null;
  try {
    const rzpPlanId = await getRazorpayPlanId(planName, planPrice);
    rzpSubscription = await razorpay.subscriptions.create({
      plan_id: rzpPlanId,
      customer_notify: 1,
      total_count: 120, // 10 years monthly max
      notes: {
        user_id: user.id,
        user_email: user.email,
        business_type: businessType,
        business_id: businessId || ''
      }
    });
  } catch (subErr) {
    console.warn('[SubscriptionService] Razorpay subscription creation warning:', subErr.message);
  }

  const subIdToSave = rzpSubscription?.id || rzpOrder?.id || `sub_${Date.now()}`;

  const now = new Date();
  // 6. Save or update DB record
  const existingRecord = await prisma.partner_subscriptions.findFirst({
    where: { user_id: user.id }
  });

  let partnerSub;
  if (existingRecord) {
    partnerSub = await prisma.partner_subscriptions.update({
      where: { id: existingRecord.id },
      data: {
        business_id: businessId,
        business_type: businessType,
        plan_id: dbPlan.id,
        razorpay_subscription_id: subIdToSave,
        razorpay_plan_id: rzpSubscription?.plan_id || null,
        status: 'INACTIVE',
        updated_at: now
      }
    });
  } else {
    partnerSub = await prisma.partner_subscriptions.create({
      data: {
        user_id: user.id,
        business_id: businessId,
        business_type: businessType,
        plan_id: dbPlan.id,
        razorpay_subscription_id: subIdToSave,
        razorpay_plan_id: rzpSubscription?.plan_id || null,
        status: 'INACTIVE'
      }
    });
  }

  return {
    success: true,
    orderId: rzpOrder?.id || null,
    subscriptionId: rzpSubscription?.id || subIdToSave,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    planName: dbPlan.name,
    amount: planPrice,
    currency: 'INR',
    businessType,
    user: {
      name: user.name,
      email: user.email,
      phone: user.phone
    }
  };
};

/**
 * Handles Webhook Events for Razorpay Subscriptions (Idempotent).
 */
const syncRazorpaySubscriptionEvent = async (event, payload) => {
  const subEntity = payload.subscription?.entity || payload.payment?.entity || {};
  const razorpaySubId = subEntity.subscription_id || subEntity.id;

  if (!razorpaySubId) {
    return { status: 200, message: 'No subscription ID in webhook payload, ignored.' };
  }

  console.log(`[Subscription Webhook] Event: ${event} for Subscription ID: ${razorpaySubId}`);

  const dbSub = await prisma.partner_subscriptions.findFirst({
    where: { razorpay_subscription_id: razorpaySubId },
    include: { users: true }
  });

  if (!dbSub) {
    console.warn(`[Subscription Webhook] No matching DB record found for Razorpay Subscription: ${razorpaySubId}`);
    return { status: 200, message: 'Subscription DB record not found, ignored.' };
  }

  const now = new Date();
  let newStatus = dbSub.status;
  let periodStart = dbSub.current_period_start;
  let periodEnd = dbSub.current_period_end;
  let cancelAtPeriodEnd = dbSub.cancel_at_period_end;

  if (subEntity.current_start) {
    periodStart = new Date(subEntity.current_start * 1000);
  }
  if (subEntity.current_end) {
    periodEnd = new Date(subEntity.current_end * 1000);
  } else if (!periodEnd || periodEnd <= now) {
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    periodEnd = thirtyDaysLater;
  }

  switch (event) {
    case 'subscription.authenticated':
    case 'subscription.activated':
    case 'subscription.charged':
    case 'payment.captured':
      newStatus = 'ACTIVE';
      break;
    case 'subscription.halted':
    case 'subscription.paused':
      newStatus = 'PAST_DUE';
      break;
    case 'subscription.cancelled':
      cancelAtPeriodEnd = true;
      if (periodEnd && periodEnd <= now) {
        newStatus = 'CANCELLED';
      }
      break;
    case 'subscription.completed':
    case 'subscription.expired':
      newStatus = 'EXPIRED';
      break;
    default:
      break;
  }

  const wasInactive = dbSub.status !== 'ACTIVE';

  // Reset flags on new active cycle
  if (newStatus === 'ACTIVE') {
    cancelAtPeriodEnd = false;
  }

  await prisma.partner_subscriptions.update({
    where: { id: dbSub.id },
    data: {
      status: newStatus,
      razorpay_customer_id: subEntity.customer_id || dbSub.razorpay_customer_id,
      current_period_start: periodStart || now,
      current_period_end: periodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      expiration_email_sent: newStatus === 'ACTIVE' ? false : dbSub.expiration_email_sent,
      cancellation_email_sent: newStatus === 'ACTIVE' ? false : dbSub.cancellation_email_sent,
      updated_at: now
    }
  });

  console.log(`[Subscription Webhook] Updated DB Subscription ${dbSub.id} -> Status: ${newStatus}`);

  const emailService = require('../utils/emailService');

  // Fetch complete details including user roles and business relationships
  let fullSub = null;
  try {
    fullSub = await prisma.partner_subscriptions.findUnique({
      where: { id: dbSub.id },
      include: {
        users: {
          include: {
            roles: true,
            cafes: { select: { id: true, name: true } },
            event_management_profiles: { select: { id: true, company_name: true } }
          }
        },
        subscription_plans: true
      }
    });
  } catch (fetchErr) {
    console.error('[Subscription Webhook Fetch Error]:', fetchErr.message);
  }

  if (fullSub && fullSub.users) {
    const partnerInfo = resolvePartnerDetails(fullSub.users, fullSub.business_type);
    const planName = fullSub.subscription_plans?.name || (
      partnerInfo.businessType === 'RESTAURANT' ? 'FAHARA RESTAURANT PARTNER' :
      partnerInfo.businessType === 'EVENT_MANAGER' ? 'FAHARA EVENT PARTNER' : 'FAHARA CAFE PARTNER'
    );
    const configuredPrice = fullSub.subscription_plans?.price ? Number(fullSub.subscription_plans.price) : (
      partnerInfo.businessType === 'RESTAURANT' ? 149 : 299
    );
    // Amount paid from verified webhook entity if available, else plan price
    const amountPaid = subEntity.amount ? Number(subEntity.amount) / 100 : configuredPrice;
    const paymentRef = subEntity.payment_id || subEntity.id || `RZP_PAY_${Date.now()}`;
    const nextBillDateStr = periodEnd ? new Date(periodEnd).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : null;
    const paymentDateStr = new Date(periodStart || now).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

    // 1. Send Payment Successful Email to Partner upon verified payment/activation
    const isPaymentEvent = ['subscription.authenticated', 'subscription.activated', 'subscription.charged', 'payment.captured'].includes(event);
    if (newStatus === 'ACTIVE' && (wasInactive || isPaymentEvent)) {
      try {
        await emailService.sendPartnerSubscriptionPaymentSuccessEmail({
          userId: fullSub.user_id,
          subscriptionId: fullSub.id,
          email: partnerInfo.email,
          partnerName: partnerInfo.partnerName,
          businessName: partnerInfo.businessName,
          partnerType: partnerInfo.partnerType,
          planName,
          amountPaid,
          paymentDate: paymentDateStr,
          subscriptionStatus: 'ACTIVE',
          nextBillingDate: nextBillDateStr,
          paymentReference: paymentRef,
          subscriptionReference: razorpaySubId,
          dashboardUrl: partnerInfo.dashboardUrl,
          eventKey: `SUB_SUCCESS_${fullSub.id}_${paymentRef}`
        });

        // Also notify Fahara Admin (non-blocking)
        await emailService.sendNewSubscriptionNotificationToAdmin({
          partnerName: partnerInfo.businessName,
          ownerName: partnerInfo.partnerName,
          email: partnerInfo.email,
          phone: partnerInfo.phone,
          partnerType: fullSub.business_type || 'CAFE',
          planName,
          price: amountPaid,
          razorpaySubscriptionId: razorpaySubId,
          activatedAt: now
        });
        console.log(`[Subscription Webhook Email] Sent payment success confirmation email to partner ${partnerInfo.email}`);
      } catch (payEmailErr) {
        console.error('[Subscription Webhook Payment Email Error]:', payEmailErr.message);
      }
    }

    // 2. Send Partner Subscription Cancellation Email (Idempotent)
    if ((event === 'subscription.cancelled' || cancelAtPeriodEnd) && !dbSub.cancellation_email_sent) {
      try {
        const isImmediate = newStatus === 'CANCELLED';
        const accessEndDateStr = periodEnd ? new Date(periodEnd).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'End of billing period';
        const cancelDateStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

        const cancellationMsg = isImmediate
          ? 'Your subscription has been cancelled immediately according to verified account status.'
          : `Your subscription is scheduled to end at the end of the current billing period. Your eligible partner access will continue until ${accessEndDateStr}.`;

        await emailService.sendPartnerSubscriptionCancellationEmail({
          userId: fullSub.user_id,
          subscriptionId: fullSub.id,
          email: partnerInfo.email,
          partnerName: partnerInfo.partnerName,
          businessName: partnerInfo.businessName,
          partnerType: partnerInfo.partnerType,
          planName,
          monthlyAmount: configuredPrice,
          cancellationDate: cancelDateStr,
          accessEndDate: accessEndDateStr,
          subscriptionStatus: newStatus,
          cancellationMessage: cancellationMsg,
          subscriptionPageUrl: partnerInfo.subscriptionPageUrl,
          subscriptionReference: razorpaySubId,
          eventKey: `SUB_CANCEL_${fullSub.id}_${cancelDateStr}`
        });

        // Also notify Fahara Admin
        await emailService.sendSubscriptionCancelledAdminEmail({
          partnerName: partnerInfo.businessName,
          ownerName: partnerInfo.partnerName,
          email: partnerInfo.email,
          phone: partnerInfo.phone,
          partnerType: fullSub.business_type || 'CAFE',
          planName,
          price: configuredPrice,
          status: newStatus,
          cancelAtPeriodEnd: true,
          periodStart: periodStart || dbSub.current_period_start,
          periodEnd: periodEnd || dbSub.current_period_end,
          razorpaySubscriptionId: razorpaySubId,
          cancelledAt: now
        });

        await prisma.partner_subscriptions.update({
          where: { id: dbSub.id },
          data: {
            cancellation_email_sent: true,
            cancellation_email_sent_at: now
          }
        });
        console.log(`[Subscription Webhook Email] Sent cancellation update email to partner ${partnerInfo.email}`);
      } catch (cancelEmailErr) {
        console.error('[Subscription Cancellation Email Error]:', cancelEmailErr.message);
      }
    }

    // 3. Send Partner Expiration / Renewal Reminder Email (Idempotent)
    if (newStatus === 'EXPIRED' && !dbSub.expiration_email_sent) {
      try {
        const expiryDateStr = (periodEnd || now).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

        await emailService.sendPartnerSubscriptionExpiredEmail({
          userId: fullSub.user_id,
          subscriptionId: fullSub.id,
          email: partnerInfo.email,
          partnerName: partnerInfo.partnerName,
          businessName: partnerInfo.businessName,
          partnerType: partnerInfo.partnerType,
          planName,
          monthlyAmount: configuredPrice,
          expiryDate: expiryDateStr,
          subscriptionStatus: 'EXPIRED',
          renewalUrl: partnerInfo.subscriptionPageUrl,
          subscriptionReference: razorpaySubId,
          eventKey: `SUB_EXPIRED_${fullSub.id}_${expiryDateStr}`
        });

        await prisma.partner_subscriptions.update({
          where: { id: dbSub.id },
          data: {
            expiration_email_sent: true,
            expiration_email_sent_at: now
          }
        });
        console.log(`[Subscription Expiration Email] Sent renewal email to partner ${partnerInfo.email}`);
      } catch (expireEmailErr) {
        console.error('[Subscription Expiration Email Error]:', expireEmailErr.message);
      }
    }
  }

  return { status: 200, message: `Subscription status updated to ${newStatus}` };
};

/**
 * Cancels renewal for subscription.
 */
const cancelSubscription = async (userId) => {
  const dbSub = await prisma.partner_subscriptions.findFirst({
    where: { user_id: userId },
    include: {
      users: {
        include: {
          cafes: { select: { name: true } },
          event_management_profiles: { select: { company_name: true } }
        }
      },
      subscription_plans: true
    }
  });

  if (!dbSub || !dbSub.razorpay_subscription_id) {
    const error = new Error('No active subscription found to cancel.');
    error.statusCode = 404;
    throw error;
  }

  const razorpay = getRazorpayInstance();
  if (razorpay) {
    try {
      await razorpay.subscriptions.cancel(dbSub.razorpay_subscription_id, true);
    } catch (e) {
      console.warn('[SubscriptionService] Razorpay cancellation warning:', e.message);
    }
  }

  const now = new Date();
  const updatedSub = await prisma.partner_subscriptions.update({
    where: { id: dbSub.id },
    data: {
      cancel_at_period_end: true,
      updated_at: now
    }
  });

  // Trigger Partner & Admin Cancellation Email if not already sent (Idempotent)
  if (!dbSub.cancellation_email_sent) {
    try {
      const emailService = require('../utils/emailService');
      const partnerInfo = resolvePartnerDetails(dbSub.users, dbSub.business_type);
      const configuredPrice = dbSub.subscription_plans?.price ? Number(dbSub.subscription_plans.price) : (
        partnerInfo.businessType === 'RESTAURANT' ? 149 : 299
      );
      const planName = dbSub.subscription_plans?.name || (
        partnerInfo.businessType === 'RESTAURANT' ? 'FAHARA RESTAURANT PARTNER' :
        partnerInfo.businessType === 'EVENT_MANAGER' ? 'FAHARA EVENT PARTNER' : 'FAHARA CAFE PARTNER'
      );
      const cancelDateStr = now.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
      const accessEndDateStr = dbSub.current_period_end
        ? new Date(dbSub.current_period_end).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
        : 'End of current billing period';

      const cancellationMsg = `Your subscription cancellation request has been recorded. Your eligible partner access will continue uninterrupted until ${accessEndDateStr}.`;

      // 1. Send Partner Cancellation Email
      await emailService.sendPartnerSubscriptionCancellationEmail({
        userId: dbSub.user_id,
        subscriptionId: dbSub.id,
        email: partnerInfo.email,
        partnerName: partnerInfo.partnerName,
        businessName: partnerInfo.businessName,
        partnerType: partnerInfo.partnerType,
        planName,
        monthlyAmount: configuredPrice,
        cancellationDate: cancelDateStr,
        accessEndDate: accessEndDateStr,
        subscriptionStatus: dbSub.status || 'ACTIVE',
        cancellationMessage: cancellationMsg,
        subscriptionPageUrl: partnerInfo.subscriptionPageUrl,
        subscriptionReference: dbSub.razorpay_subscription_id,
        eventKey: `SUB_CANCEL_${dbSub.id}_${cancelDateStr}`
      });

      // 2. Send Admin Notification Email
      await emailService.sendSubscriptionCancelledAdminEmail({
        partnerName: partnerInfo.businessName,
        ownerName: partnerInfo.partnerName,
        email: partnerInfo.email,
        phone: partnerInfo.phone,
        partnerType: dbSub.business_type || 'CAFE',
        planName,
        price: configuredPrice,
        status: dbSub.status,
        cancelAtPeriodEnd: true,
        periodStart: dbSub.current_period_start,
        periodEnd: dbSub.current_period_end,
        razorpaySubscriptionId: dbSub.razorpay_subscription_id,
        cancelledAt: now
      });

      await prisma.partner_subscriptions.update({
        where: { id: dbSub.id },
        data: {
          cancellation_email_sent: true,
          cancellation_email_sent_at: now
        }
      });
      console.log(`[Cancel Subscription Email] Sent cancellation notification email to partner ${partnerInfo.email} and Fahara Admin`);
    } catch (emailErr) {
      console.error('[Cancel Subscription Email Error]:', emailErr.message);
    }
  }

  return {
    success: true,
    message: 'Subscription renewal has been cancelled. Access will remain active until the end of the billing period.',
    currentPeriodEnd: dbSub.current_period_end
  };
};

/**
 * Re-enables / resumes auto-renewal for a cancelled subscription before period end.
 */
const reactivateSubscription = async (userId) => {
  const dbSub = await prisma.partner_subscriptions.findFirst({
    where: { user_id: userId },
    include: {
      users: true,
      subscription_plans: true
    }
  });

  if (!dbSub) {
    const error = new Error('No subscription found.');
    error.statusCode = 404;
    throw error;
  }

  // If Razorpay subscription exists, attempt to resume if paused/pending
  const razorpay = getRazorpayInstance();
  if (razorpay && dbSub.razorpay_subscription_id && dbSub.razorpay_subscription_id.startsWith('sub_')) {
    try {
      await razorpay.subscriptions.resume(dbSub.razorpay_subscription_id);
    } catch (e) {
      console.warn('[SubscriptionService] Razorpay resume notice (may not be supported or already active):', e.message);
    }
  }

  const now = new Date();
  const updatedSub = await prisma.partner_subscriptions.update({
    where: { id: dbSub.id },
    data: {
      cancel_at_period_end: false,
      cancellation_email_sent: false,
      status: 'ACTIVE',
      updated_at: now
    }
  });

  return {
    success: true,
    message: 'Auto-renewal has been successfully reactivated.',
    subscription: {
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: dbSub.current_period_end
    }
  };
};

/**
 * Cron / Periodic checker: Scans for subscriptions whose paid period has ended.
 * Updates status = EXPIRED and sends partner renewal email (idempotent).
 */
const checkAndProcessExpiredSubscriptions = async () => {
  const now = new Date();
  
  const expiredSubs = await prisma.partner_subscriptions.findMany({
    where: {
      OR: [
        { status: 'ACTIVE', current_period_end: { lte: now } },
        { status: 'EXPIRED', expiration_email_sent: { not: true } }
      ]
    },
    include: {
      users: {
        include: {
          cafes: { select: { name: true } },
          event_management_profiles: { select: { company_name: true } }
        }
      },
      subscription_plans: true
    }
  });

  if (!expiredSubs || expiredSubs.length === 0) return;

  const emailService = require('../utils/emailService');

  for (const sub of expiredSubs) {
    try {
      // 1. Guard against subscriptions that have renewed or whose current period is still in the future
      if (sub.current_period_end && new Date(sub.current_period_end) > now) {
        continue;
      }

      await prisma.partner_subscriptions.update({
        where: { id: sub.id },
        data: {
          status: 'EXPIRED',
          updated_at: now
        }
      });

      if (!sub.expiration_email_sent && sub.users?.email) {
        const partnerInfo = resolvePartnerDetails(sub.users, sub.business_type);
        const configuredPrice = sub.subscription_plans?.price ? Number(sub.subscription_plans.price) : (
          partnerInfo.businessType === 'RESTAURANT' ? 149 : 299
        );
        const planName = sub.subscription_plans?.name || (
          partnerInfo.businessType === 'RESTAURANT' ? 'FAHARA RESTAURANT PARTNER' :
          partnerInfo.businessType === 'EVENT_MANAGER' ? 'FAHARA EVENT PARTNER' : 'FAHARA CAFE PARTNER'
        );
        const expiryDateStr = (sub.current_period_end || now).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

        await emailService.sendPartnerSubscriptionExpiredEmail({
          userId: sub.user_id,
          subscriptionId: sub.id,
          email: partnerInfo.email,
          partnerName: partnerInfo.partnerName,
          businessName: partnerInfo.businessName,
          partnerType: partnerInfo.partnerType,
          planName,
          monthlyAmount: configuredPrice,
          expiryDate: expiryDateStr,
          subscriptionStatus: 'EXPIRED',
          renewalUrl: partnerInfo.subscriptionPageUrl,
          subscriptionReference: sub.razorpay_subscription_id,
          eventKey: `SUB_EXPIRED_${sub.id}_${expiryDateStr}`
        });

        await prisma.partner_subscriptions.update({
          where: { id: sub.id },
          data: {
            expiration_email_sent: true,
            expiration_email_sent_at: now
          }
        });

        console.log(`[Expiration Checker] Marked subscription ${sub.id} EXPIRED and sent renewal email to ${partnerInfo.email}`);
      }
    } catch (err) {
      console.error(`[Expiration Checker Error] Failed for sub ${sub.id}:`, err.message);
    }
  }
};

/**
 * Returns list of subscriptions for Admin portal with filtering.
 */
const getAdminSubscriptions = async (filters = {}) => {
  const { status, businessType } = filters;
  
  const where = {};
  if (status && status !== 'ALL') {
    where.status = status;
  }
  if (businessType && businessType !== 'ALL') {
    where.business_type = businessType;
  }

  const subscriptions = await prisma.partner_subscriptions.findMany({
    where,
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          business_name: true,
          cafes: { select: { id: true, name: true, city: true } },
          event_management_profiles: { select: { id: true, company_name: true, city: true } }
        }
      },
      subscription_plans: true
    },
    orderBy: { created_at: 'desc' }
  });

  const now = new Date();

  return subscriptions.map(sub => {
    const isPeriodActive = sub.current_period_end ? new Date(sub.current_period_end) > now : false;
    const computedStatus = sub.status === 'ACTIVE' && !isPeriodActive ? 'EXPIRED' : sub.status;
    
    let businessName = sub.users?.business_name;
    if (!businessName) {
      if (sub.business_type === 'EVENT_MANAGER') {
        businessName = sub.users?.event_management_profiles?.[0]?.company_name || 'Event Management Partner';
      } else {
        businessName = sub.users?.cafes?.[0]?.name || 'Venue Partner';
      }
    }

    const defaultPlanName = sub.business_type === 'EVENT_MANAGER' ? 'FAHARA EVENT PARTNER' :
      sub.business_type === 'RESTAURANT' ? 'FAHARA RESTAURANT PARTNER' : 'FAHARA CAFE PARTNER';

    const defaultAmount = sub.business_type === 'RESTAURANT' ? 149 : 299;

    return {
      id: sub.id,
      businessName,
      businessType: sub.business_type || 'CAFE',
      ownerName: sub.users?.name || 'Partner',
      ownerEmail: sub.users?.email || '',
      ownerPhone: sub.users?.phone || '',
      planName: sub.subscription_plans?.name || defaultPlanName,
      amount: sub.subscription_plans?.price ? Number(sub.subscription_plans.price) : defaultAmount,
      status: computedStatus,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      razorpaySubscriptionId: sub.razorpay_subscription_id,
      createdAt: sub.created_at
    };
  });

};

module.exports = {
  getOrCreatePlan,
  getRazorpayPlanId,
  getSubscriptionStatus,
  createSubscription,
  syncRazorpaySubscriptionEvent,
  cancelSubscription,
  reactivateSubscription,
  checkAndProcessExpiredSubscriptions,
  getAdminSubscriptions,
  resolvePartnerDetails
};
