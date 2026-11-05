const adminFoodService = require('../services/adminFoodService');

const adminFoodController = {
  // GET /api/v1/admin/food/stats
  async getOverviewStats(req, res, next) {
    try {
      const stats = await adminFoodService.getFoodOverviewStats();
      return res.status(200).json({
        success: true,
        data: stats
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/food/orders
  async getFoodOrders(req, res, next) {
    try {
      const { page, limit, status, orderType, search, startDate, endDate } = req.query;
      const result = await adminFoodService.getFoodOrders({
        page,
        limit,
        status,
        orderType,
        search,
        startDate,
        endDate
      });

      return res.status(200).json({
        success: true,
        data: result.orders,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/food/orders/:id
  async getFoodOrderById(req, res, next) {
    try {
      const order = await adminFoodService.getFoodOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Food order not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: order
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/food/analytics
  async getFoodAnalytics(req, res, next) {
    try {
      const { period, startDate, endDate } = req.query;
      const analytics = await adminFoodService.getFoodAnalytics({ period, startDate, endDate });

      return res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/food/cafes/:cafeId/performance
  async getCafeFoodPerformance(req, res, next) {
    try {
      const performance = await adminFoodService.getCafeFoodPerformance(req.params.cafeId);
      if (!performance) {
        return res.status(404).json({
          success: false,
          message: 'Cafe not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: performance
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = adminFoodController;

