const subscriptionService = require('../services/subscriptionService');
const { verifyPaymentSignature } = require('../config/razorpay');

/**
 * Get current user's subscription status.
 * GET /api/v1/subscriptions/status
 */
const getStatus = async (req, res) => {
  try {
    const result = await subscriptionService.getSubscriptionStatus(req.user.id);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get Subscription Status Error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch subscription status'
    });
  }
};

/**
 * Create a new Razorpay subscription for Event Managers (₹299/month).
 * POST /api/v1/event-manager/subscription/create
 */
const createEventManagerSubscription = async (req, res) => {
  try {
    const userRole = req.user?.roles?.name || req.user?.role;
    if (userRole !== 'EVENT_MANAGER') {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_NOT_ALLOWED',
        message: 'Subscription is available only for Event Managers.'
      });
    }

    const result = await subscriptionService.createSubscription(req.user, 'EVENT_MANAGER');
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Create Event Manager Subscription Error:', error.message);
    if (error.code === 'SUBSCRIPTION_NOT_ALLOWED') {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_NOT_ALLOWED',
        message: 'Subscription is available only for Event Managers.'
      });
    }
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create Event Manager subscription'
    });
  }
};

/**
 * Verify subscription payment return from Razorpay frontend.
 * POST /api/v1/subscriptions/verify
 */
const verifySubscription = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_subscription_id, razorpay_signature } = req.body;

    if (!razorpay_payment_id || (!razorpay_order_id && !razorpay_subscription_id) || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing Razorpay signature verification parameters.'
      });
    }

    const crypto = require('crypto');
    const secret = process.env.RAZORPAY_KEY_SECRET;

    let isValid = false;
    if (razorpay_order_id) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      isValid = crypto.timingSafeEqual(
        Buffer.from(razorpay_signature),
        Buffer.from(expectedSignature)
      );
    } else if (razorpay_subscription_id) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
        .digest('hex');

      isValid = crypto.timingSafeEqual(
        Buffer.from(razorpay_signature),
        Buffer.from(expectedSignature)
      );
    }

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Razorpay payment signature.'
      });
    }

    // Instantly mark subscription active in DB upon valid signature for 30 days
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const prisma = require('../config/prisma');
    const dbSub = await prisma.partner_subscriptions.findFirst({
      where: { user_id: req.user.id }
    });

    const wasInactive = !dbSub || dbSub.status !== 'ACTIVE';

    const userRole = req.user.roles?.name || req.user.role;
    let bType = 'CAFE';
    let pName = 'FAHARA CAFE PARTNER';
    let pPrice = 299.00;

    if (userRole === 'RESTAURANT_OWNER') {
      bType = 'RESTAURANT';
      pName = 'FAHARA RESTAURANT PARTNER';
      pPrice = 149.00;
    } else if (userRole === 'EVENT_MANAGER') {
      bType = 'EVENT_MANAGER';
      pName = 'FAHARA EVENT PARTNER';
      pPrice = 299.00;
    }

    const currentPlan = await subscriptionService.getOrCreatePlan(pName, pPrice, bType);

    if (dbSub) {
      await prisma.partner_subscriptions.update({
        where: { id: dbSub.id },
        data: {
          status: 'ACTIVE',
          plan_id: currentPlan.id,
          business_type: bType,
          razorpay_subscription_id: razorpay_subscription_id || razorpay_order_id || dbSub.razorpay_subscription_id,
          current_period_start: new Date(),
          current_period_end: thirtyDaysLater,
          updated_at: new Date()
        }
      });
    } else {
      await prisma.partner_subscriptions.create({
        data: {
          user_id: req.user.id,
          business_type: bType,
          plan_id: currentPlan.id,
          razorpay_subscription_id: razorpay_subscription_id || razorpay_order_id,
          status: 'ACTIVE',
          current_period_start: new Date(),
          current_period_end: thirtyDaysLater
        }
      });
    }

    // Trigger Partner & Admin Email Notification ONLY after HMAC signature is verified
    if (wasInactive) {
      try {
        const emailService = require('../utils/emailService');
        const user = req.user;
        const fullUser = await prisma.users.findUnique({
          where: { id: user.id },
          include: {
            roles: true,
            cafes: { select: { id: true, name: true } },
            event_management_profiles: { select: { id: true, company_name: true } }
          }
        });

        const partnerInfo = subscriptionService.resolvePartnerDetails(fullUser || user, bType);
        const subRecord = await prisma.partner_subscriptions.findFirst({
          where: { user_id: user.id }
        });

        const paymentRef = razorpay_payment_id || `PAY_${Date.now()}`;
        const subRef = razorpay_subscription_id || razorpay_order_id || subRecord?.razorpay_subscription_id || 'N/A';
        const nextBillDateStr = thirtyDaysLater.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
        const paymentDateStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

        // 1. Send confirmation email to Partner (Idempotent by eventKey)
        await emailService.sendPartnerSubscriptionPaymentSuccessEmail({
          userId: user.id,
          subscriptionId: subRecord?.id || 'SUB_ID',
          email: partnerInfo.email,
          partnerName: partnerInfo.partnerName,
          businessName: partnerInfo.businessName,
          partnerType: partnerInfo.partnerType,
          planName: pName,
          amountPaid: pPrice,
          paymentDate: paymentDateStr,
          subscriptionStatus: 'ACTIVE',
          nextBillingDate: nextBillDateStr,
          paymentReference: paymentRef,
          subscriptionReference: subRef,
          dashboardUrl: partnerInfo.dashboardUrl,
          eventKey: `SUB_SUCCESS_${subRecord?.id || user.id}_${paymentRef}`
        });

        // 2. Send notification to Fahara Admin
        await emailService.sendNewSubscriptionNotificationToAdmin({
          partnerName: partnerInfo.businessName,
          ownerName: partnerInfo.partnerName,
          email: partnerInfo.email,
          phone: partnerInfo.phone,
          partnerType: bType,
          planName: pName,
          price: pPrice,
          razorpaySubscriptionId: subRef,
          activatedAt: new Date()
        });

        console.log(`[Verify Subscription Email] Sent partner payment confirmation email to ${partnerInfo.email} and Fahara Admin for ${partnerInfo.businessName}`);
      } catch (emailErr) {
        console.error('[Verify Subscription Email Error]:', emailErr.message);
      }
    }


    const statusObj = await subscriptionService.getSubscriptionStatus(req.user.id);

    return res.status(200).json({
      success: true,
      message: 'Subscription payment verified successfully.',
      data: statusObj
    });
  } catch (error) {
    console.error('Verify Subscription Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Verification failed.'
    });
  }
};

/**
 * Cancel renewal of partner subscription.
 * POST /api/v1/subscriptions/cancel
 */
const cancelSubscription = async (req, res) => {
  try {
    const result = await subscriptionService.cancelSubscription(req.user.id);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Cancel Subscription Error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to cancel subscription'
    });
  }
};

/**
 * Re-enable auto-renewal for partner subscription.
 * POST /api/v1/subscriptions/reactivate
 */
const reactivateSubscription = async (req, res) => {
  try {
    const result = await subscriptionService.reactivateSubscription(req.user.id);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Reactivate Subscription Error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to reactivate subscription'
    });
  }
};

/**
 * Admin view: List all subscriptions with filters.
 * GET /api/v1/subscriptions/admin/list
 */
const getAdminSubscriptions = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      businessType: req.query.businessType
    };
    const list = await subscriptionService.getAdminSubscriptions(filters);
    return res.status(200).json({
      success: true,
      data: list
    });
  } catch (error) {
    console.error('Admin Subscriptions Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch admin subscriptions'
    });
  }
};

/**
 * Create a new Razorpay subscription for Cafe & Restaurant Owners.
 * POST /api/v1/subscriptions/create
 */
const createSubscription = async (req, res) => {
  try {
    const result = await subscriptionService.createSubscription(req.user);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Create Subscription Error:', error.message);
    if (error.code === 'SUBSCRIPTION_NOT_ALLOWED') {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_NOT_ALLOWED',
        message: error.message
      });
    }
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create subscription'
    });
  }
};

/**
 * Get all available partner plans with pricing and features
 * GET /api/v1/subscriptions/plans
 */
const getPlans = async (req, res) => {
  try {
    const cafePlan = await subscriptionService.getOrCreatePlan('FAHARA CAFE PARTNER', 299.00, 'CAFE');
    const restaurantPlan = await subscriptionService.getOrCreatePlan('FAHARA RESTAURANT PARTNER', 149.00, 'RESTAURANT');
    const eventManagerPlan = await subscriptionService.getOrCreatePlan('FAHARA EVENT PARTNER', 299.00, 'EVENT_MANAGER');

    return res.status(200).json({
      success: true,
      data: [
        {
          id: cafePlan.id,
          role: 'CAFE_OWNER',
          partnerType: 'Cafe Owner',
          planName: cafePlan.name,
          price: 299,
          billingCycle: 'MONTHLY',
          description: 'Grow footfall and take online table & package bookings for your cafe.',
          features: [
            'Business profile and location',
            'Photos and gallery',
            'Customer discovery',
            'Booking and availability management',
            'Custom event packages and inclusions',
            'Deals and offers',
            'Reviews and ratings',
            'Business analytics'
          ]
        },
        {
          id: restaurantPlan.id,
          role: 'RESTAURANT_OWNER',
          partnerType: 'Restaurant Owner',
          planName: restaurantPlan.name,
          price: 149,
          billingCycle: 'MONTHLY',
          description: 'Connect with diners and manage tables, menu & bookings effortlessly.',
          features: [
            'Restaurant profile and location',
            'Photos and business information',
            'Customer discovery',
            'Menu display',
            'Booking management',
            'Offers and promotions',
            'Reviews and ratings',
            'Business insights'
          ]
        },
        {
          id: eventManagerPlan.id,
          role: 'EVENT_MANAGER',
          partnerType: 'Event Manager',
          planName: eventManagerPlan.name,
          price: 299,
          billingCycle: 'MONTHLY',
          description: 'Showcase your services and receive direct client event inquiries & packages.',
          features: [
            'Event Manager profile',
            'Custom event services',
            'User-created packages and inclusions',
            'Service pricing and availability',
            'Customer enquiries and bookings',
            'Reviews and ratings',
            'Business insights'
          ]
        }
      ]
    });
  } catch (error) {
    console.error('Get Plans Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans'
    });
  }
};

module.exports = {
  getStatus,
  getPlans,
  createSubscription,
  createEventManagerSubscription,
  verifySubscription,
  cancelSubscription,
  reactivateSubscription,
  getAdminSubscriptions
};

