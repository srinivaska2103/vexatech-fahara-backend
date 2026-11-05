const { calculateFoodPaymentBreakdown } = require('../src/services/foodPaymentCalculationService');

const result = calculateFoodPaymentBreakdown({
  subtotal: 1000,
  discountAmount: 100,
  deliveryCharge: 0
});

console.log('Result for Subtotal: 1000, Discount: 100:');
console.log(JSON.stringify(result, null, 2));

if (
  result.discountedSubtotal === 900 &&
  result.platformFeeAmount === 27 &&
  result.transactionFeeAmount === 18 &&
  result.transactionFeeGstAmount === 3.24 &&
  result.totalPayableAmount === 948.24 &&
  result.restaurantSettlementAmount === 900 &&
  result.platformRetainedAmount === 48.24
) {
  console.log('>>> ALL VERIFICATION CHECKS PASSED PERFECTLY! <<<');
} else {
  console.error('>>> VERIFICATION FAILED! <<<');
  process.exit(1);
}

