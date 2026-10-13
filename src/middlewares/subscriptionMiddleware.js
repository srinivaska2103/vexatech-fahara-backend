const subscriptionService = require('../services/subscriptionService');

/**
 * Middleware requiring an active Fahara Partner subscription for Cafe, Restaurant & Event Managers.
 */
const requireActivePartnerSubscription = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  const userRole = req.user.roles?.name || req.user.role;

  // Admin and Customer are not subject to partner subscriptions
  const isSubjectRole = ['CAFE_OWNER', 'RESTAURANT_OWNER', 'WALKING_CAFE_OWNER', 'EVENT_MANAGER'].includes(userRole);
  if (!isSubjectRole) {
    return next();
  }

  try {
    const subStatus = await subscriptionService.getSubscriptionStatus(req.user.id);

    if (!subStatus.isActive) {
      const planMsg = userRole === 'EVENT_MANAGER' 
        ? 'An active Fahara Event Partner subscription is required to access this feature.'
        : 'An active Fahara Partner subscription is required to access this feature.';

      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: planMsg
      });
    }

    // Role-subscription alignment check
    const subBusinessType = subStatus.subscription?.businessType || subStatus.businessType;
    if (userRole === 'EVENT_MANAGER' && subBusinessType !== 'EVENT_MANAGER') {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_MISMATCH',
        message: 'An active Fahara Event Partner subscription is required.'
      });
    }
    if ((userRole === 'CAFE_OWNER' || userRole === 'WALKING_CAFE_OWNER') && subBusinessType === 'RESTAURANT') {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_MISMATCH',
        message: 'A Fahara Cafe Partner subscription is required to access cafe management features.'
      });
    }
    if (userRole === 'RESTAURANT_OWNER' && subBusinessType === 'EVENT_MANAGER') {
      return res.status(403).json({
        success: false,
        code: 'SUBSCRIPTION_MISMATCH',
        message: 'A Fahara Restaurant Partner subscription is required.'
      });
    }

    req.subscription = subStatus.subscription;
    next();
  } catch (error) {
    console.error('[SubscriptionMiddleware] Error checking subscription:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify partner subscription status.'
    });
  }
};

module.exports = {
  requireActivePartnerSubscription
};
