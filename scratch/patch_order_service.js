const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/orderService.js');
let s = fs.readFileSync(filePath, 'utf8');

if (!s.includes('giftRewardService')) {
  s = "const giftRewardService = require('./giftRewardService');\n" + s;

  // 1. After checkout order creation:
  const orderCreatedTarget = "const fullOrder = await orderRepository.findOrderById(createdOrder.id);";
  const rewardIssueCode = `
    // Grab2Go Automatic Gift Reward issuance for eligible orders
    giftRewardService.issueRewardForOrder(createdOrder.id, customerId).then(res => {
      if (res.issued) {
        console.log('[OrderService] Automatic gift reward unlocked for order:', fullOrder?.order_number, res.reward?.voucher_code);
      }
    }).catch(err => console.error('[OrderService] Reward issuance error:', err.message));
`;
  s = s.replace(orderCreatedTarget, orderCreatedTarget + rewardIssueCode);

  // 2. Cancellation handling:
  const cancelTarget = "const cancelReasonText = reason?.trim() || 'Cancelled by customer within 10-minute window';";
  const rewardCancelCode = `
    // Reverse any issued gift reward upon cancellation
    giftRewardService.handleOrderCancelledOrRefunded(orderId, cancelReasonText).catch(err => {
      console.warn('[OrderService] Could not reverse reward on cancellation:', err.message);
    });
`;
  s = s.replace(cancelTarget, cancelTarget + rewardCancelCode);

  fs.writeFileSync(filePath, s, 'utf8');
  console.log('orderService updated with gift reward issuance and reversal');
} else {
  console.log('Already updated');
}
