const fs = require('fs');

// 1. Update reviewService.js
let reviewCode = fs.readFileSync('vexatech-fahara-backend/src/services/reviewService.js', 'utf8');
if (!reviewCode.includes('createUnifiedNotification')) {
  const target = 'await updateAggregatesAfterChange(order.cafe_id, null);';
  const replacement = `await updateAggregatesAfterChange(order.cafe_id, null);

  // Notify Restaurant Owner of new review
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
        category: 'REVIEW',
        priority: 'MEDIUM',
        type: 'NEW_REVIEW',
        title: \`New Food Order Review (\${numRating}★)\`,
        message: \`Customer rated order #\${order.order_number || order.id.slice(0, 8)} with \${numRating} stars: "\${review || 'No comment'}"\`,
        metadata: { orderId: order.id, rating: numRating, reviewTitle: review_title }
      });
    }
  } catch (notifErr) {
    console.error('[addFoodOrderReview] Notification failed:', notifErr.message);
  }`;

  reviewCode = reviewCode.replace(target, replacement);
  fs.writeFileSync('vexatech-fahara-backend/src/services/reviewService.js', reviewCode, 'utf8');
  console.log('reviewService.js updated successfully!');
}

// 2. Update foodOrderPaymentService.js
let paymentCode = fs.readFileSync('vexatech-fahara-backend/src/services/foodOrderPaymentService.js', 'utf8');
if (!paymentCode.includes('createUnifiedNotification')) {
  const targetPayment = 'console.error(\'[FoodOrderPaymentService] sendPaymentSuccessEmail error:\', err.message);\n    });';
  const replacementPayment = `console.error('[FoodOrderPaymentService] sendPaymentSuccessEmail error:', err.message);
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
          message: \`Payment of ₹\${Number(order.total_amount).toFixed(2)} for order #\${order.order_number} has been verified and captured.\`,
          metadata: { orderId: order.id, amount: Number(order.total_amount), paymentId: razorpay_payment_id }
        });
      }
    } catch (payNotifErr) {
      console.error('[FoodOrderPaymentService] Owner payment notification error:', payNotifErr.message);
    }`;

  paymentCode = paymentCode.replace(targetPayment, replacementPayment);
  fs.writeFileSync('vexatech-fahara-backend/src/services/foodOrderPaymentService.js', paymentCode, 'utf8');
  console.log('foodOrderPaymentService.js updated successfully!');
}

// 3. Update orderService.js for order creation & status notifications
let orderCode = fs.readFileSync('vexatech-fahara-backend/src/services/orderService.js', 'utf8');
if (!orderCode.includes('createUnifiedNotification')) {
  const targetOrder = 'console.error(\'[OrderService] sendNewOrderEmail non-blocking error:\', err.message);\n    });';
  const replacementOrder = `console.error('[OrderService] sendNewOrderEmail non-blocking error:', err.message);
    });

    // Notify Restaurant Owner of new food order
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
          message: \`You have received a new \${orderType.toLowerCase().replace('_', ' ')} order #\${fullOrder.order_number} from \${customerName} (₹\${Number(finalTotalAmount).toFixed(2)}).\`,
          metadata: { orderId: createdOrder.id, orderNumber: fullOrder.order_number, total: finalTotalAmount, orderType }
        });
      }
    } catch (orderNotifErr) {
      console.error('[OrderService] Owner order notification error:', orderNotifErr.message);
    }`;

  orderCode = orderCode.replace(targetOrder, replacementOrder);

  // Status transition notifications
  const targetStatus = 'return updatedOrder;\n  },\n\n  // 3. Assign Delivery Employee';
  const replacementStatus = `// Notify Restaurant Owner & Customer on key status milestones
    try {
      const notificationService = require('./notificationService');
      const cafeOwner = await prisma.cafes.findUnique({
        where: { id: order.cafe_id },
        select: { owner_id: true }
      });
      if (cafeOwner?.owner_id) {
        let notifTitle = \`Order #\${order.order_number} Status: \${newStatus.replace('_', ' ')}\`;
        let notifMsg = \`Order #\${order.order_number} is now \${newStatus.toLowerCase().replace('_', ' ')}.\`;
        let notifPriority = 'MEDIUM';

        if (newStatus === 'CANCELLED') {
          notifPriority = 'HIGH';
          notifTitle = \`Order #\${order.order_number} Cancelled\`;
          notifMsg = \`Food order #\${order.order_number} has been cancelled.\`;
        } else if (newStatus === 'COMPLETED') {
          notifTitle = \`Order #\${order.order_number} Completed\`;
          notifMsg = \`Food order #\${order.order_number} was successfully completed.\`;
        }

        await notificationService.createUnifiedNotification({
          userId: cafeOwner.owner_id,
          cafeId: order.cafe_id,
          orderId: order.id,
          category: 'FOOD_ORDER',
          priority: notifPriority,
          type: \`ORDER_\${newStatus}\`,
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

  // 3. Assign Delivery Employee`;

  orderCode = orderCode.replace(targetStatus, replacementStatus);
  fs.writeFileSync('vexatech-fahara-backend/src/services/orderService.js', orderCode, 'utf8');
  console.log('orderService.js updated successfully!');
}

