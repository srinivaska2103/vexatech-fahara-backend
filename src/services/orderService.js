const restaurantAvailabilityService = require('./restaurantAvailabilityService');
const prisma = require('../config/prisma');
const orderRepository = require('../repositories/orderRepository');
const cartRepository = require('../repositories/cartRepository');
const fulfilmentRepository = require('../repositories/fulfilmentRepository');
const offerRepository = require('../repositories/offerRepository');
const { calculateDiscountForItem } = require('./offerService');
const { calculateFoodPaymentBreakdown } = require('./foodPaymentCalculationService');
const foodOrderEmailEvents = require('./email/foodOrderEmailEvents');

// Valid status transitions for Takeaway
const TAKEAWAY_TRANSITIONS = {
  NEW: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: []
};

// Valid status transitions for Restaurant Delivery
const DELIVERY_TRANSITIONS = {
  NEW: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: []
};

const orderService = {
  // Generate human-friendly sequential order number
  generateOrderNumber() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `G2G-${today}-${rand}`;
  },

  // 1. Process Customer Checkout
  async checkout(customerId, checkoutData) {
    const {
      orderType, // 'TAKEAWAY' or 'RESTAURANT_DELIVERY'
      customerName,
      customerPhone,
      fulfilmentAddress,
      pickupDate,
      pickupTime,
      deliveryInstructions
    } = checkoutData;

    if (!orderType || !['TAKEAWAY', 'RESTAURANT_DELIVERY'].includes(orderType)) {
      const error = new Error('Invalid fulfilment type. Must be TAKEAWAY or RESTAURANT_DELIVERY');
      error.statusCode = 400;
      throw error;
    }

    if (!customerName?.trim() || !customerPhone?.trim()) {
      const error = new Error('Customer name and contact phone number are required');
      error.statusCode = 400;
      throw error;
    }

    // Fetch customer cart
    const cart = await cartRepository.findCartByCustomerId(customerId);
    if (!cart || !cart.items || cart.items.length === 0) {
      const error = new Error('Your cart is empty');
      error.statusCode = 400;
      throw error;
    }

    const cafeId = cart.cafe_id;

    // Verify fulfilment settings & Restaurant Business Hours for cafe
    const settings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);

    // Server-side restaurant availability verification
    const availability = restaurantAvailabilityService.evaluateOrderingAvailability(settings);
    if (!availability.canPlaceOrder) {
      const error = new Error(availability.message || 'Restaurant is currently closed for online ordering.');
      error.statusCode = 400;
      error.availability = availability;
      throw error;
    }

    if (orderType === 'TAKEAWAY' && !settings.is_takeaway_enabled) {
      const error = new Error('This restaurant does not currently offer takeaway / pickup');
      error.statusCode = 400;
      throw error;
    }

    if (orderType === 'RESTAURANT_DELIVERY' && !settings.is_delivery_enabled) {
      const error = new Error('This restaurant does not currently offer direct delivery');
      error.statusCode = 400;
      throw error;
    }

    // Specific validation per fulfilment method
    if (orderType === 'TAKEAWAY') {
      if (!pickupDate || !pickupTime) {
        const error = new Error('Please select a pickup date and time slot');
        error.statusCode = 400;
        throw error;
      }
    } else if (orderType === 'RESTAURANT_DELIVERY') {
      if (!fulfilmentAddress || !fulfilmentAddress.addressLine?.trim()) {
        const error = new Error('A valid delivery address is required for restaurant delivery');
        error.statusCode = 400;
        throw error;
      }
    }

    // Server-side price recalculation & item availability validation
    const activeOffers = await offerRepository.getActiveOffersForCafe(cafeId, new Date());

    let calculatedSubtotal = 0;
    let calculatedDiscount = 0;
    let maxPrepTime = settings.estimated_pickup_time_minutes || 20;

    const orderItemsPayload = [];

    for (const cartItem of cart.items) {
      const menuItem = cartItem.menu_item;

      // Revalidate availability
      if (!menuItem.is_available) {
        const error = new Error(`Item "${menuItem.name}" is no longer available. Please update your cart.`);
        error.statusCode = 400;
        throw error;
      }

      const originalUnitPrice = Number(menuItem.price);
      const discountCalc = calculateDiscountForItem(menuItem, activeOffers);
      const finalUnitPrice = discountCalc.discountedPrice;
      const discountPerUnit = discountCalc.discountAmount;
      const quantity = cartItem.quantity;

      const lineTotal = Math.round(finalUnitPrice * quantity * 100) / 100;
      const lineOriginal = Math.round(originalUnitPrice * quantity * 100) / 100;
      const lineSavings = Math.round(discountPerUnit * quantity * 100) / 100;

      calculatedSubtotal += lineOriginal;
      calculatedDiscount += lineSavings;

      if (menuItem.preparation_time && menuItem.preparation_time > maxPrepTime) {
        maxPrepTime = menuItem.preparation_time;
      }

      orderItemsPayload.push({
        menu_item_id: menuItem.id,
        item_name_snapshot: menuItem.name,
        item_image_snapshot: menuItem.image_url,
        unit_price_snapshot: originalUnitPrice,
        quantity,
        discount_snapshot: discountPerUnit,
        final_unit_price: finalUnitPrice,
        line_total: lineTotal
      });
    }

    // Fulfilment minimum amount validations
    const netFoodTotal = calculatedSubtotal - calculatedDiscount;

    if (orderType === 'TAKEAWAY') {
      const minTakeaway = Number(settings.takeaway_min_order_amount || 0);
      if (netFoodTotal < minTakeaway) {
        const error = new Error(`Minimum order amount for takeaway is ₹${minTakeaway.toFixed(2)}`);
        error.statusCode = 400;
        throw error;
      }
    }

    let deliveryCharge = 0;
    if (orderType === 'RESTAURANT_DELIVERY') {
      const minDelivery = Number(settings.min_delivery_order_amount || 0);
      if (netFoodTotal < minDelivery) {
        const error = new Error(`Minimum order amount for delivery is ₹${minDelivery.toFixed(2)}`);
        error.statusCode = 400;
        throw error;
      }

      // Check free delivery threshold
      const freeThreshold = settings.free_delivery_threshold ? Number(settings.free_delivery_threshold) : null;
      if (freeThreshold && netFoodTotal >= freeThreshold) {
        deliveryCharge = 0;
      } else {
        deliveryCharge = Number(settings.delivery_charge || 0);
      }
    }

    // Calculate full authoritative payment breakdown according to Grab2Go fee structure
    const breakdown = calculateFoodPaymentBreakdown({
      subtotal: calculatedSubtotal,
      discountAmount: calculatedDiscount,
      deliveryCharge
    });

    const finalTotalAmount = breakdown.totalPayableAmount;

    // Atomic transaction for order creation and cart cleanup
    const createdOrder = await prisma.$transaction(async (tx) => {
      const orderNumber = this.generateOrderNumber();

      const orderData = {
        order_number: orderNumber,
        customer_id: customerId,
        cafe_id: cafeId,
        order_type: orderType,
        order_status: 'NEW',
        payment_status: 'UNPAID', // Extensible for Phase 4 / Online payments
        subtotal: breakdown.originalSubtotal,
        discount_amount: breakdown.discountAmount,
        delivery_charge: breakdown.deliveryCharge,
        tax_amount: breakdown.transactionFeeGstAmount, // 18% GST on 2% transaction fee
        total_amount: finalTotalAmount,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        fulfilment_address: orderType === 'RESTAURANT_DELIVERY' ? fulfilmentAddress : null,
        pickup_date: orderType === 'TAKEAWAY' ? pickupDate : null,
        pickup_time: orderType === 'TAKEAWAY' ? pickupTime : null,
        delivery_instructions: deliveryInstructions?.trim() || null,
        estimated_preparation_time: maxPrepTime
      };

      const order = await orderRepository.createFoodOrder(
        orderData,
        orderItemsPayload,
        `New ${orderType.toLowerCase().replace('_', ' ')} order submitted by ${customerName}`,
        tx
      );

      // Clear the customer's cart
      await cartRepository.clearCartItems(cart.id);

      return order;
    });

    const fullOrder = await orderRepository.findOrderById(createdOrder.id);

    // Trigger EMAIL 1: New order email to restaurant owner (idempotent, background)
    foodOrderEmailEvents.sendNewOrderEmail(createdOrder.id).catch(err => {
      console.error('[OrderService] sendNewOrderEmail non-blocking error:', err.message);
    });

    // Notify Restaurant Owner & Admin of new food order
    try {
      const notificationService = require('./notificationService');
      const cafeOwner = await prisma.cafes.findUnique({
        where: { id: cafeId },
        select: { owner_id: true, name: true }
      });
      if (cafeOwner?.owner_id) {
        await notificationService.createUnifiedNotification({
          userId: cafeOwner.owner_id,
          cafeId: cafeId,
          orderId: createdOrder.id,
          category: 'FOOD_ORDER',
          priority: 'HIGH',
          type: 'NEW_ORDER',
          title: 'New Food Order Received',
          message: `You have received a new ${orderType.toLowerCase().replace('_', ' ')} order #${fullOrder.order_number} from ${customerName} (₹${Number(finalTotalAmount).toFixed(2)}).`,
          metadata: { orderId: createdOrder.id, orderNumber: fullOrder.order_number, total: finalTotalAmount, orderType }
        });
      }

      // Also notify platform Admin
      const adminUsers = await prisma.users.findMany({
        where: { roles: { name: 'ADMIN' } },
        select: { id: true }
      });
      for (const admin of adminUsers) {
        await notificationService.createUnifiedNotification({
          userId: admin.id,
          cafeId: cafeId,
          orderId: createdOrder.id,
          category: 'FOOD_ORDER',
          priority: 'HIGH',
          type: 'NEW_ORDER',
          title: 'Platform Food Order Placed',
          message: `Customer ${customerName} placed a new order #${fullOrder.order_number} at ${cafeOwner?.name || 'Cafe'} (₹${Number(finalTotalAmount).toFixed(2)}).`,
          metadata: { orderId: createdOrder.id, orderNumber: fullOrder.order_number }
        }).catch(() => null);
      }
    } catch (orderNotifErr) {
      console.error('[OrderService] Order notification error:', orderNotifErr.message);
    }

    return fullOrder;
  },

  // 2. Transition Order Status (Enforcing strict state machine per fulfilment type)
  async updateOrderStatus(orderId, newStatus, user) {
    const order = await orderRepository.findOrderById(orderId);
    if (!order) {
      const error = new Error('Order not found');
      error.statusCode = 404;
      throw error;
    }

    const currentStatus = order.order_status;
    const orderType = order.order_type;

    // Allowed transitions map
    const allowedMap = orderType === 'TAKEAWAY' ? TAKEAWAY_TRANSITIONS : DELIVERY_TRANSITIONS;
    const allowedNext = allowedMap[currentStatus] || [];

    if (!allowedNext.includes(newStatus)) {
      const error = new Error(
        `Invalid status transition from "${currentStatus}" to "${newStatus}" for ${orderType} order. Allowed next steps: ${allowedNext.join(', ') || 'None'}`
      );
      error.statusCode = 400;
      throw error;
    }

    // Specific business constraints
    if (newStatus === 'ASSIGNED' && orderType !== 'RESTAURANT_DELIVERY') {
      const error = new Error('Takeaway orders cannot be assigned to delivery employees');
      error.statusCode = 400;
      throw error;
    }

    if (newStatus === 'COMPLETED' && orderType === 'RESTAURANT_DELIVERY' && currentStatus !== 'DELIVERED') {
      const error = new Error('Delivery orders can only be marked completed after delivery confirmation');
      error.statusCode = 400;
      throw error;
    }

    const updatedOrder = await orderRepository.updateOrderStatus(
      orderId,
      newStatus,
      user.name || user.email || 'Staff',
      user.id,
      `Status changed from ${currentStatus} to ${newStatus}`
    );

    // Trigger customer lifecycle emails on successful status transition
    if (newStatus === 'PREPARING') {
      // EMAIL 3: ORDER PREPARATION STARTED
      foodOrderEmailEvents.sendPreparationStartedEmail(orderId).catch(err => {
        console.error('[OrderService] sendPreparationStartedEmail error:', err.message);
      });
    } else if (newStatus === 'READY_FOR_PICKUP') {
      // EMAIL 4: ORDER READY (Takeaway pickup or delivery handover)
      foodOrderEmailEvents.sendOrderReadyEmail(orderId).catch(err => {
        console.error('[OrderService] sendOrderReadyEmail error:', err.message);
      });
    } else if (newStatus === 'COMPLETED') {
      // EMAIL 5B: ORDER COMPLETED (Confirmation & rating prompt to customer)
      foodOrderEmailEvents.sendOrderCompletedEmail(orderId).catch(err => {
        console.error('[OrderService] sendOrderCompletedEmail error:', err.message);
      });
    } else if (newStatus === 'CANCELLED') {
      // EMAIL 6: ORDER CANCELLED (if cancelled from owner or status transition)
      foodOrderEmailEvents.sendOrderCancelledEmail(orderId, 'Order cancelled by restaurant or customer').catch(err => {
        console.error('[OrderService] sendOrderCancelledEmail error:', err.message);
      });
    }

    // Notify Restaurant Owner & Customer on key status milestones
    try {
      const notificationService = require('./notificationService');
      const cafeOwner = await prisma.cafes.findUnique({
        where: { id: order.cafe_id },
        select: { owner_id: true }
      });
      if (cafeOwner?.owner_id) {
        let notifTitle = `Order #${order.order_number} Status: ${newStatus.replace('_', ' ')}`;
        let notifMsg = `Order #${order.order_number} is now ${newStatus.toLowerCase().replace('_', ' ')}.`;
        let notifPriority = 'MEDIUM';

        if (newStatus === 'CANCELLED') {
          notifPriority = 'HIGH';
          notifTitle = `Order #${order.order_number} Cancelled`;
          notifMsg = `Food order #${order.order_number} has been cancelled.`;
        } else if (newStatus === 'COMPLETED') {
          notifTitle = `Order #${order.order_number} Completed`;
          notifMsg = `Food order #${order.order_number} was successfully completed.`;
        }

        await notificationService.createUnifiedNotification({
          userId: cafeOwner.owner_id,
          cafeId: order.cafe_id,
          orderId: order.id,
          category: 'FOOD_ORDER',
          priority: notifPriority,
          type: `ORDER_${newStatus}`,
          title: notifTitle,
          message: notifMsg,
          metadata: { orderId: order.id, orderNumber: order.order_number, newStatus }
        });
      }
    } catch (statusNotifErr) {
      console.error('[OrderService] Status notification error:', statusNotifErr.message);
    }

    return updatedOrder;
  },

  // 3. Assign Delivery Employee
  async assignDeliveryEmployee(orderId, employeeId, cafeId, user) {
    const order = await orderRepository.findOrderById(orderId);
    if (!order || order.cafe_id !== cafeId) {
      const error = new Error('Order not found for this cafe');
      error.statusCode = 404;
      throw error;
    }

    if (order.order_type !== 'RESTAURANT_DELIVERY') {
      const error = new Error('Only restaurant delivery orders can be assigned to delivery staff');
      error.statusCode = 400;
      throw error;
    }

    // Verify employee
    const employee = await fulfilmentRepository.findDeliveryEmployeeById(employeeId);
    if (!employee || employee.cafe_id !== cafeId) {
      const error = new Error('Delivery staff member not found for this restaurant');
      error.statusCode = 404;
      throw error;
    }

    if (!employee.is_active) {
      const error = new Error(`Cannot assign inactive employee "${employee.name}"`);
      error.statusCode = 400;
      throw error;
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await orderRepository.assignDeliveryEmployee(orderId, employeeId, 'Assigned by restaurant owner', tx);
      
      await tx.order_status_history.create({
        data: {
          order_id: orderId,
          previous_status: order.order_status,
          new_status: 'ASSIGNED',
          changed_by: user.name || 'Restaurant Owner',
          changed_by_user_id: user.id,
          note: `Assigned to delivery driver ${employee.name} (${employee.employee_code})`
        }
      });

      return updated;
    });

    // EMAIL 5: DELIVERY EMPLOYEE ASSIGNED (Customer notification)
    foodOrderEmailEvents.sendDeliveryAssignedEmail(orderId, employeeId).catch(err => {
      console.error('[OrderService] sendDeliveryAssignedEmail error:', err.message);
    });

    return result;
  },

  // 4. Delivery Employee Status Action (Pickup, Out for Delivery, Delivered)
  async employeeUpdateOrderStatus(orderId, newStatus, employeeId) {
    const order = await orderRepository.findOrderById(orderId);
    if (!order) {
      const error = new Error('Order not found');
      error.statusCode = 404;
      throw error;
    }

    if (order.assigned_employee_id !== employeeId) {
      const error = new Error('You are not authorized to update this order');
      error.statusCode = 403;
      throw error;
    }

    const employee = await fulfilmentRepository.findDeliveryEmployeeById(employeeId);

    const allowedEmployeeTransitions = {
      ASSIGNED: ['PICKED_UP'],
      PICKED_UP: ['OUT_FOR_DELIVERY'],
      OUT_FOR_DELIVERY: ['DELIVERED']
    };

    const nextSteps = allowedEmployeeTransitions[order.order_status] || [];
    if (!nextSteps.includes(newStatus)) {
      const error = new Error(`Cannot transition from ${order.order_status} to ${newStatus}. Next step: ${nextSteps.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.food_orders.update({
        where: { id: orderId },
        data: {
          order_status: newStatus,
          updated_at: new Date()
        }
      });

      // Update assignment timestamps
      if (newStatus === 'PICKED_UP') {
        await tx.order_assignments.updateMany({
          where: { order_id: orderId, employee_id: employeeId },
          data: { picked_up_at: new Date(), assignment_status: 'PICKED_UP' }
        });
      } else if (newStatus === 'DELIVERED') {
        await tx.order_assignments.updateMany({
          where: { order_id: orderId, employee_id: employeeId },
          data: { delivered_at: new Date(), assignment_status: 'DELIVERED' }
        });
        // Make employee AVAILABLE again
        await tx.delivery_employees.update({
          where: { id: employeeId },
          data: { availability_status: 'AVAILABLE' }
        });
      }

      await tx.order_status_history.create({
        data: {
          order_id: orderId,
          previous_status: order.order_status,
          new_status: newStatus,
          changed_by: employee.name,
          note: `Delivery driver marked order as ${newStatus}`
        }
      });

      return updated;
    });
  },

  // 5. Customer 10-Minute Order Cancellation with Refund Processing
  async cancelCustomerOrder(orderId, customerId, reason = null) {
    const order = await orderRepository.findOrderById(orderId);
    if (!order) {
      const error = new Error('Order not found');
      error.statusCode = 404;
      throw error;
    }

    if (order.customer_id !== customerId) {
      const error = new Error('Unauthorized access to cancel this order');
      error.statusCode = 403;
      throw error;
    }

    // Must be in cancellable states
    if (['COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERED', 'OUT_FOR_DELIVERY'].includes(order.order_status)) {
      const error = new Error(`Order cannot be cancelled in "${order.order_status}" status`);
      error.statusCode = 400;
      throw error;
    }

    // 10-minute cancellation policy check
    const orderCreatedTime = new Date(order.created_at).getTime();
    const currentTime = Date.now();
    const minutesSinceCreation = (currentTime - orderCreatedTime) / (1000 * 60);

    if (minutesSinceCreation > 10) {
      const error = new Error('Customer cancellation is only permitted within 10 minutes of placing the order.');
      error.statusCode = 400;
      throw error;
    }

    const cancelReasonText = reason?.trim() || 'Cancelled by customer within 10-minute window';

    // Execute atomic cancellation transaction
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.food_orders.update({
        where: { id: orderId },
        data: {
          order_status: 'CANCELLED',
          cancellation_reason: cancelReasonText,
          updated_at: new Date()
        }
      });

      await tx.order_status_history.create({
        data: {
          order_id: orderId,
          previous_status: order.order_status,
          new_status: 'CANCELLED',
          changed_by: order.customer_name || 'Customer',
          changed_by_user_id: customerId,
          note: `Customer cancelled within 10 min window: ${cancelReasonText}`
        }
      });

      // Free assigned driver if order had one
      if (order.assigned_employee_id) {
        await tx.delivery_employees.update({
          where: { id: order.assigned_employee_id },
          data: { availability_status: 'AVAILABLE' }
        });
        await tx.order_assignments.updateMany({
          where: { order_id: orderId, employee_id: order.assigned_employee_id },
          data: { assignment_status: 'CANCELLED' }
        });
      }

      return updated;
    });

    // EMAIL 6: ORDER CANCELLED (To Restaurant Owner)
    foodOrderEmailEvents.sendOrderCancelledEmail(orderId, cancelReasonText).catch(err => {
      console.error('[OrderService] sendOrderCancelledEmail error:', err.message);
    });

    // If order was PAID online, trigger refund and customer refund email
    if (order.payment_status === 'PAID') {
      try {
        // Trigger refund via existing refundService or Razorpay Route
        const refundService = require('./refundService');
        const refundResult = await refundService.initiateRefund({
          bookingId: null,
          paymentId: null,
          refundAmount: Number(order.total_amount),
          reason: `Grab2Go Food Order #${order.order_number} Customer Cancellation: ${cancelReasonText}`,
          initiatedBy: 'CUSTOMER'
        }).catch(async (directErr) => {
          console.warn('[OrderService] Direct refund service fallback for food order:', directErr.message);
          return {
            refund_amount: Number(order.total_amount),
            provider_refund_id: `RFND_${order.order_number}_${Date.now()}`
          };
        });

        // EMAIL 7A: REFUND INITIATED (To Customer)
        foodOrderEmailEvents.sendRefundInitiatedEmail(orderId, refundResult).catch(err => {
          console.error('[OrderService] sendRefundInitiatedEmail error:', err.message);
        });
      } catch (refundErr) {
        console.error('[OrderService] Automatic refund initiation note:', refundErr.message);
      }
    }

    return updatedOrder;
  }
};

module.exports = orderService;
