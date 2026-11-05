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
    
    // 10-Minute Booking Cancellation Window Rule:
    // A customer can cancel their order within the first 10 minutes of booking / order placement.
    const orderCreatedAt = new Date(order.created_at || order.createdAt);
    const now = new Date();
    const elapsedMinutes = (now.getTime() - orderCreatedAt.getTime()) / (1000 * 60);
    const isWithin10Minutes = elapsedMinutes <= 10;
    const minutesLeft = Math.max(0, Math.ceil(10 - elapsedMinutes));

    let canCancelDirectly = false;
    let requiresApproval = false;
    let eligible = false;
    let ineligibleReason = null;

    if (isCompleted) {
      ineligibleReason = 'Order has already been completed and cannot be cancelled.';
    } else if (isCancelled) {
      ineligibleReason = 'Order has already been cancelled.';
    } else if (isWithin10Minutes) {
      // Within the first 10 minutes of booking, the customer has guaranteed cancellation
      canCancelDirectly = true;
      eligible = true;
    } else if (order.order_status === 'NEW' || order.order_status === 'ACCEPTED') {
      // After 10 minutes, direct cancellation is closed; requires restaurant confirmation
      requiresApproval = true;
      eligible = true;
    } else if (['PREPARING', 'READY_FOR_PICKUP'].includes(order.order_status)) {
      requiresApproval = true;
      eligible = true;
    } else {
      ineligibleReason = `Order in status "${order.order_status}" cannot be cancelled. The 10-minute cancellation window has expired.`;
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
      requiresApproval,
      isWithin10Minutes,
      elapsedMinutes: Math.round(elapsedMinutes),
      minutesLeft,
      ineligibleReason,
      expectedRefundAmount: refundableAmount,
      refundEligibility: isPaid ? 'ELIGIBLE' : 'NOT_APPLICABLE',
      policyText: isWithin10Minutes 
        ? `Free cancellation available within the first 10 minutes of ordering (${minutesLeft} min left). Automated refund will be initiated.`
        : 'The 10-minute cancellation window has passed. Cancellation now requires restaurant approval.',
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
        initialStatus = 'FAILED';
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
        description: `Automated refund initiated for ₹${Number(refund.refund_amount).toFixed(2)}.`,
        timestamp: refund.created_at,
        completed: true
      });

      timeline.push({
        step: 4,
        title: 'Refund Processing',
        description: 'Gateway communicating with issuing bank.',
        timestamp: refund.created_at,
        completed: isRefundSuccess || isRefundProcessing
      });

      timeline.push({
        step: 5,
        title: isRefundFailed ? 'Refund Failed' : 'Refund Processed',
        description: isRefundSuccess
          ? 'Amount successfully refunded to original payment method.'
          : isRefundFailed
          ? 'Gateway encountered an error. Scheduled for manual review.'
          : 'Awaiting bank settlement (usually 5–7 working days).',
        timestamp: refund.completed_at || null,
        completed: isRefundSuccess,
        failed: isRefundFailed
      });
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
      refundStatus: refund ? (isRefundSuccess ? 'PROCESSED' : isRefundFailed ? 'FAILED' : 'PROCESSING') : 'NOT_APPLICABLE',
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
      if (st === 'SUCCESS' || st === 'PROCESSED') {
        successfullyRefunded++;
        totalRefundAmount += amt;
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
      const orderNumber = isFood ? r.food_orders.order_number : r.payments?.bookings?.booking_number || 'N/A';
      const customer = isFood ? r.food_orders.customer_name : r.payments?.bookings?.users?.name || 'Guest';
      const customerEmail = isFood ? r.food_orders.users?.email : r.payments?.bookings?.users?.email || 'N/A';
      const customerPhone = isFood ? r.food_orders.customer_phone : r.payments?.bookings?.users?.phone || 'N/A';
      const restaurant = isFood ? r.food_orders.cafes?.name : r.payments?.bookings?.cafes?.name || 'Venue';
      const originalAmount = isFood ? Number(r.food_orders.total_amount) : Number(r.payments?.amount || r.refund_amount);

      let cleanStatus = 'Processing';
      if (['SUCCESS', 'PROCESSED'].includes(r.refund_status)) cleanStatus = 'Processed';
      else if (r.refund_status === 'FAILED') cleanStatus = 'Failed';
      else if (r.refund_status === 'PENDING') cleanStatus = 'Pending';
      else if (r.refund_status === 'PARTIALLY_REFUNDED') cleanStatus = 'Partially Refunded';

      return {
        id: r.id,
        orderId: isFood ? r.food_orders.id : r.booking_id,
        orderNumber,
        isFoodOrder: isFood,
        customer,
        customerEmail,
        customerPhone,
        restaurant,
        originalAmount,
        refundAmount: Number(r.refund_amount),
        paymentId: r.payment_id,
        gatewayRefundId: r.razorpay_refund_id || r.provider_refund_id,
        refundStatus: cleanStatus,
        rawStatus: r.refund_status,
        reason: r.reason || 'Order cancellation refund',
        requestedDate: r.created_at,
        processedDate: r.completed_at || (cleanStatus === 'Processed' ? r.updated_at : null),
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
}

function gatewayRefundIdClean(id) {
  if (!id) return null;
  return String(id).trim();
}

module.exports = new OrderCancellationRefundService();

