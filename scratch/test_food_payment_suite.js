const { calculateFoodPaymentBreakdown } = require('../src/services/foodPaymentCalculationService');

function assertEqual(actual, expected, desc) {
  if (Math.abs(actual - expected) > 0.001) {
    console.error(`[FAIL] ${desc}: expected ${expected}, got ${actual}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${desc}: ${actual}`);
  }
}

console.log('=== TEST 1: Benchmark from Spec ===');
// S = 1000, D = 100 -> N = 900
// P (3%) = 27.00
// T (2%) = 18.00
// G (18% on T) = 3.24
// L = 0
// Total = 948.24
// Restaurant settlement = 900.00
// Platform retained = 48.24
const t1 = calculateFoodPaymentBreakdown({
  subtotal: 1000,
  discountAmount: 100,
  deliveryCharge: 0
});

assertEqual(t1.originalSubtotal, 1000, 'Original Subtotal');
assertEqual(t1.discountAmount, 100, 'Discount Amount');
assertEqual(t1.discountedSubtotal, 900, 'Discounted Subtotal N');
assertEqual(t1.platformFeeAmount, 27.00, 'Platform fee (3%)');
assertEqual(t1.transactionFeeAmount, 18.00, 'Transaction fee (2%)');
assertEqual(t1.transactionFeeGstAmount, 3.24, 'GST on Tx fee (18%)');
assertEqual(t1.totalPayableAmount, 948.24, 'Total Payable');
assertEqual(t1.restaurantSettlementAmount, 900.00, 'Restaurant Settlement');
assertEqual(t1.platformRetainedAmount, 48.24, 'Platform Retained');
assertEqual(t1.restaurantSettlementAmount + t1.platformRetainedAmount, t1.totalPayableAmount, 'Conservation of Money');

console.log('\n=== TEST 2: With Delivery Charges (L = 40) ===');
// S = 500, D = 50 -> N = 450
// P (3%) = 13.50
// T (2%) = 9.00
// G (18% on 9) = 1.62
// L = 40
// Total = 450 + 13.50 + 9.00 + 1.62 + 40 = 514.12
// Restaurant settlement = 450 + 40 = 490.00
// Platform retained = 24.12
const t2 = calculateFoodPaymentBreakdown({
  subtotal: 500,
  discountAmount: 50,
  deliveryCharge: 40
});

assertEqual(t2.discountedSubtotal, 450, 'Discounted Subtotal');
assertEqual(t2.platformFeeAmount, 13.50, 'Platform Fee');
assertEqual(t2.transactionFeeAmount, 9.00, 'Transaction Fee');
assertEqual(t2.transactionFeeGstAmount, 1.62, 'GST on Tx Fee');
assertEqual(t2.totalPayableAmount, 514.12, 'Total Payable');
assertEqual(t2.restaurantSettlementAmount, 490.00, 'Restaurant Settlement');
assertEqual(t2.platformRetainedAmount, 24.12, 'Platform Retained');
assertEqual(t2.restaurantSettlementAmount + t2.platformRetainedAmount, t2.totalPayableAmount, 'Conservation of Money');

console.log('\n=== TEST 3: Zero Discount (D = 0) ===');
// S = 200, D = 0 -> N = 200
// P = 6.00, T = 4.00, G = 0.72, L = 0
// Total = 210.72
const t3 = calculateFoodPaymentBreakdown({
  subtotal: 200,
  discountAmount: 0,
  deliveryCharge: 0
});

assertEqual(t3.discountedSubtotal, 200, 'Discounted Subtotal');
assertEqual(t3.platformFeeAmount, 6.00, 'Platform Fee');
assertEqual(t3.transactionFeeAmount, 4.00, 'Transaction Fee');
assertEqual(t3.transactionFeeGstAmount, 0.72, 'GST on Tx Fee');
assertEqual(t3.totalPayableAmount, 210.72, 'Total Payable');
assertEqual(t3.restaurantSettlementAmount, 200.00, 'Restaurant Settlement');

console.log('\n=== ALL 3 SUITES COMPLETED WITH 100% PRECISION! ===');

