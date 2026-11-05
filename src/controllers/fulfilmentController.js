const restaurantAvailabilityService = require('../services/restaurantAvailabilityService');
const fulfilmentRepository = require('../repositories/fulfilmentRepository');
const cafeRepository = require('../repositories/cafeRepository');
const orderService = require('../services/orderService');
const orderRepository = require('../repositories/orderRepository');
const prisma = require('../config/prisma');

const fulfilmentController = {
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

  // ── FULFILMENT SETTINGS ────────────────────────────────────────────────

  // GET /api/v1/cafe/fulfilment-settings
  async getFulfilmentSettings(req, res, next) {
    try {
      const cafeId = await fulfilmentController.resolveOwnerCafe(req);
      const settings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);
      const availability = restaurantAvailabilityService.evaluateOrderingAvailability(settings);
      return res.status(200).json({
        success: true,
        data: {
          ...settings,
          currentAvailability: availability
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/v1/cafe/fulfilment-settings
  async updateFulfilmentSettings(req, res, next) {
    try {
      const cafeId = await fulfilmentController.resolveOwnerCafe(req);
      const {
        isTakeawayEnabled,
        takeawayMinOrderAmount,
        estimatedPickupTimeMinutes,
        takeawayOperatingHours,
        isDeliveryEnabled,
        deliveryRadiusKm,
        minDeliveryOrderAmount,
        deliveryCharge,
        freeDeliveryThreshold,
        estimatedDeliveryTimeMinutes,
        deliveryOperatingHours,
        isOrderingEnabled,
        autoEnableOrderingHours,
        allowOrdersOutsideHours,
        isTemporarilyPaused,
        pauseReason,
        pausedUntil,
        restaurantTimezone,
        weeklyBusinessHours,
        specialClosingDates
      } = req.body;

      const payload = {};
      if (isTakeawayEnabled !== undefined) payload.is_takeaway_enabled = Boolean(isTakeawayEnabled);
      if (takeawayMinOrderAmount !== undefined) payload.takeaway_min_order_amount = Number(takeawayMinOrderAmount);
      if (estimatedPickupTimeMinutes !== undefined) payload.estimated_pickup_time_minutes = Number(estimatedPickupTimeMinutes);
      if (takeawayOperatingHours !== undefined) payload.takeaway_operating_hours = takeawayOperatingHours;

      if (isDeliveryEnabled !== undefined) payload.is_delivery_enabled = Boolean(isDeliveryEnabled);
      if (deliveryRadiusKm !== undefined) payload.delivery_radius_km = Number(deliveryRadiusKm);
      if (minDeliveryOrderAmount !== undefined) payload.min_delivery_order_amount = Number(minDeliveryOrderAmount);
      if (deliveryCharge !== undefined) payload.delivery_charge = Number(deliveryCharge);
      if (freeDeliveryThreshold !== undefined) {
        payload.free_delivery_threshold = freeDeliveryThreshold ? Number(freeDeliveryThreshold) : null;
      }
      if (estimatedDeliveryTimeMinutes !== undefined) payload.estimated_delivery_time_minutes = Number(estimatedDeliveryTimeMinutes);
      if (deliveryOperatingHours !== undefined) payload.delivery_operating_hours = deliveryOperatingHours;

      if (isOrderingEnabled !== undefined) payload.is_ordering_enabled = Boolean(isOrderingEnabled);
      if (autoEnableOrderingHours !== undefined) payload.auto_enable_ordering_hours = Boolean(autoEnableOrderingHours);
      if (allowOrdersOutsideHours !== undefined) payload.allow_orders_outside_hours = Boolean(allowOrdersOutsideHours);
      if (isTemporarilyPaused !== undefined) payload.is_temporarily_paused = Boolean(isTemporarilyPaused);
      if (pauseReason !== undefined) payload.pause_reason = pauseReason ? String(pauseReason).trim() : null;
      if (pausedUntil !== undefined) payload.paused_until = pausedUntil ? new Date(pausedUntil) : null;
      if (restaurantTimezone !== undefined) payload.restaurant_timezone = String(restaurantTimezone).trim();
      if (weeklyBusinessHours !== undefined) payload.weekly_business_hours = weeklyBusinessHours;
      if (specialClosingDates !== undefined) payload.special_closing_dates = specialClosingDates;

      const updated = await fulfilmentRepository.updateFulfilmentSettings(cafeId, payload);
      return res.status(200).json({
        success: true,
        message: 'Order fulfilment settings updated successfully',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  // ── DELIVERY EMPLOYEES CRUD ─────────────────────────────────────────────

  // GET /api/v1/cafe/delivery-employees
  async getDeliveryEmployees(req, res, next) {
    try {
      const cafeId = await fulfilmentController.resolveOwnerCafe(req);
      const employees = await fulfilmentRepository.findDeliveryEmployees(cafeId);
      return res.status(200).json({
        success: true,
        data: employees
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafe/delivery-employees
  async createDeliveryEmployee(req, res, next) {
    try {
      const cafeId = await fulfilmentController.resolveOwnerCafe(req);
      const {
        employeeCode,
        name,
        phone,
        vehicleType,
        vehicleNumber,
        loginPin
      } = req.body;

      if (!name?.trim() || !phone?.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Employee name and contact phone number are required'
        });
      }

      // Auto-generate code if omitted
      const finalCode = employeeCode?.trim() || `EMP-${Date.now().toString().slice(-4)}`;

      const employee = await fulfilmentRepository.createDeliveryEmployee(cafeId, {
        employee_code: finalCode,
        name: name.trim(),
        phone: phone.trim(),
        vehicle_type: vehicleType || 'BIKE',
        vehicle_number: vehicleNumber?.trim() || null,
        login_pin: loginPin?.trim() || '1234',
        is_active: true,
        availability_status: 'AVAILABLE'
      });

      return res.status(201).json({
        success: true,
        message: 'Delivery staff member created successfully',
        data: employee
      });
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'An employee with this Employee Code already exists for this restaurant'
        });
      }
      next(err);
    }
  },

  // PUT /api/v1/cafe/delivery-employees/:id
  async updateDeliveryEmployee(req, res, next) {
    try {
      const cafeId = await fulfilmentController.resolveOwnerCafe(req);
      const employee = await fulfilmentRepository.findDeliveryEmployeeById(req.params.id);

      if (!employee || employee.cafe_id !== cafeId) {
        return res.status(404).json({
          success: false,
          message: 'Delivery employee not found'
        });
      }

      const {
        name,
        phone,
        vehicleType,
        vehicleNumber,
        isActive,
        availabilityStatus,
        loginPin
      } = req.body;

      const payload = {};
      if (name) payload.name = name.trim();
      if (phone) payload.phone = phone.trim();
      if (vehicleType) payload.vehicle_type = vehicleType;
      if (vehicleNumber !== undefined) payload.vehicle_number = vehicleNumber?.trim() || null;
      if (isActive !== undefined) payload.is_active = Boolean(isActive);
      if (availabilityStatus) payload.availability_status = availabilityStatus;
      if (loginPin) payload.login_pin = loginPin.trim();

      const updated = await fulfilmentRepository.updateDeliveryEmployee(req.params.id, payload);
      return res.status(200).json({
        success: true,
        message: 'Employee updated successfully',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafe/delivery-employees/:id/status
  async toggleEmployeeStatus(req, res, next) {
    try {
      const cafeId = await fulfilmentController.resolveOwnerCafe(req);
      const employee = await fulfilmentRepository.findDeliveryEmployeeById(req.params.id);

      if (!employee || employee.cafe_id !== cafeId) {
        return res.status(404).json({
          success: false,
          message: 'Delivery employee not found'
        });
      }

      const { isActive, availabilityStatus } = req.body;
      const payload = {};
      if (isActive !== undefined) payload.is_active = Boolean(isActive);
      if (availabilityStatus) payload.availability_status = availabilityStatus;

      const updated = await fulfilmentRepository.updateDeliveryEmployee(req.params.id, payload);
      return res.status(200).json({
        success: true,
        message: 'Employee status updated',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  // ── DELIVERY DRIVER PORTAL APIS ─────────────────────────────────────────

  // POST /api/v1/delivery/login
  async deliveryLogin(req, res, next) {
    try {
      const { phone, pin } = req.body;
      if (!phone || !pin) {
        return res.status(400).json({
          success: false,
          message: 'Phone number and PIN are required'
        });
      }

      const employee = await prisma.delivery_employees.findFirst({
        where: {
          phone: phone.trim(),
          login_pin: pin.trim()
        },
        include: {
          cafes: {
            select: { id: true, name: true, address: true, city: true }
          }
        }
      });

      if (!employee || !employee.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials or inactive delivery employee account'
        });
      }

      // Generate a lightweight session token
      return res.status(200).json({
        success: true,
        message: 'Delivery login successful',
        data: {
          employee: {
            id: employee.id,
            name: employee.name,
            phone: employee.phone,
            code: employee.employee_code,
            vehicleType: employee.vehicle_type,
            vehicleNumber: employee.vehicle_number,
            availabilityStatus: employee.availability_status
          },
          cafe: employee.cafes
        }
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/delivery/assigned-orders
  async getAssignedOrders(req, res, next) {
    try {
      const employeeId = req.headers['x-employee-id'] || req.query.employeeId;
      if (!employeeId) {
        return res.status(401).json({
          success: false,
          message: 'Delivery employee authentication required'
        });
      }

      const orders = await orderRepository.findAssignedOrdersForEmployee(employeeId, req.query.status);
      return res.status(200).json({
        success: true,
        data: orders
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/delivery/orders/:id
  async getDeliveryOrderDetails(req, res, next) {
    try {
      const employeeId = req.headers['x-employee-id'] || req.query.employeeId;
      const order = await orderRepository.findOrderById(req.params.id);

      if (!order || (employeeId && order.assigned_employee_id !== employeeId)) {
        return res.status(404).json({
          success: false,
          message: 'Order not found or not assigned to you'
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

  // PATCH /api/v1/delivery/orders/:id/status
  async updateDeliveryOrderStatus(req, res, next) {
    try {
      const employeeId = req.headers['x-employee-id'] || req.body.employeeId;
      const { status } = req.body;

      if (!employeeId) {
        return res.status(401).json({
          success: false,
          message: 'Delivery employee authentication required'
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'New status is required'
        });
      }

      const updated = await orderService.employeeUpdateOrderStatus(req.params.id, status, employeeId);
      return res.status(200).json({
        success: true,
        message: `Order marked as ${status}`,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/public/cafes/:cafeId/availability
  async getPublicCafeAvailability(req, res, next) {
    try {
      const { cafeId } = req.params;
      const settings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);
      const availability = restaurantAvailabilityService.evaluateOrderingAvailability(settings);

      return res.status(200).json({
        success: true,
        data: {
          cafeId,
          timezone: settings.restaurant_timezone || 'Asia/Kolkata',
          isOrderingEnabled: settings.is_ordering_enabled,
          isTemporarilyPaused: settings.is_temporarily_paused,
          pauseReason: settings.pause_reason,
          allowOrdersOutsideHours: settings.allow_orders_outside_hours,
          weeklyBusinessHours: settings.weekly_business_hours,
          specialClosingDates: settings.special_closing_dates,
          availability
        }
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = fulfilmentController;

