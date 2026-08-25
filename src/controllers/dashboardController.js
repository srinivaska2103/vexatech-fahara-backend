const dashboardService = require('../services/dashboardService');

const getSummary = async (req, res, next) => {
  try {
    const summary = await dashboardService.getSummary(req.user.id, req.user.roles?.name);
    res.status(200).json({ data: summary });
  } catch (error) {
    next(error);
  }
};

const getRevenueStats = async (req, res, next) => {
  try {
    const { period } = req.query;
    const stats = await dashboardService.getRevenueStats(req.user.id, period, req.user.roles?.name);
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
};

const getRecentBookings = async (req, res, next) => {
  try {
    const bookings = await dashboardService.getRecentBookings(req.user.id, req.user.roles?.name);
    res.status(200).json(bookings);
  } catch (error) {
    next(error);
  }
};

const getUpcomingBookings = async (req, res, next) => {
  try {
    const bookings = await dashboardService.getUpcomingBookings(req.user.id, req.user.roles?.name);
    res.status(200).json(bookings);
  } catch (error) {
    next(error);
  }
};

const getRecentReviews = async (req, res, next) => {
  try {
    const reviews = await dashboardService.getRecentReviews(req.user.id, req.user.roles?.name);
    res.status(200).json(reviews);
  } catch (error) {
    next(error);
  }
};

const getActivityTimeline = async (req, res, next) => {
  try {
    const activities = await dashboardService.getActivityTimeline(req.user.id, req.user.roles?.name);
    res.status(200).json(activities);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSummary,
  getRevenueStats,
  getRecentBookings,
  getUpcomingBookings,
  getRecentReviews,
  getActivityTimeline,
};
