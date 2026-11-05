const restaurantAvailabilityService = require('./restaurantAvailabilityService');
const fulfilmentRepository = require('../repositories/fulfilmentRepository');
const prisma = require('../config/prisma');
const razorpayRouteService = require('./razorpayRouteService');
const { calculateFoodPaymentBreakdown } = require('./foodPaymentCalculationService');
const foodOrderEmailEvents = require('./email/foodOrderEmailEvents');

class FoodOrderPaymentService {
  /**
   * Helper to return standard breakdown for any food order
   */
  calculatePaymentBreakdown(order) {
    if (!order) return null;
    return calculateFoodPaymentBreakdown({
      subtotal: Number(order.subtotal || 0),
      discountAmount: Number(order.discount_amount || 0),
      deliveryCharge: Number(order.delivery_charge || 0)
    });
  }

  /**
   * 1. Create Razorpay Payment Order for a Food Order
   */
  async createFoodOrderPayment(userId, orderId) {
    if (!orderId) {
      const err = new Error('Order ID is required');
      err.statusCode = 400;
      throw err;
    }

    const order = await prisma.food_orders.findUnique({
      where: { id: orderId },
      include: {
        cafes: true
      }
    });

    if (!order) {
      const err = new Error('Food order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.customer_id !== userId) {
      const err = new Error('Unauthorized access to this order');
      err.statusCode = 403;
      throw err;
    }

    if (order.payment_status === 'PAID') {
      const err = new Error('This order is already paid');
      err.statusCode = 400;
      throw err;
    }

    // Server-side restaurant availability verification during payment initiation
    const fulfilmentSettings = await fulfilmentRepository.getOrCreateFulfilmentSettings(order.cafe_id);
    const availability = restaurantAvailabilityService.evaluateOrderingAvailability(fulfilmentSettings);
    if (!availability.canPlaceOrder) {
      const err = new Error(availability.message || 'Restaurant has closed or paused accepting orders. Payment cannot be initiated.');
      err.statusCode = 400;
      err.availability = availability;
      throw err;
    }

    // Authoritative payment breakdown
    const breakdown = calculateFoodPaymentBreakdown({
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discount_amount),
      deliveryCharge: Number(order.delivery_charge)
    });

    // Check Cafe Linked Account for Razorpay Route
    const cafe = order.cafes;
    const linkedAccountId = cafe?.razorpay_account_id || cafe?.razorpay_linked_account_id || cafe?.payment_account_id;

    // Optional direct Route transfers payload if linked account exists
    let transfers = undefined;
    if (linkedAccountId && breakdown.restaurantSettlementAmount > 0) {
      transfers = [
        {
          account: linkedAccountId,
          amount: Math.round(breakdown.restaurantSettlementAmount * 100),
          currency: 'INR',
          notes: {
            order_id: order.id,
            order_number: order.order_number,
            type: 'RESTAURANT_SETTLEMENT'
          }
        }
      ];
    }

    // Call Razorpay Route service to create order
    const rpOrder = await razorpayRouteService.createPaymentOrder({
      amountInRupees: breakdown.totalPayableAmount,
      bookingNumber: order.order_number,
      bookingId: order.id,
      customerId: order.customer_id,
      splits: transfers
    });

    return {
      orderId: rpOrder.orderId,
      amount: rpOrder.amount, // in paise
      amountInRupees: breakdown.totalPayableAmount,
      currency: rpOrder.currency || 'INR',
      keyId: process.env.RAZORPAY_KEY_ID || '',
      foodOrderId: order.id,
      orderNumber: order.order_number,
      breakdown
    };
  }

  /**
   * 2. Verify Razorpay Payment for a Food Order & Execute Route Transfer
   */
  async verifyFoodOrderPayment(userId, payload) {
    const {
      orderId, // food order UUID
      food_order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = payload;

    const targetOrderId = orderId || food_order_id;
    if (!targetOrderId) {
      const err = new Error('Food order ID is required');
      err.statusCode = 400;
      throw err;
    }

    const order = await prisma.food_orders.findUnique({
      where: { id: targetOrderId },
      include: { cafes: true }
    });

    if (!order) {
      const err = new Error('Food order not found');
      err.statusCode = 404;
      throw err;
    }

    if (userId && order.customer_id !== userId) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    if (order.payment_status === 'PAID') {
      return {
        success: true,
        message: 'Order already verified and paid',
        order
      };
    }

    // 1. Verify Razorpay Signature
    let isVerified = false;
    if (razorpay_payment_id && razorpay_signature && razorpay_order_id) {
      isVerified = razorpayRouteService.verifyPaymentSignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });
    }

    // Fallback: Verify directly with Razorpay API
    if (!isVerified && razorpay_payment_id) {
      try {
        const fetchRes = await razorpayRouteService.fetchPayment(razorpay_payment_id);
        if (fetchRes?.payment && ['captured', 'authorized'].includes(fetchRes.payment.status)) {
          isVerified = true;
        }
      } catch (apiErr) {
        console.warn('[FoodOrderPaymentService] Razorpay fetch check failed:', apiErr.message);
      }
    }

    if (!isVerified) {
      const err = new Error('Payment verification failed. Invalid gateway signature.');
      err.statusCode = 400;
      throw err;
    }

    // 2. Mark order as PAID & record status history
    // 2. Record or update verified payment in central payments table & mark food order as PAID
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payments.findFirst({
        where: {
          OR: [
            ...(razorpay_order_id ? [{ gateway_order_id: razorpay_order_id }, { provider_order_id: razorpay_order_id }] : [{ gateway_order_id: order.order_number }]),
            ...(razorpay_payment_id ? [{ gateway_payment_id: razorpay_payment_id }, { provider_payment_id: razorpay_payment_id }] : [])
          ]
        }
      });

      if (!existingPayment) {
        await tx.payments.create({
          data: {
            amount: order.total_amount,
            platform_fee: order.delivery_charge || 0,
            gst_amount: order.tax_amount || 0,
            payment_gateway: "RAZORPAY",
            payment_provider: "RAZORPAY",
            gateway_order_id: razorpay_order_id || order.order_number,
            gateway_payment_id: razorpay_payment_id,
            provider_order_id: razorpay_order_id,
            provider_payment_id: razorpay_payment_id,
            status: "SUCCESS",
            paid_at: new Date(),
            payment_method: "ONLINE"
          }
        });
      } else {
        await tx.payments.update({
          where: { id: existingPayment.id },
          data: {
            status: "SUCCESS",
            gateway_payment_id: razorpay_payment_id,
            provider_payment_id: razorpay_payment_id,
            paid_at: new Date()
          }
        });
      }

      const resOrder = await tx.food_orders.update({
        where: { id: order.id },
        data: {
          payment_status: 'PAID',
          updated_at: new Date()
        }
      });

      await tx.order_status_history.create({
        data: {
          order_id: order.id,
          previous_status: order.order_status,
          new_status: order.order_status,
          changed_by: 'Razorpay Gateway',
          changed_by_user_id: userId || null,
          note: `Payment verified successfully via Razorpay (Tx: ${razorpay_payment_id})`
        }
      });

      return resOrder;
    });

    // EMAIL 2: PAYMENT SUCCESSFUL (To: Restaurant Owner, triggered from verified backend state)
    foodOrderEmailEvents.sendPaymentSuccessEmail(order.id, {
      gateway_payment_id: razorpay_payment_id,
      provider_payment_id: razorpay_payment_id,
      razorpay_order_id
    }).catch(err => {
      console.error('[FoodOrderPaymentService] sendPaymentSuccessEmail error:', err.message);
    });

    // Notify Restaurant Owner of successful payment
    try {
      const notificationService = require('./notificationService');
      const cafeOwner = await prisma.cafes.findUnique({
        where: { id: order.cafe_id },
        select: { owner_id: true, name: true }
      });
      if (cafeOwner?.owner_id) {
        await notificationService.createUnifiedNotification({
          userId: cafeOwner.owner_id,
          cafeId: order.cafe_id,
          orderId: order.id,
          category: 'PAYMENT',
          priority: 'HIGH',
          type: 'PAYMENT_RECEIVED',
          title: 'Food Order Payment Received',
          message: `Payment of ₹${Number(order.total_amount).toFixed(2)} for order #${order.order_number} has been verified and captured.`,
          metadata: { orderId: order.id, amount: Number(order.total_amount), paymentId: razorpay_payment_id }
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
          cafeId: order.cafe_id,
          orderId: order.id,
          category: 'PAYMENT',
          priority: 'HIGH',
          type: 'PAYMENT_SUCCESSFUL',
          title: 'New Food Payment Received',
          message: `Customer payment of ₹${Number(order.total_amount).toFixed(2)} for food order #${order.order_number} has been successfully verified.`,
          metadata: { orderId: order.id, amount: Number(order.total_amount) }
        }).catch(() => null);
      }
    } catch (payNotifErr) {
      console.error('[FoodOrderPaymentService] Payment notification error:', payNotifErr.message);
    }

    // 3. Trigger Razorpay Route Settlement Transfer if linked account configured
    const breakdown = calculateFoodPaymentBreakdown({
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discount_amount),
      deliveryCharge: Number(order.delivery_charge)
    });

    const cafe = order.cafes;
    const linkedAccountId = cafe?.razorpay_account_id || cafe?.razorpay_linked_account_id || cafe?.payment_account_id;

    let transferResult = null;
    if (linkedAccountId && breakdown.restaurantSettlementAmount > 0 && razorpay_payment_id) {
      try {
        transferResult = await razorpayRouteService.createTransfer({
          gatewayPaymentId: razorpay_payment_id,
          linkedAccountId,
          amountInRupees: breakdown.restaurantSettlementAmount,
          paymentId: order.id,
          bookingId: order.id,
          vendorType: 'CAFE'
        });
        console.log(`[FOOD ORDER ROUTE TRANSFER SUCCESS] orderId: ${order.id}, transferId: ${transferResult.transferId}`);
      } catch (transferErr) {
        console.error(`[FOOD ORDER ROUTE TRANSFER NOTE] Route transfer pending or skipped: ${transferErr.message}`);
      }
    }

    return {
      success: true,
      message: 'Payment verified and captured successfully',
      paymentId: razorpay_payment_id,
      order: updatedOrder,
      breakdown,
      transfer: transferResult
    };
  }
}

module.exports = new FoodOrderPaymentService();
