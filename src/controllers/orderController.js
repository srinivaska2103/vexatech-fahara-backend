const orderService = require('../services/orderService');
const orderRepository = require('../repositories/orderRepository');
const cafeRepository = require('../repositories/cafeRepository');
const foodOrderPaymentService = require('../services/foodOrderPaymentService');
const orderCancellationRefundService = require('../services/orderCancellationRefundService');

const orderController = {
  // ── CUSTOMER ENDPOINTS ──────────────────────────────────────────────────

  // POST /api/v1/customer/orders/checkout
  async checkout(req, res, next) {
    try {
      const customerId = req.user.id;
      const order = await orderService.checkout(customerId, req.body);
      return res.status(201).json({
        success: true,
        message: 'Order placed successfully',
        data: order
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/customer/orders
  async getCustomerOrders(req, res, next) {
    try {
      const customerId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const result = await orderRepository.findCustomerOrders(customerId, { page, limit });
      return res.status(200).json({
        success: true,
        data: result.orders,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit)
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/customer/orders/:id
  async getCustomerOrderById(req, res, next) {
    try {
      const customerId = req.user.id;
      const order = await orderRepository.findOrderById(req.params.id);

      if (!order || order.customer_id !== customerId) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      const breakdown = foodOrderPaymentService.calculatePaymentBreakdown(order);

      return res.status(200).json({
        success: true,
        data: {
          ...order,
          payment_breakdown: breakdown
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/customer/orders/:id/tracking
  async getCustomerOrderTracking(req, res, next) {
    try {
      const customerId = req.user.id;
      const order = await orderRepository.findOrderById(req.params.id);

      if (!order || order.customer_id !== customerId) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      // Safe representation without sensitive driver data
      const trackingData = {
        orderId: order.id,
        orderNumber: order.order_number,
        orderType: order.order_type,
        orderStatus: order.order_status,
        restaurant: {
          name: order.cafes.name,
          address: order.cafes.address,
          city: order.cafes.city
        },
        estimatedPreparationTime: order.estimated_preparation_time,
        fulfilmentAddress: order.fulfilment_address,
        pickupDate: order.pickup_date,
        pickupTime: order.pickup_time,
        assignedStaff: order.assigned_employee ? {
          name: order.assigned_employee.name,
          vehicleType: order.assigned_employee.vehicle_type
        } : null,
        timeline: order.order_status_history,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      };

      return res.status(200).json({
        success: true,
        data: trackingData
      });
    } catch (err) {
      next(err);
    }
  },

  // ── CAFE OWNER ENDPOINTS ────────────────────────────────────────────────

  // Helper to resolve cafe ID for owner session
  async resolveOwnerCafe(req) {
    if (req.user.role === 'ADMIN' && req.query.cafeId) {
      return req.query.cafeId;
    }
    const cafe = await cafeRepository.findCafeByOwnerId(req.user.id);
    if (!cafe) {
      const error = new Error('No registered cafe found for this account');
      error.statusCode = 404;
      throw error;
    }
    return cafe.id;
  },

  // GET /api/v1/cafe/orders
  async getCafeOrders(req, res, next) {
    try {
      const cafeId = await orderController.resolveOwnerCafe(req);
      const filters = {
        status: req.query.status,
        orderType: req.query.orderType,
        search: req.query.search,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 30
      };

      const result = await orderRepository.findCafeOrders(cafeId, filters);
      return res.status(200).json({
        success: true,
        data: result.orders,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit)
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafe/orders/stats
  async getCafeOrderStats(req, res, next) {
    try {
      const cafeId = await orderController.resolveOwnerCafe(req);
      const stats = await orderRepository.getCafeOrderStats(cafeId, {
        startDate: req.query.startDate,
        endDate: req.query.endDate
      });
      return res.status(200).json({
        success: true,
        data: stats
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafe/orders/:id
  async getCafeOrderById(req, res, next) {
    try {
      const cafeId = await orderController.resolveOwnerCafe(req);
      const order = await orderRepository.findOrderById(req.params.id);

      if (!order || (req.user.role !== 'ADMIN' && order.cafe_id !== cafeId)) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      const breakdown = foodOrderPaymentService.calculatePaymentBreakdown(order);

      return res.status(200).json({
        success: true,
        data: {
          ...order,
          payment_breakdown: breakdown
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafe/orders/:id/status
  async updateCafeOrderStatus(req, res, next) {
    try {
      const cafeId = await orderController.resolveOwnerCafe(req);
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const order = await orderRepository.findOrderById(req.params.id);
      if (!order || (req.user.role !== 'ADMIN' && order.cafe_id !== cafeId)) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }

      const updated = await orderService.updateOrderStatus(req.params.id, status, req.user);
      return res.status(200).json({
        success: true,
        message: `Order status updated to ${status}`,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafe/orders/:id/assign-delivery
  async assignDelivery(req, res, next) {
    try {
      const cafeId = await orderController.resolveOwnerCafe(req);
      const { employeeId } = req.body;

      if (!employeeId) {
        return res.status(400).json({
          success: false,
          message: 'Delivery employeeId is required'
        });
      }

      const updated = await orderService.assignDeliveryEmployee(req.params.id, employeeId, cafeId, req.user);
      return res.status(200).json({
        success: true,
        message: 'Delivery employee assigned successfully',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/customer/orders/:id/create-payment
  async createPayment(req, res, next) {
    try {
      const customerId = req.user.id;
      const orderId = req.params.id || req.body.orderId;
      const result = await foodOrderPaymentService.createFoodOrderPayment(customerId, orderId);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/customer/orders/:id/cancellation-policy
  async getCancellationPolicy(req, res, next) {
    try {
      const customerId = req.user.id;
      const orderId = req.params.id;
      const policy = await orderCancellationRefundService.getCancellationPolicy(orderId, customerId);
      return res.status(200).json({
        success: true,
        data: policy
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/customer/orders/:id/cancel
  async cancelCustomerOrder(req, res, next) {
    try {
      const customerId = req.user.id;
      const orderId = req.params.id;
      const { reason, message } = req.body;
      const result = await orderCancellationRefundService.requestCancellation(orderId, customerId, { reason, message });
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/customer/orders/:id/refund
  async getOrderRefund(req, res, next) {
    try {
      const customerId = req.user.id;
      const orderId = req.params.id;
      const tracking = await orderCancellationRefundService.getOrderRefundTracking(orderId, customerId);
      return res.status(200).json({
        success: true,
        data: tracking
      });
    } catch (err) {
      next(err);
    }
  },

  // Owner Approve Cancellation
  // POST /api/v1/owner/orders/:id/cancellation/approve
  async approveOwnerCancellation(req, res, next) {
    try {
      const ownerId = req.user.id;
      const orderId = req.params.id;
      const result = await orderCancellationRefundService.approveCancellation(orderId, ownerId);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  // Owner Reject Cancellation
  // POST /api/v1/owner/orders/:id/cancellation/reject
  async rejectOwnerCancellation(req, res, next) {
    try {
      const ownerId = req.user.id;
      const orderId = req.params.id;
      const { reason } = req.body;
      const result = await orderCancellationRefundService.rejectCancellation(orderId, ownerId, reason);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/customer/orders/:id/verify-payment
  async verifyPayment(req, res, next) {
    try {
      const customerId = req.user.id;
      const payload = {
        ...req.body,
        orderId: req.params.id || req.body.orderId
      };
      const result = await foodOrderPaymentService.verifyFoodOrderPayment(customerId, payload);
      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = orderController;

