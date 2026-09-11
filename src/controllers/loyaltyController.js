const loyaltyService = require('../services/loyaltyService');

const getAccountSummary = async (req, res, next) => {
  try {
    const summary = await loyaltyService.getAccountSummary(req.user.id);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const data = await loyaltyService.getTransactions(req.user.id, req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getRedemptions = async (req, res, next) => {
  try {
    const data = await loyaltyService.getRedemptions(req.user.id, req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const redeemCredits = async (req, res, next) => {
  try {
    const { credits } = req.body;
    const result = await loyaltyService.redeemCredits(req.user.id, credits);
    res.status(200).json({
      success: true,
      message: `Successfully redeemed ${credits} Fahara Credits for ₹${result.rupeeValue}!`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const adminAdjustCredits = async (req, res, next) => {
  try {
    const { user_id, credits, type, reason } = req.body;
    const result = await loyaltyService.adminAdjustCredits(req.user.id, user_id, credits, type, reason);
    res.status(200).json({
      success: true,
      message: 'Loyalty credits adjusted successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

const adminSuspendAccount = async (req, res, next) => {
  try {
    const { user_id, status, reason } = req.body;
    const result = await loyaltyService.adminSuspendAccount(req.user.id, user_id, status, reason);
    res.status(200).json({
      success: true,
      message: `Loyalty account status updated to ${result.status}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAccountSummary,
  getTransactions,
  getRedemptions,
  redeemCredits,
  adminAdjustCredits,
  adminSuspendAccount
};
