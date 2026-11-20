const giftRewardService = require('./giftRewardService');
const prisma = require('../config/prisma');
const { getRazorpayInstance } = require('../config/razorpay');
const foodOrderEmailEvents = require('./email/foodOrderEmailEvents');
const notificationService = require('./notificationService');

class OrderCancellationRefundService {
  /**
   * Evaluates cancellation eligibility and refund expectation for a food order
   */
  async getCancellationPolicy(orderId, customerId) {
    const order = await prisma.food_orders.findUnique({
      where: { id: orderId },
      include: {
        cafes: { select: { id: true, name: true, address: true, city: true, owner_id: true } },
        payment_refunds: {
          include: { refund_timelines: { orderBy: { created_at: 'asc' } } },
          orderBy: { created_at: 'desc' }
        },
        order_cancellations: { orderBy: { created_at: 'desc' }, take: 1 }
      }
    });

    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (customerId && order.customer_id !== customerId) {
      const err = new Error('Unauthorized access to this order');
      err.statusCode = 403;
      throw err;
    }

    const isPaid = order.payment_status === 'PAID';
    const isCompleted = ['COMPLETED', 'DELIVERED'].includes(order.order_status);
    const isCancelled = ['CANCELLED', 'REJECTED'].includes(order.order_status);
    
    // 5-Minute Customer Order Cancellation Restriction Rule:
    // Customers can cancel an eligible order only within the first 5 minutes after successful order placement.
    // Order created at 10:00 AM -> cancellation allowed until 10:05 AM.
    const orderCreatedAt = new Date(order.created_at || order.createdAt);
    const cancellationDeadline = new Date(orderCreatedAt.getTime() + 5 * 60 * 1000);
    const now = new Date();
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - orderCreatedAt.getTime()) / 1000));
    const secondsRemaining = Math.max(0, Math.floor((cancellationDeadline.getTime() - now.getTime()) / 1000));
    const isWithin5Minutes = secondsRemaining > 0;
    const elapsedMinutes = elapsedSeconds / 60;
    const minutesLeft = Math.ceil(secondsRemaining / 60);

    let canCancelDirectly = false;
    let eligible = false;
    let ineligibleReason = null;

    if (isCompleted) {
      ineligibleReason = 'Order has already been completed and cannot be cancelled.';
    } else if (isCancelled) {
      ineligibleReason = 'Order has already been cancelled.';
    } else if (isWithin5Minutes) {
      // Within the first 5 minutes of order placement, customer cancellation is allowed
      canCancelDirectly = true;
      eligible = true;
    } else {
      ineligibleReason = 'Your 5-minute cancellation window has expired. Please contact support for assistance.';
    }

    const refundableAmount = isPaid ? Number(order.total_amount) : 0;

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      restaurantName: order.cafes?.name || 'Restaurant',
      orderStatus: order.order_status,
      paymentStatus: order.payment_status,
      totalAmount: Number(order.total_amount),
      isPaid,
      eligible,
      canCancelDirectly,
      requiresApproval: false,
      isWithin5Minutes,
      cancellationWindowMinutes: 5,
      createdAt: orderCreatedAt.toISOString(),
      cancellationDeadline: cancellationDeadline.toISOString(),
      serverTime: now.toISOString(),
      secondsRemaining,
      elapsedSeconds,
      elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
      minutesLeft,
      ineligibleReason,
      expectedRefundAmount: refundableAmount,
      refundEligibility: isPaid ? 'ELIGIBLE' : 'NOT_APPLICABLE',
      policyText: isWithin5Minutes 
        ? `Cancellation available for ${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')} more. Refund will be initiated.`
        : 'Your 5-minute cancellation window has ended. This order can no longer be cancelled through the customer app.',
      existingCancellation: order.order_cancellations?.[0] || null,
      existingRefund: order.payment_refunds?.[0] || null
    };
  }

  /**
   * Customer initiates cancellation
   */
  async requestCancellation(orderId, customerId, { reason, message }) {
    const policy = await this.getCancellationPolicy(orderId, customerId);

    if (!policy.eligible) {
      const err = new Error(policy.ineligibleReason || 'This order cannot be cancelled.');
      err.statusCode = 400;
      throw err;
    }

    if (policy.existingCancellation) {
      const err = new Error('A cancellation request already exists for this order.');
      err.statusCode = 400;
      throw err;
    }

    const order = await prisma.food_orders.findUnique({
      where: { id: orderId },
      include: {
        cafes: { select: { id: true, name: true, owner_id: true } },
        users: { select: { id: true, name: true, email: true, phone: true } }
      }
    });

    const cancellationReasonText = reason || 'Customer requested cancellation';
    const additionalMsgText = message || null;

    // Case 1: Direct cancellation (NEW or ACCEPTED)
    if (policy.canCancelDirectly) {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Update order status
        const updatedOrder = await tx.food_orders.update({
          where: { id: orderId },
          data: {
            order_status: 'CANCELLED',
            cancellation_reason: cancellationReasonText,
            updated_at: new Date()
          }
        });

        // 2. Create order_cancellations record
        const cancellationRecord = await tx.order_cancellations.create({
          data: {
            order_id: orderId,
            customer_id: customerId,
            cancellation_reason: cancellationReasonText,
            additional_message: additionalMsgText,
            cancellation_status: 'CANCELLED',
            requested_at: new Date(),
            approved_at: new Date(),
            cancelled_at: new Date(),
            approved_by: 'SYSTEM_POLICY'
          }
        });

        // 3. Record order status history
        await tx.order_status_history.create({
          data: {
            order_id: orderId,
            previous_status: order.order_status,
            new_status: 'CANCELLED',
            changed_by: order.customer_name || 'Customer',
            changed_by_user_id: customerId,
            note: `Cancelled by customer: ${cancellationReasonText}`
          }
        });

        // 4. Free driver if assigned
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

        return { updatedOrder, cancellationRecord };
      });

      // Notify Restaurant Owner
      if (order.cafes?.owner_id) {
        await notificationService.createUnifiedNotification({
          userId: order.cafes.owner_id,
          cafeId: order.cafe_id,
          orderId: order.id,
          category: 'FOOD_ORDER',
          priority: 'HIGH',
          type: 'ORDER_CANCELLED',
          title: `Order Cancelled – #${order.order_number}`,
          message: `Order #${order.order_number} has been cancelled by the customer (${cancellationReasonText}).`,
          metadata: { orderId: order.id, orderNumber: order.order_number, reason: cancellationReasonText }
        }).catch(err => console.error('[Notif Error]:', err.message));
      }

      // If order is paid, trigger automated refund
      let refundResult = null;
      if (order.payment_status === 'PAID') {
        refundResult = await this.executeAutomatedRefund(order, cancellationReasonText, 'CUSTOMER_DIRECT');
      }

      // Send cancellation emails (Owner + Customer)
      foodOrderEmailEvents.sendOrderCancelledEmail(orderId, cancellationReasonText, refundResult).catch(err => {
        console.error('[Email Error]:', err.message);
      });

      return {
        success: true,
        status: 'CANCELLED',
        message: 'Order has been cancelled successfully.',
        order: result.updatedOrder,
        cancellation: result.cancellationRecord,
        refund: refundResult
      };
    }

    // Case 2: Requires restaurant owner approval (PREPARING, READY_FOR_PICKUP)
    const pendingCancellation = await prisma.order_cancellations.create({
      data: {
        order_id: orderId,
        customer_id: customerId,
        cancellation_reason: cancellationReasonText,
        additional_message: additionalMsgText,
        cancellation_status: 'PENDING_APPROVAL',
        requested_at: new Date()
      }
    });

    // Notify Restaurant Owner to approve/reject
    if (order.cafes?.owner_id) {
      await notificationService.createUnifiedNotification({
        userId: order.cafes.owner_id,
        cafeId: order.cafe_id,
        orderId: order.id,
        category: 'FOOD_ORDER',
        priority: 'HIGH',
        type: 'ORDER_CANCELLATION_REQUESTED',
        title: `Cancellation Request – #${order.order_number}`,
        message: `Customer requested to cancel order #${order.order_number} which is currently ${order.order_status}. Please review and approve or reject.`,
        metadata: { orderId: order.id, cancellationId: pendingCancellation.id, reason: cancellationReasonText }
      }).catch(err => console.error('[Notif Error]:', err.message));
    }

    return {
      success: true,
      status: 'PENDING_APPROVAL',
      message: 'Cancellation request submitted for restaurant approval.',
      cancellation: pendingCancellation
    };
  }

  /**
   * Restaurant owner approves cancellation
   */
  async approveCancellation(orderId, ownerId) {
    const order = await prisma.food_orders.findUnique({
      where: { id: orderId },
      include: {
        cafes: true,
        order_cancellations: { orderBy: { created_at: 'desc' }, take: 1 }
      }
    });

    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.cafes?.owner_id !== ownerId) {
      const err = new Error('Unauthorized: You do not own this restaurant');
      err.statusCode = 403;
      throw err;
    }

    const cancellation = order.order_cancellations?.[0];
    if (!cancellation || cancellation.cancellation_status !== 'PENDING_APPROVAL') {
      const err = new Error('No pending cancellation request found for this order.');
      err.statusCode = 400;
      throw err;
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.food_orders.update({
        where: { id: orderId },
        data: {
          order_status: 'CANCELLED',
          cancellation_reason: cancellation.cancellation_reason,
          updated_at: new Date()
        }
      });

      const updatedCancellation = await tx.order_cancellations.update({
        where: { id: cancellation.id },
        data: {
          cancellation_status: 'APPROVED',
          approved_at: new Date(),
          cancelled_at: new Date(),
          approved_by: 'RESTAURANT_OWNER'
        }
      });

      await tx.order_status_history.create({
        data: {
          order_id: orderId,
          previous_status: order.order_status,
          new_status: 'CANCELLED',
          changed_by: 'Restaurant Owner',
          changed_by_user_id: ownerId,
          note: `Restaurant owner approved cancellation: ${cancellation.cancellation_reason}`
        }
      });

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

      return { updatedOrder, updatedCancellation };
    });

    // Automated refund if paid
    let refundResult = null;
    if (order.payment_status === 'PAID') {
      refundResult = await this.executeAutomatedRefund(order, cancellation.cancellation_reason, 'OWNER_APPROVED');
    }

    // Customer Notification
    await notificationService.createUnifiedNotification({
      userId: order.customer_id,
      orderId: order.id,
      category: 'FOOD_ORDER',
      priority: 'HIGH',
      type: 'CANCELLATION_APPROVED',
      title: `Cancellation Approved – #${order.order_number}`,
      message: `Your cancellation request for order #${order.order_number} has been approved by the restaurant.`,
      metadata: { orderId: order.id }
    }).catch(err => console.error('[Notif Error]:', err.message));

    foodOrderEmailEvents.sendOrderCancelledEmail(orderId, cancellation.cancellation_reason, refundResult).catch(err => {
      console.error('[Email Error]:', err.message);
    });

    // Reverse any associated gift reward
    giftRewardService.handleOrderCancelledOrRefunded(orderId, 'Order cancellation approved by restaurant').catch(() => null);

    return {
      success: true,
      message: 'Cancellation approved and processed.',
      order: result.updatedOrder,
      cancellation: result.updatedCancellation,
      refund: refundResult
    };
  }

  /**
   * Restaurant owner rejects cancellation
   */
  async rejectCancellation(orderId, ownerId, rejectionReason) {
    const order = await prisma.food_orders.findUnique({
      where: { id: orderId },
      include: {
        cafes: true,
        order_cancellations: { orderBy: { created_at: 'desc' }, take: 1 }
      }
    });

    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.cafes?.owner_id !== ownerId) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    const cancellation = order.order_cancellations?.[0];
    if (!cancellation || cancellation.cancellation_status !== 'PENDING_APPROVAL') {
      const err = new Error('No pending cancellation request found for this order.');
      err.statusCode = 400;
      throw err;
    }

    const updated = await prisma.order_cancellations.update({
      where: { id: cancellation.id },
      data: {
        cancellation_status: 'REJECTED',
        additional_message: rejectionReason ? `Rejected: ${rejectionReason}` : 'Rejected by restaurant',
        approved_by: 'RESTAURANT_OWNER'
      }
    });

    // Notify Customer
    await notificationService.createUnifiedNotification({
      userId: order.customer_id,
      orderId: order.id,
      category: 'FOOD_ORDER',
      priority: 'HIGH',
      type: 'CANCELLATION_REJECTED',
      title: `Cancellation Request Declined – #${order.order_number}`,
      message: `The restaurant was unable to cancel order #${order.order_number} as food preparation is already complete. Reason: ${rejectionReason || 'Food already prepared'}`,
      metadata: { orderId: order.id, rejectionReason }
    }).catch(err => console.error('[Notif Error]:', err.message));

    return {
      success: true,
      message: 'Cancellation request rejected.',
      cancellation: updated
    };
  }

  /**
   * Executes automated Razorpay refund for a food order
   */
  async executeAutomatedRefund(order, reason, initiatedBy = 'CUSTOMER') {
    const targetRefundAmount = Number(order.total_amount);
    if (!targetRefundAmount || targetRefundAmount <= 0) {
      return null;
    }

    // 1. Find matching payment record
    const payment = await prisma.payments.findFirst({
      where: {
        OR: [
          { gateway_order_id: order.order_number },
          { provider_order_id: order.order_number }
        ]
      },
      orderBy: { created_at: 'desc' }
    });

    if (!payment) {
      console.warn(`[RefundService] No payment row found for food order #${order.order_number}`);
      // Record internal pending refund for admin reconciliation
      const fallbackPayment = await prisma.payments.create({
        data: {
          amount: order.total_amount,
          payment_gateway: 'RAZORPAY',
          payment_provider: 'RAZORPAY',
          gateway_order_id: order.order_number,
          status: 'SUCCESS',
          payment_method: 'ONLINE'
        }
      });
      return this._createDatabaseRefund({
        paymentId: fallbackPayment.id,
        orderId: order.id,
        amount: targetRefundAmount,
        reason,
        initiatedBy,
        status: 'PENDING',
        timelineStatus: 'Refund Requested',
        timelineDesc: 'Refund record queued. Verifying gateway payment reference.'
      });
    }

    // 2. Prevent duplicate refund
    const existingSuccessfulRefund = await prisma.payment_refunds.findFirst({
      where: {
        payment_id: payment.id,
        refund_status: { in: ['SUCCESS', 'PROCESSED'] }
      }
    });

    if (existingSuccessfulRefund) {
      console.warn(`[RefundService] Payment ${payment.id} already has completed refund ${existingSuccessfulRefund.id}`);
      return existingSuccessfulRefund;
    }

    // 3. Initiate with Razorpay Gateway
    let gatewayRefundId = null;
    let initialStatus = 'PROCESSING';
    const razorpay = getRazorpayInstance();
    const rzpPaymentId = payment.gateway_payment_id || payment.provider_payment_id;

    if (rzpPaymentId && razorpay && typeof razorpay.payments?.refund === 'function') {
      try {
        console.log(`[RefundService] Calling Razorpay Refund API on payment: ${rzpPaymentId} for ₹${targetRefundAmount}`);
        const rzpRefund = await razorpay.payments.refund(rzpPaymentId, {
          amount: Math.round(targetRefundAmount * 100),
          notes: {
            order_id: order.id,
            order_number: order.order_number,
            reason: reason || 'Grab2GO food order cancellation'
          }
        });
        gatewayRefundId = rzpRefund.id;
        console.log(`[RefundService] Razorpay refund API success: ${rzpRefund.id}, status: ${rzpRefund.status}`);
        if (rzpRefund.status === 'processed') {
          initialStatus = 'PROCESSED';
        }
      } catch (rzpErr) {
        console.error('[RefundService] Razorpay refund API failed:', rzpErr.message);
        // If live gateway returns 403 or unavailable, keep status in PROCESSING for queue/manual review or test fallback
        initialStatus = 'PROCESSING';
      }
    } else {
      console.warn('[RefundService] No live rzpPaymentId found on payment record. Queuing for processing.');
    }

    // 4. Create refund record in DB
    const dbRefund = await this._createDatabaseRefund({
      paymentId: payment.id,
      orderId: order.id,
      amount: targetRefundAmount,
      reason,
      initiatedBy,
      status: initialStatus,
      razorpayRefundId: gatewayRefundId,
      timelineStatus: initialStatus === 'PROCESSED' ? 'Refund Processed' : initialStatus === 'FAILED' ? 'Refund Failed' : 'Refund Initiated',
      timelineDesc: initialStatus === 'PROCESSED'
        ? `Refund of ₹${targetRefundAmount.toFixed(2)} processed by gateway. Reference: ${gatewayRefundId}`
        : initialStatus === 'FAILED'
        ? 'Gateway refund request could not be completed automatically. Scheduled for manual resolution.'
        : `Refund of ₹${targetRefundAmount.toFixed(2)} initiated with Razorpay gateway.`
    });

    // 4B. Update central payment status to REFUNDED and void / reverse any vendor payment splits!
    // A cancelled order is not settled to the restaurant.
    try {
      await prisma.payments.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          updated_at: new Date()
        }
      });

      await prisma.payment_splits.updateMany({
        where: { payment_id: payment.id },
        data: {
          transfer_status: 'REVERSED',
          settlement_status: 'REVERSED',
          updated_at: new Date()
        }
      });
      console.log(`[RefundService] Marked payment ${payment.id} as REFUNDED and vendor payment_splits as REVERSED.`);
    } catch (payUpErr) {
      console.error('[RefundService] Error updating payment and splits on refund:', payUpErr.message);
    }

    // 5. Send automated refund initiated email to customer
    if (initialStatus === 'PROCESSED') {
      foodOrderEmailEvents.sendRefundProcessedEmail(order.id, dbRefund).catch(e => console.error(e));
    } else if (initialStatus === 'PROCESSING') {
      foodOrderEmailEvents.sendRefundInitiatedEmail(order.id, dbRefund).catch(e => console.error(e));
    } else if (initialStatus === 'FAILED') {
      foodOrderEmailEvents.sendRefundFailedEmail(order.id, dbRefund).catch(e => console.error(e));
    }

    return dbRefund;
  }

  /**
   * Helper to write payment_refunds and initial timeline
   */
  async _createDatabaseRefund({
    paymentId,
    orderId,
    amount,
    reason,
    initiatedBy,
    status,
    razorpayRefundId = null,
    timelineStatus,
    timelineDesc
  }) {
    const refundRef = razorpayRefundId || `RFND_${orderId ? orderId.substring(0, 8) : Date.now()}_${Date.now()}`;

    const refund = await prisma.payment_refunds.create({
      data: {
        payment_id: paymentId,
        order_id: orderId,
        refund_amount: amount,
        razorpay_refund_id: gatewayRefundIdClean(razorpayRefundId),
        provider_refund_id: refundRef,
        refund_status: status === 'PROCESSED' ? 'SUCCESS' : status,
        reason,
        initiated_by: initiatedBy,
        completed_at: status === 'PROCESSED' ? new Date() : null
      }
    });

    // Record Timelines
    await prisma.refund_timelines.create({
      data: {
        refund_id: refund.id,
        status: 'Order Cancellation Confirmed',
        description: 'Customer order cancelled according to cancellation policy.',
        gateway_event_id: 'CANCELLATION_CONFIRMED'
      }
    });

    await prisma.refund_timelines.create({
      data: {
        refund_id: refund.id,
        status: timelineStatus,
        description: timelineDesc,
        gateway_event_id: razorpayRefundId || 'INITIATED'
      }
    });

    return refund;
  }

  /**
   * Fetch customer refund details for visual tracking
   */
  async getOrderRefundTracking(orderId, customerId) {
    const order = await prisma.food_orders.findUnique({
      where: { id: orderId },
      include: {
        cafes: { select: { id: true, name: true, address: true, city: true } },
        order_cancellations: { orderBy: { created_at: 'desc' }, take: 1 },
        payment_refunds: {
          include: {
            refund_timelines: { orderBy: { created_at: 'asc' } },
            payments: true
          },
          orderBy: { created_at: 'desc' }
        }
      }
    });

    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (customerId && order.customer_id !== customerId) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    const cancellation = order.order_cancellations?.[0] || null;
    const refund = order.payment_refunds?.[0] || null;
    const payment = refund?.payments || null;

    // Timeline construction
    const timeline = [];
    if (cancellation) {
      timeline.push({
        step: 1,
        title: 'Order Cancellation Requested',
        description: `Reason: ${cancellation.cancellation_reason}`,
        timestamp: cancellation.requested_at,
        completed: true
      });

      timeline.push({
        step: 2,
        title: cancellation.cancellation_status === 'REJECTED' ? 'Cancellation Rejected' : 'Cancellation Confirmed',
        description: cancellation.cancellation_status === 'REJECTED'
          ? cancellation.additional_message || 'Rejected by restaurant'
          : 'Cancellation approved by policy/restaurant.',
        timestamp: cancellation.approved_at || cancellation.cancelled_at,
        completed: ['APPROVED', 'CANCELLED'].includes(cancellation.cancellation_status),
        failed: cancellation.cancellation_status === 'REJECTED'
      });
    }

    const isRefundSuccess = refund?.refund_status === 'SUCCESS' || refund?.refund_status === 'PROCESSED';
    const isRefundProcessing = refund?.refund_status === 'PENDING' || refund?.refund_status === 'PROCESSING';
    const isRefundFailed = refund?.refund_status === 'FAILED';

    if (refund) {
      timeline.push({
        step: 3,
        title: 'Refund Initiated',
        description: `Refund initiated for ₹${Number(refund.refund_amount).toFixed(2)}.`,
        timestamp: refund.created_at,
        completed: true
      });

      if (isRefundFailed) {
        timeline.push({
          step: 4,
          title: 'Refund Under Gateway Review',
          description: 'Gateway encountered a settlement delay. Scheduled for manual resolution & bank credit.',
          timestamp: refund.updated_at || refund.created_at,
          completed: false,
          failed: true
        });
      } else {
        timeline.push({
          step: 4,
          title: 'Refund Processing',
          description: 'Gateway communicating with issuing bank.',
          timestamp: refund.created_at,
          completed: isRefundSuccess || isRefundProcessing
        });

        timeline.push({
          step: 5,
          title: 'Refund Credited',
          description: isRefundSuccess
            ? 'Amount successfully credited to original payment method, confirmed by gateway.'
            : 'Awaiting bank credit confirmation (usually 5–7 working days).',
          timestamp: refund.completed_at || null,
          completed: isRefundSuccess,
          failed: false
        });
      }
    }

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      restaurantName: order.cafes?.name || 'Restaurant',
      originalPaymentAmount: Number(order.total_amount),
      refundAmount: refund ? Number(refund.refund_amount) : 0,
      paymentMethod: payment?.payment_method || 'Online (Razorpay)',
      paymentStatus: order.payment_status,
      orderStatus: order.order_status,
      cancellationDate: cancellation?.cancelled_at || cancellation?.requested_at || order.updated_at,
      cancellationReason: cancellation?.cancellation_reason || order.cancellation_reason,
      refundId: refund?.provider_refund_id || refund?.razorpay_refund_id || null,
      gatewayRefundId: refund?.razorpay_refund_id || null,
      refundStatus: refund ? (isRefundSuccess ? 'CREDITED' : isRefundFailed ? 'FAILED' : 'PROCESSING') : 'NOT_APPLICABLE',
      timeline,
      customTimelines: refund?.refund_timelines || []
    };
  }

  /**
   * Admin: Get comprehensive refund statistics & list
   */
  async getAdminRefundManagement({ status, search, page = 1, limit = 50 }) {
    const where = {};

    if (status && status !== 'All') {
      if (status === 'Pending') where.refund_status = 'PENDING';
      else if (status === 'Processing') where.refund_status = 'PROCESSING';
      else if (status === 'Processed' || status === 'Success') where.refund_status = { in: ['SUCCESS', 'PROCESSED'] };
      else if (status === 'Failed') where.refund_status = 'FAILED';
      else if (status === 'Partially Refunded') where.refund_status = 'PARTIALLY_REFUNDED';
    }

    const [allRefunds, totalCount, statsAgg] = await Promise.all([
      prisma.payment_refunds.findMany({
        where,
        include: {
          bookings: {
            include: { users: true, cafes: true }
          },
          payments: {
            include: {
              bookings: { include: { users: true, cafes: true } }
            }
          },
          food_orders: {
            include: {
              users: true,
              cafes: true,
              order_cancellations: { take: 1, orderBy: { created_at: 'desc' } }
            }
          },
          refund_timelines: { orderBy: { created_at: 'desc' } }
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.payment_refunds.count({ where }),
      prisma.payment_refunds.findMany({
        select: { refund_amount: true, refund_status: true }
      })
    ]);

    // Statistics Calculation
    let totalRefundRequests = statsAgg.length;
    let totalRefundAmount = 0;
    let pendingRefunds = 0;
    let processingRefunds = 0;
    let successfullyRefunded = 0;
    let failedRefunds = 0;

    statsAgg.forEach(r => {
      const amt = Number(r.refund_amount || 0);
      const st = (r.refund_status || '').toUpperCase();
      totalRefundAmount += amt;
      if (st === 'SUCCESS' || st === 'PROCESSED') {
        successfullyRefunded++;
      } else if (st === 'PENDING') {
        pendingRefunds++;
      } else if (st === 'PROCESSING') {
        processingRefunds++;
      } else if (st === 'FAILED') {
        failedRefunds++;
      }
    });

    const mappedRefunds = allRefunds.map(r => {
      const isFood = Boolean(r.food_orders);
      const bookingData = r.bookings || r.payments?.bookings || null;
      const orderNumber = isFood ? r.food_orders.order_number : bookingData?.booking_number || 'N/A';
      const customer = isFood ? r.food_orders.customer_name : bookingData?.users?.name || 'Guest Diner';
      const customerEmail = isFood ? r.food_orders.users?.email : bookingData?.users?.email || 'N/A';
      const customerPhone = isFood ? r.food_orders.customer_phone : bookingData?.users?.phone || 'N/A';
      const restaurant = isFood ? r.food_orders.cafes?.name : bookingData?.cafes?.name || 'Cafe & Venue';
      const originalAmount = isFood ? Number(r.food_orders.total_amount) : Number(bookingData?.total || r.payments?.amount || r.refund_amount);

      let cleanStatus = 'Processing';
      if (['SUCCESS', 'PROCESSED'].includes(r.refund_status)) cleanStatus = 'Processed';
      else if (r.refund_status === 'FAILED') cleanStatus = 'Failed';
      else if (r.refund_status === 'PENDING') cleanStatus = 'Pending';
      else if (r.refund_status === 'PARTIALLY_REFUNDED') cleanStatus = 'Partially Refunded';

      return {
        id: r.id,
        type: isFood ? 'FOOD' : 'CAFE',
        orderId: isFood ? r.food_orders.id : null,
        orderNumber,
        booking: orderNumber,
        order_number: orderNumber,
        isFoodOrder: isFood,
        order_id: r.order_id,
        booking_id: r.booking_id,
        customer,
        customerEmail,
        customer_email: customerEmail,
        customerPhone,
        customer_phone: customerPhone,
        restaurant,
        cafe: restaurant,
        originalAmount,
        original_amount: originalAmount,
        refundAmount: Number(r.refund_amount),
        amount: Number(r.refund_amount),
        paymentId: r.payment_id,
        payment_id: r.payment_id,
        gatewayRefundId: r.razorpay_refund_id || r.provider_refund_id,
        gateway_refund_id: r.razorpay_refund_id || r.provider_refund_id,
        status: cleanStatus,
        refundStatus: cleanStatus,
        rawStatus: r.refund_status,
        reason: r.reason || 'Order cancellation refund',
        requestedDate: r.created_at,
        requested_date: r.created_at,
        processedDate: r.completed_at || (cleanStatus === 'Processed' ? r.updated_at : null),
        processed_date: r.completed_at || (cleanStatus === 'Processed' ? r.updated_at : null),
        timelines: r.refund_timelines
      };
    });

    return {
      stats: {
        totalRefundRequests,
        totalRefundAmount,
        pendingRefunds,
        processingRefunds,
        successfullyRefunded,
        failedRefunds
      },
      refunds: mappedRefunds,
      total: totalCount,
      page,
      limit
    };
  }

  /**
   * Admin: Retry a failed refund safely
   */
  async retryRefund(refundId, adminUser) {
    const refund = await prisma.payment_refunds.findUnique({
      where: { id: refundId },
      include: {
        payments: true,
        food_orders: true
      }
    });

    if (!refund) {
      const err = new Error('Refund record not found');
      err.statusCode = 404;
      throw err;
    }

    if (refund.refund_status === 'SUCCESS' || refund.refund_status === 'PROCESSED') {
      const err = new Error('This refund has already been processed successfully.');
      err.statusCode = 400;
      throw err;
    }

    const payment = refund.payments;
    const rzpPaymentId = payment?.gateway_payment_id || payment?.provider_payment_id;
    if (!rzpPaymentId) {
      const err = new Error('No gateway payment ID recorded for this payment.');
      err.statusCode = 400;
      throw err;
    }

    const razorpay = getRazorpayInstance();
    let rzpRefund;
    try {
      rzpRefund = await razorpay.payments.refund(rzpPaymentId, {
        amount: Math.round(Number(refund.refund_amount) * 100),
        notes: {
          retry_by: adminUser?.name || 'Admin',
          refund_id: refund.id
        }
      });
    } catch (rzpErr) {
      await prisma.refund_timelines.create({
        data: {
          refund_id: refund.id,
          status: 'Retry Failed',
          description: `Admin retry attempt failed: ${rzpErr.message}`,
          gateway_event_id: 'RETRY_FAILED'
        }
      });
      const err = new Error(`Razorpay retry failed: ${rzpErr.message}`);
      err.statusCode = 400;
      throw err;
    }

    const isProcessed = rzpRefund.status === 'processed';
    const updated = await prisma.payment_refunds.update({
      where: { id: refund.id },
      data: {
        razorpay_refund_id: rzpRefund.id,
        provider_refund_id: rzpRefund.id,
        refund_status: isProcessed ? 'SUCCESS' : 'PROCESSING',
        completed_at: isProcessed ? new Date() : null,
        updated_at: new Date()
      }
    });

    await prisma.refund_timelines.create({
      data: {
        refund_id: refund.id,
        status: isProcessed ? 'Refund Processed' : 'Refund Re-Initiated',
        description: `Admin ${adminUser?.name || 'Admin'} successfully retried gateway refund. Reference: ${rzpRefund.id}`,
        gateway_event_id: rzpRefund.id
      }
    });

    if (refund.order_id && isProcessed) {
      foodOrderEmailEvents.sendRefundProcessedEmail(refund.order_id, updated).catch(e => console.error(e));
    }

    return {
      success: true,
      message: 'Refund retried successfully',
      refund: updated
    };
  }

  /**
   * Admin: Manually approve / complete a refund that was settled offline or directly confirmed
   */
  async approveAdminRefund(refundId, adminUser) {
    const refund = await prisma.payment_refunds.findFirst({
      where: {
        OR: [
          { id: String(refundId) },
          { payment_id: String(refundId) },
          { order_id: String(refundId) }
        ]
      },
      include: {
        payments: true,
        food_orders: true
      }
    });

    if (!refund) {
      const err = new Error('Refund record not found');
      err.statusCode = 404;
      throw err;
    }

    if (refund.refund_status === 'SUCCESS' || refund.refund_status === 'PROCESSED') {
      return {
        success: true,
        message: 'This refund has already been completed.',
        refund
      };
    }

    const updated = await prisma.payment_refunds.update({
      where: { id: refund.id },
      data: {
        refund_status: 'SUCCESS',
        completed_at: new Date(),
        updated_at: new Date()
      }
    });

    // Update payment record status if applicable
    if (refund.payment_id) {
      await prisma.payments.update({
        where: { id: refund.payment_id },
        data: { status: 'REFUNDED', updated_at: new Date() }
      }).catch(() => {});
    }

    // Update food order payment_status if applicable
    if (refund.order_id) {
      await prisma.food_orders.update({
        where: { id: refund.order_id },
        data: { payment_status: 'REFUNDED', updated_at: new Date() }
      }).catch(() => {});
    }

    await prisma.refund_timelines.create({
      data: {
        refund_id: refund.id,
        status: 'Refund Credited',
        description: `Refund completed and marked as credited by Administrator (${adminUser?.name || 'Admin'}).`,
        gateway_event_id: 'MANUAL_APPROVAL'
      }
    });

    if (refund.order_id) {
      foodOrderEmailEvents.sendRefundProcessedEmail(refund.order_id, updated).catch(e => console.error(e));
    }

    return {
      success: true,
      message: 'Refund marked as completed successfully',
      refund: updated
    };
  }

  /**
   * Cafe Owner: Get refund requests for this owner's cafes
   * Includes order details, customer details, ordered items, payment method, requested amount, cancellation reason and real-time status.
   */
  async getCafeRefundRequests(ownerId, { status, search, page = 1, limit = 50 } = {}) {
    // 1. Find all cafes owned by this user
    const ownedCafes = await prisma.cafes.findMany({
      where: { owner_id: ownerId },
      select: { id: true, name: true }
    });
    const ownedCafeIds = ownedCafes.map(c => c.id);

    if (ownedCafeIds.length === 0) {
      return {
        requests: [],
        pagination: { total: 0, page, limit, totalPages: 0 }
      };
    }

    // 2. Build where filter for food_orders that have cancellations or refunds
    const where = {
      cafe_id: { in: ownedCafeIds },
      OR: [
        { order_cancellations: { some: {} } },
        { payment_refunds: { some: {} } },
        { order_status: { in: ['CANCELLED', 'REJECTED'] } }
      ]
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.AND = [
        {
          OR: [
            { order_number: { contains: q, mode: 'insensitive' } },
            { customer_name: { contains: q, mode: 'insensitive' } },
            { customer_phone: { contains: q, mode: 'insensitive' } }
          ]
        }
      ];
    }

    const skip = (page - 1) * limit;

    const [orders, totalOrders] = await Promise.all([
      prisma.food_orders.findMany({
        where,
        include: {
          cafes: { select: { id: true, name: true } },
          users: { select: { id: true, name: true, email: true, phone: true } },
          order_items: {
            include: {
              menu_item: { select: { name: true, price: true } }
            }
          },
          order_cancellations: {
            orderBy: { created_at: 'desc' }
          },
          payment_refunds: {
            include: {
              refund_timelines: { orderBy: { created_at: 'desc' } },
              payments: true
            },
            orderBy: { created_at: 'desc' }
          }
        },
        orderBy: { updated_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.food_orders.count({ where })
    ]);

    // Format requests with standard status lifecycle
    // Standard Statuses: REQUESTED, UNDER_REVIEW, APPROVED, REJECTED, REFUND_PROCESSING, REFUNDED, REFUND_FAILED
    const requests = orders.map(o => {
      const cancellation = o.order_cancellations?.[0] || null;
      const refund = o.payment_refunds?.[0] || null;
      const payment = refund?.payments || null;

      let refundStatus = 'REQUESTED';

      if (cancellation?.cancellation_status === 'REJECTED') {
        refundStatus = 'REJECTED';
      } else if (refund) {
        const rawStatus = (refund.refund_status || '').toUpperCase();
        if (['SUCCESS', 'PROCESSED', 'COMPLETED'].includes(rawStatus)) {
          refundStatus = 'REFUNDED';
        } else if (rawStatus === 'FAILED') {
          refundStatus = 'REFUND_FAILED';
        } else if (['PROCESSING', 'PENDING'].includes(rawStatus)) {
          refundStatus = 'REFUND_PROCESSING';
        } else {
          refundStatus = 'UNDER_REVIEW';
        }
      } else if (cancellation?.cancellation_status === 'APPROVED') {
        refundStatus = 'APPROVED';
      } else if (cancellation?.cancellation_status === 'PENDING_APPROVAL') {
        refundStatus = 'REQUESTED';
      } else if (o.order_status === 'CANCELLED') {
        refundStatus = o.payment_status === 'PAID' ? 'REFUND_PROCESSING' : 'APPROVED';
      }

      return {
        id: cancellation?.id || refund?.id || o.id,
        refundRequestId: cancellation?.id || refund?.id || `REQ_${o.id.substring(0, 8)}`,
        orderId: o.id,
        orderNumber: o.order_number,
        cafeId: o.cafe_id,
        cafeName: o.cafes?.name || 'Restaurant',
        customerName: o.customer_name || o.users?.name || 'Guest Customer',
        customerPhone: o.customer_phone || o.users?.phone || 'N/A',
        customerEmail: o.users?.email || 'N/A',
        totalOrderAmount: Number(o.total_amount),
        refundRequestedAmount: Number(refund?.refund_amount || o.total_amount),
        paymentMethod: o.payment_method || payment?.payment_method || (o.payment_status === 'PAID' ? 'ONLINE' : 'UNPAID'),
        paymentStatus: o.payment_status,
        orderStatus: o.order_status,
        cancellationReason: cancellation?.cancellation_reason || o.cancellation_reason || 'Customer refund requested',
        rejectionReason: cancellation?.cancellation_status === 'REJECTED' ? cancellation?.additional_message : null,
        additionalNotes: cancellation?.additional_message || null,
        refundStatus, // Standard status
        gatewayRefundId: refund?.razorpay_refund_id || refund?.provider_refund_id || null,
        requestDate: cancellation?.requested_at || cancellation?.created_at || o.created_at,
        approvedDate: cancellation?.approved_at || refund?.created_at || null,
        completedDate: refund?.completed_at || null,
        items: (o.order_items || []).map(item => ({
          id: item.id,
          name: item.item_name_snapshot || item.menu_item?.name || 'Item',
          quantity: item.quantity,
          price: Number(item.unit_price || item.menu_item?.price || 0),
          lineTotal: Number(item.line_total || 0)
        })),
        canApprove: cancellation?.cancellation_status === 'PENDING_APPROVAL' || (refundStatus === 'REQUESTED' && o.order_status !== 'CANCELLED'),
        canReject: cancellation?.cancellation_status === 'PENDING_APPROVAL' || (refundStatus === 'REQUESTED' && o.order_status !== 'CANCELLED')
      };
    });

    // Apply status filter if provided
    let filteredRequests = requests;
    if (status && status !== 'ALL') {
      filteredRequests = requests.filter(r => r.refundStatus.toUpperCase() === status.toUpperCase());
    }

    return {
      requests: filteredRequests,
      pagination: {
        total: totalOrders,
        page,
        limit,
        totalPages: Math.ceil(totalOrders / limit)
      }
    };
  }
}

function gatewayRefundIdClean(id) {
  if (!id) return null;
  return String(id).trim();
}

module.exports = new OrderCancellationRefundService();

