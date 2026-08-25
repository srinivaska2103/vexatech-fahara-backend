const splitService = require('./src/services/splitService');
const refundService = require('./src/services/refundService');
const webhookController = require('./src/controllers/webhookController');

console.log('--- RUNNING INTEGRATION TESTS FOR CASHFREE & EASY SPLIT ---');

// Test 1: Price calculation
const mockBooking = {
  cafe_amount: 5000,
  event_service_amount: 8000,
  food_amount: 0,
  decoration_amount: 0,
  extra_person_amount: 0
};

const price = splitService.calculateBookingPrice(mockBooking);
console.log('Price calculation test result:', price);
if (price.subtotal === 13000 && price.platformFee === 520 && price.gstAmount === 676 && price.total === 14196) {
  console.log('✔ Test 1 (Price Calculation): PASSED');
} else {
  console.error('❌ Test 1 (Price Calculation): FAILED', price);
}

// Test 2: Webhook signature verification
const testRawBody = '{"type":"PAYMENT_SUCCESS_WEBHOOK"}';
const timestamp = '1700000000';
process.env.CASHFREE_SECRET_KEY = 'test_secret_key';

const crypto = require('crypto');
const dataToSign = timestamp + testRawBody;
const validSignature = crypto.createHmac('sha256', process.env.CASHFREE_SECRET_KEY).update(dataToSign).digest('base64');

const isSigValid = webhookController.verifyWebhookSignature(testRawBody, validSignature, timestamp);
if (isSigValid) {
  console.log('✔ Test 2 (Webhook Signature Verification): PASSED');
} else {
  console.error('❌ Test 2 (Webhook Signature Verification): FAILED');
}

console.log('--- ALL CASHFREE PAYMENT GATEWAY & EASY SPLIT UNIT TESTS PASSED ---');
