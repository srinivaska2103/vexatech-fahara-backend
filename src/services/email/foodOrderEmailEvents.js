/**
 * Grab2Go Food Order Email Events Service
 * Central dispatcher for the 7 lifecycle events.
 */

const prisma = require('../../config/prisma');
const queue = require('./foodOrderEmailQueue');
const templates = require('./foodOrderEmailTemplates');

class FoodOrderEmailEvents {
  /**
   * Helper: Resolve full order with relations
   */
  async getFullOrder(orderId) {
    if (!orderId) return null;
    return prisma.food_orders.findUnique({
      where: { id: orderId },
      include: {
        cafes: {
          include: {
            users: true // cafe owner account
          }
        },
        users: true, // customer account
        order_items: true,
        assigned_employee: true
      }
    });
  }

  /**
   * 1. EMAIL 1 – NEW ORDER RECEIVED (To: Restaurant Owner & Customer Confirmation)
   */
  async sendNewOrderEmail(orderId) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      // 1A. Owner notification
      const ownerEmail = order.cafes?.users?.email;
      if (ownerEmail) {
        const ownerEventKey = `order:${order.id}:created:owner`;
        const ownerContent = templates.getNewOrderOwnerEmail(
          order,
          order.cafes.users,
          process.env.CAFE_PORTAL_URL || 'https://cafe.fahara.in/owner/orders'
        );

        await queue.enqueue({
          eventKey: ownerEventKey,
          orderId: order.id,
          recipientEmail: ownerEmail,
          recipientType: 'OWNER',
          notificationType: 'NEW_ORDER',
          subject: ownerContent.subject,
          html: ownerContent.html,
          text: ownerContent.text
        });
      }

      // 1B. Customer Order Confirmation
      const customerEmail = order.users?.email;
      if (customerEmail) {
        const custEventKey = `order:${order.id}:created:customer`;
        const custContent = templates.getNewOrderCustomerConfirmationEmail(
          order,
          `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`
        );

        await queue.enqueue({
          eventKey: custEventKey,
          orderId: order.id,
          recipientEmail: customerEmail,
          recipientType: 'CUSTOMER',
          notificationType: 'ORDER_CONFIRMATION',
          subject: custContent.subject,
          html: custContent.html,
          text: custContent.text
        });
      }
    } catch (err) {
      console.error('[sendNewOrderEmail Error]:', err.message);
    }
  }

  /**
   * 2. EMAIL 2 – PAYMENT SUCCESSFUL (To: Restaurant Owner & Customer Receipt)
   */
  async sendPaymentSuccessEmail(orderId, paymentData = null) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      // 2A. Owner notification
      const ownerEmail = order.cafes?.users?.email;
      if (ownerEmail) {
        const ownerEventKey = `order:${order.id}:payment-paid:owner`;
        const ownerContent = templates.getPaymentSuccessfulOwnerEmail({
          order,
          payment: paymentData,
          portalUrl: process.env.CAFE_PORTAL_URL || 'https://cafe.fahara.in/owner/orders'
        });

        await queue.enqueue({
          eventKey: ownerEventKey,
          orderId: order.id,
          recipientEmail: ownerEmail,
          recipientType: 'OWNER',
          notificationType: 'PAYMENT_SUCCESS',
          subject: ownerContent.subject,
          html: ownerContent.html,
          text: ownerContent.text
        });
      }

      // 2B. Customer payment receipt
      const customerEmail = order.users?.email;
      if (customerEmail) {
        const custEventKey = `order:${order.id}:payment-paid:customer`;
        const custContent = templates.getPaymentSuccessfulCustomerEmail({
          order,
          payment: paymentData,
          trackingUrl: `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`
        });

        await queue.enqueue({
          eventKey: custEventKey,
          orderId: order.id,
          recipientEmail: customerEmail,
          recipientType: 'CUSTOMER',
          notificationType: 'PAYMENT_RECEIPT',
          subject: custContent.subject,
          html: custContent.html,
          text: custContent.text
        });
      }
    } catch (err) {
      console.error('[sendPaymentSuccessEmail Error]:', err.message);
    }
  }

  /**
   * 3. EMAIL 3 – ORDER PREPARATION STARTED (To: Customer)
   */
  async sendPreparationStartedEmail(orderId) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      const customerEmail = order.users?.email;
      if (!customerEmail) return;

      const eventKey = `order:${order.id}:preparing:customer`;
      const emailContent = templates.getPreparationStartedCustomerEmail(
        order,
        order.users,
        `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`
      );

      await queue.enqueue({
        eventKey,
        orderId: order.id,
        recipientEmail: customerEmail,
        recipientType: 'CUSTOMER',
        notificationType: 'PREPARING',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });
    } catch (err) {
      console.error('[sendPreparationStartedEmail Error]:', err.message);
    }
  }

  /**
   * 4. EMAIL 4 – ORDER READY (To: Customer)
   */
  async sendOrderReadyEmail(orderId) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      const customerEmail = order.users?.email;
      if (!customerEmail) return;

      const eventKey = `order:${order.id}:ready:customer`;
      const emailContent = templates.getOrderReadyCustomerEmail(
        order,
        order.users,
        `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`
      );

      await queue.enqueue({
        eventKey,
        orderId: order.id,
        recipientEmail: customerEmail,
        recipientType: 'CUSTOMER',
        notificationType: 'ORDER_READY',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });
    } catch (err) {
      console.error('[sendOrderReadyEmail Error]:', err.message);
    }
  }

  /**
   * 5. EMAIL 5 – DELIVERY EMPLOYEE ASSIGNED (To: Customer)
   */
  async sendDeliveryAssignedEmail(orderId, employeeId) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      const customerEmail = order.users?.email;
      if (!customerEmail) return;

      const employee = order.assigned_employee || await prisma.delivery_employees.findUnique({
        where: { id: employeeId }
      });

      const eventKey = `order:${order.id}:delivery-assigned:${employeeId}:customer`;
      const emailContent = templates.getDeliveryAssignedCustomerEmail({
        order,
        employee,
        trackingUrl: `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`
      });

      await queue.enqueue({
        eventKey,
        orderId: order.id,
        recipientEmail: customerEmail,
        recipientType: 'CUSTOMER',
        notificationType: 'DELIVERY_ASSIGNED',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });
    } catch (err) {
      console.error('[sendDeliveryAssignedEmail Error]:', err.message);
    }
  }

  /**
   * 5B. EMAIL 5B – ORDER COMPLETED (To: Customer)
   */
  async sendOrderCompletedEmail(orderId) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      const customerEmail = order.users?.email;
      if (!customerEmail) return;

      const eventKey = `order:${order.id}:completed:customer`;
      const emailContent = templates.getOrderCompletedCustomerEmail(
        order,
        `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`
      );

      await queue.enqueue({
        eventKey,
        orderId: order.id,
        recipientEmail: customerEmail,
        recipientType: 'CUSTOMER',
        notificationType: 'ORDER_COMPLETED',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });
    } catch (err) {
      console.error('[sendOrderCompletedEmail Error]:', err.message);
    }
  }

  /**
   * 6. EMAIL 6 – ORDER CANCELLED (To: Restaurant Owner & Customer Confirmation)
   */
  async sendOrderCancelledEmail(orderId, reason = null, refundInfo = null) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      // 6A. Owner notification
      const ownerEmail = order.cafes?.users?.email;
      if (ownerEmail) {
        const eventKey = `order:${order.id}:cancelled:owner`;
        const emailContent = templates.getOrderCancelledOwnerEmail({
          order,
          reason,
          portalUrl: process.env.CAFE_PORTAL_URL || 'https://cafe.fahara.in/owner/orders'
        });

        await queue.enqueue({
          eventKey,
          orderId: order.id,
          recipientEmail: ownerEmail,
          recipientType: 'OWNER',
          notificationType: 'ORDER_CANCELLED',
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text
        });
      }

      // 6B. Customer cancellation confirmation
      const customerEmail = order.users?.email;
      if (customerEmail) {
        const custEventKey = `order:${order.id}:cancelled:customer`;
        const emailContent = templates.getOrderCancelledCustomerEmail({
          order,
          reason,
          isRefundEligible: order.payment_status === 'PAID' || Boolean(refundInfo),
          refundAmount: refundInfo?.refund_amount || Number(order.total_amount),
          trackingUrl: `${process.env.CUSTOMER_APP_URL || 'https://fahara.in'}/customer/orders/${order.id}`
        });

        await queue.enqueue({
          eventKey: custEventKey,
          orderId: order.id,
          recipientEmail: customerEmail,
          recipientType: 'CUSTOMER',
          notificationType: 'ORDER_CANCELLED_CONFIRMATION',
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text
        });
      }
    } catch (err) {
      console.error('[sendOrderCancelledEmail Error]:', err.message);
    }
  }

  /**
   * 7. EMAIL 7 – REFUND NOTIFICATIONS (To: Customer)
   */
  async sendRefundInitiatedEmail(orderId, refundData = null) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      const customerEmail = order.users?.email;
      if (!customerEmail) return;

      const refId = refundData?.id || refundData?.provider_refund_id || 'init';
      const eventKey = `order:${order.id}:refund-initiated:${refId}:customer`;
      const emailContent = templates.getRefundCustomerEmail({
        type: 'INITIATED',
        order,
        refund: refundData
      });

      await queue.enqueue({
        eventKey,
        orderId: order.id,
        recipientEmail: customerEmail,
        recipientType: 'CUSTOMER',
        notificationType: 'REFUND_INITIATED',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });
    } catch (err) {
      console.error('[sendRefundInitiatedEmail Error]:', err.message);
    }
  }

  async sendRefundProcessedEmail(orderId, refundData = null) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      const customerEmail = order.users?.email;
      if (!customerEmail) return;

      const refId = refundData?.id || refundData?.provider_refund_id || 'proc';
      const eventKey = `order:${order.id}:refund-processed:${refId}:customer`;
      const emailContent = templates.getRefundCustomerEmail({
        type: 'PROCESSED',
        order,
        refund: refundData
      });

      await queue.enqueue({
        eventKey,
        orderId: order.id,
        recipientEmail: customerEmail,
        recipientType: 'CUSTOMER',
        notificationType: 'REFUND_PROCESSED',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });
    } catch (err) {
      console.error('[sendRefundProcessedEmail Error]:', err.message);
    }
  }

  async sendRefundFailedEmail(orderId, refundData = null) {
    try {
      const order = await this.getFullOrder(orderId);
      if (!order) return;

      const customerEmail = order.users?.email;
      if (!customerEmail) return;

      const refId = refundData?.id || refundData?.provider_refund_id || 'fail';
      const eventKey = `order:${order.id}:refund-failed:${refId}:customer`;
      const emailContent = templates.getRefundCustomerEmail({
        type: 'FAILED',
        order,
        refund: refundData
      });

      await queue.enqueue({
        eventKey,
        orderId: order.id,
        recipientEmail: customerEmail,
        recipientType: 'CUSTOMER',
        notificationType: 'REFUND_FAILED',
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      });
    } catch (err) {
      console.error('[sendRefundFailedEmail Error]:', err.message);
    }
  }
}

module.exports = new FoodOrderEmailEvents();

