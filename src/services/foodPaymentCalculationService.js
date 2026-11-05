/**
 * Grab2Go Authoritative Food Order Payment Calculation Service
 * 
 * Rules:
 * Step 1: Calculate original food subtotal (S)
 * Step 2: Apply all eligible food discounts (D)
 * Step 3: Calculate discounted food amount (N = S - D)
 * Step 4: Calculate Grab2Go platform fee at 3% (P = N * 3 / 100)
 * Step 5: Calculate transaction fee at 2% (T = N * 2 / 100)
 * Step 6: Calculate 18% GST exclusively on transaction fee (G = T * 18 / 100)
 * Step 7: Add applicable delivery charges (L)
 * Step 8: Calculate final customer payable amount (TOTAL = N + P + T + G + L)
 */

const PLATFORM_FEE_RATE = 3.0; // 3%
const TRANSACTION_FEE_RATE = 2.0; // 2%
const TRANSACTION_FEE_GST_RATE = 18.0; // 18%

/**
 * Decimal safe round to 2 decimal places
 */
const round2 = (val) => Math.round((Number(val) + Number.EPSILON) * 100) / 100;

function calculateFoodPaymentBreakdown({
  subtotal = 0,
  discountAmount = 0,
  deliveryCharge = 0
}) {
  const S = round2(Math.max(0, Number(subtotal) || 0));
  const D = round2(Math.min(S, Math.max(0, Number(discountAmount) || 0)));
  const N = round2(Math.max(0, S - D)); // Discounted food subtotal

  // Platform fee: 3% on discounted food subtotal
  const platformFeeRate = PLATFORM_FEE_RATE;
  const platformFeeAmount = round2((N * platformFeeRate) / 100);

  // Transaction fee: 2% on discounted food subtotal
  const transactionFeeRate = TRANSACTION_FEE_RATE;
  const transactionFeeAmount = round2((N * transactionFeeRate) / 100);

  // GST: 18% exclusively on transaction fee
  const gstRate = TRANSACTION_FEE_GST_RATE;
  const transactionFeeGstAmount = round2((transactionFeeAmount * gstRate) / 100);

  // Delivery charge
  const L = round2(Math.max(0, Number(deliveryCharge) || 0));

  // Final Customer Payable Amount
  const totalPayableAmount = round2(N + platformFeeAmount + transactionFeeAmount + transactionFeeGstAmount + L);

  // Amount eligible for restaurant settlement:
  // Restaurant gets the discounted food subtotal (N) + any delivery charge (if restaurant-owned delivery)
  const restaurantSettlementAmount = round2(N + L);

  // Platform retained amount: Platform fee + Transaction fee + GST
  const platformRetainedAmount = round2(platformFeeAmount + transactionFeeAmount + transactionFeeGstAmount);

  return {
    originalSubtotal: S,
    discountAmount: D,
    discountedSubtotal: N,
    platformFeeRate,
    platformFeeAmount,
    transactionFeeRate,
    transactionFeeAmount,
    transactionFeeGstRate: gstRate,
    transactionFeeGstAmount,
    deliveryCharge: L,
    totalPayableAmount,
    restaurantSettlementAmount,
    platformRetainedAmount
  };
}

module.exports = {
  PLATFORM_FEE_RATE,
  TRANSACTION_FEE_RATE,
  TRANSACTION_FEE_GST_RATE,
  round2,
  calculateFoodPaymentBreakdown
};

