const adminSubscriptionService = require('../services/adminSubscriptionService');

/**
 * GET /api/v1/admin/subscriptions/overview
 */
const getOverview = async (req, res) => {
  try {
    const data = await adminSubscriptionService.getOverviewMetrics();
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Overview Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch subscription overview'
    });
  }
};

/**
 * GET /api/v1/admin/subscriptions/plans
 */
const getPlans = async (req, res) => {
  try {
    const data = await adminSubscriptionService.getSubscriptionPlans();
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Get Plans Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch subscription plans'
    });
  }
};

/**
 * GET /api/v1/admin/subscriptions/plans/:id
 */
const getPlanById = async (req, res) => {
  try {
    const data = await adminSubscriptionService.getSubscriptionPlanById(req.params.id);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Get Plan Detail Error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch plan detail'
    });
  }
};

/**
 * POST /api/v1/admin/subscriptions/plans
 */
const createPlan = async (req, res) => {
  try {
    const data = await adminSubscriptionService.createSubscriptionPlan(req.body, req.user);
    return res.status(201).json({
      success: true,
      message: 'Subscription plan created successfully.',
      data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Create Plan Error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create subscription plan'
    });
  }
};

/**
 * PATCH /api/v1/admin/subscriptions/plans/:id
 */
const updatePlan = async (req, res) => {
  try {
    const data = await adminSubscriptionService.updateSubscriptionPlan(req.params.id, req.body, req.user);
    return res.status(200).json({
      success: true,
      message: 'Subscription plan updated successfully.',
      data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Update Plan Error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update subscription plan'
    });
  }
};

/**
 * PATCH /api/v1/admin/subscriptions/plans/:id/status
 */
const togglePlanStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const data = await adminSubscriptionService.togglePlanStatus(req.params.id, isActive, req.user);
    return res.status(200).json({
      success: true,
      message: `Plan ${isActive ? 'activated' : 'deactivated'} successfully.`,
      data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Toggle Plan Status Error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to toggle plan status'
    });
  }
};

/**
 * GET /api/v1/admin/subscriptions (List all subscriptions with server-side pagination & filters)
 */
const getSubscriptionsList = async (req, res) => {
  try {
    const data = await adminSubscriptionService.getSubscriptionsList(req.query);
    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Get Subscriptions List Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch subscriptions'
    });
  }
};

/**
 * GET /api/v1/admin/subscriptions/cafes
 */
const getCafeSubscriptions = async (req, res) => {
  try {
    const query = { ...req.query, partnerType: 'CAFE' };
    const data = await adminSubscriptionService.getSubscriptionsList(query);
    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Get Cafe Subscriptions Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch cafe subscriptions'
    });
  }
};

/**
 * GET /api/v1/admin/subscriptions/restaurants
 */
const getRestaurantSubscriptions = async (req, res) => {
  try {
    const query = { ...req.query, partnerType: 'RESTAURANT' };
    const data = await adminSubscriptionService.getSubscriptionsList(query);
    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Get Restaurant Subscriptions Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch restaurant subscriptions'
    });
  }
};

/**
 * GET /api/v1/admin/subscriptions/event-managers
 */
const getEventManagerSubscriptions = async (req, res) => {
  try {
    const query = { ...req.query, partnerType: 'EVENT_MANAGER' };
    const data = await adminSubscriptionService.getSubscriptionsList(query);
    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Get Event Manager Subscriptions Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch event manager subscriptions'
    });
  }
};

/**
 * GET /api/v1/admin/subscriptions/payments
 */
const getSubscriptionPayments = async (req, res) => {
  try {
    const data = await adminSubscriptionService.getSubscriptionPaymentHistory(req.query);
    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Get Subscription Payments Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch subscription payments'
    });
  }
};

/**
 * GET /api/v1/admin/subscriptions/:id
 */
const getSubscriptionDetail = async (req, res) => {
  try {
    const data = await adminSubscriptionService.getSubscriptionDetailById(req.params.id);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Get Subscription Detail Error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch subscription detail'
    });
  }
};

/**
 * PATCH /api/v1/admin/subscriptions/:id/cancel
 */
const cancelSubscription = async (req, res) => {
  try {
    const { reason } = req.body;
    const data = await adminSubscriptionService.cancelPartnerSubscription(req.params.id, reason, req.user);
    return res.status(200).json({
      success: true,
      message: 'Partner subscription cancelled successfully.',
      data
    });
  } catch (error) {
    console.error('[AdminSubscriptionController] Cancel Subscription Error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to cancel partner subscription'
    });
  }
};

module.exports = {
  getOverview,
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  togglePlanStatus,
  getSubscriptionsList,
  getCafeSubscriptions,
  getRestaurantSubscriptions,
  getEventManagerSubscriptions,
  getSubscriptionPayments,
  getSubscriptionDetail,
  cancelSubscription
};
