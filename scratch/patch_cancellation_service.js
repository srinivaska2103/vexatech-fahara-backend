const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/orderCancellationRefundService.js');
let s = fs.readFileSync(filePath, 'utf8');

if (!s.includes('giftRewardService')) {
  s = "const giftRewardService = require('./giftRewardService');\n" + s;

  // Add reward reversal in approveCancellation
  const target = "message: 'Cancellation approved and processed.',";
  const addition = `
      // Reverse any associated gift reward
      giftRewardService.handleOrderCancelledOrRefunded(orderId, 'Order cancellation approved by restaurant').catch(() => null);
`;
  s = s.replace(target, target + addition);

  fs.writeFileSync(filePath, s, 'utf8');
  console.log('orderCancellationRefundService updated with gift reward reversal');
} else {
  console.log('Already updated');
}
