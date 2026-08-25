const reviewService = require('../services/reviewService');

const addReview = async (req, res, next) => {
  try {
    const review = await reviewService.addReview(req.user.id, req.body);
    res.status(201).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
};

const getCafeReviews = async (req, res, next) => {
  try {
    const data = await reviewService.getCafeReviews(req.params.cafeId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getEventServiceReviews = async (req, res, next) => {
  try {
    const data = await reviewService.getEventServiceReviews(req.params.serviceId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const result = await reviewService.deleteReview(req.user.id, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getOwnerReviews = async (req, res, next) => {
  try {
    const data = await reviewService.getOwnerReviews(req.user.id, req.query);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const getOwnerReviewAnalytics = async (req, res, next) => {
  try {
    const data = await reviewService.getOwnerReviewAnalytics(req.user.id);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const getOwnerReviewSummary = async (req, res, next) => {
  try {
    const data = await reviewService.getOwnerReviewSummary(req.user.id);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const replyToReview = async (req, res, next) => {
  try {
    const { reply } = req.body;
    const result = await reviewService.replyToReview(req.user.id, req.params.id, reply);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const updateReply = async (req, res, next) => {
  try {
    const { reply } = req.body;
    const result = await reviewService.updateReply(req.user.id, req.params.id, reply);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const deleteReply = async (req, res, next) => {
  try {
    const result = await reviewService.deleteReply(req.user.id, req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getReviewById = async (req, res, next) => {
  try {
    const data = await reviewService.getReviewById(req.params.id);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const getAdminReviews = async (req, res, next) => {
  try {
    const data = await reviewService.getAdminReviews(req.query);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const moderateReview = async (req, res, next) => {
  try {
    const { action } = req.body;
    const result = await reviewService.moderateReview(req.user.id, req.params.id, action);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addReview,
  getCafeReviews,
  getEventServiceReviews,
  deleteReview,
  getOwnerReviews,
  getOwnerReviewAnalytics,
  getOwnerReviewSummary,
  replyToReview,
  updateReply,
  deleteReply,
  getReviewById,
  getAdminReviews,
  moderateReview
};
