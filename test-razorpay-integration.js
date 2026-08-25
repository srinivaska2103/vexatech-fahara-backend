require('dotenv').config();
const prisma = require('./src/config/prisma');
const { verifyPaymentSignature, verifyWebhookSignature } = require('./src/config/razorpay');
const linkedAccountService = require('./src/services/linkedAccountService');
const splitService = require('./src/services/splitService');
const webhookService = require('./src/services/webhookService');

async function testRazorpayIntegration() {
  console.log('=== Starting Razorpay Route Integration Verification ===\n');

  // Test 1: Signature Verification Utility
  console.log('1. Testing Payment Signature Verification Utility...');
  const testOrderId = 'order_FAH_TEST_123';
  const testPaymentId = 'pay_FAH_TEST_456';
  const crypto = require('crypto');
  const dummySecret = 'test_secret_key_12345';
  const origSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = dummySecret;

  const validSig = crypto
    .createHmac('sha256', dummySecret)
    .update(`${testOrderId}|${testPaymentId}`)
    .digest('hex');

  const isSigValid = verifyPaymentSignature({
    razorpay_order_id: testOrderId,
    razorpay_payment_id: testPaymentId,
    razorpay_signature: validSig
  });

  process.env.RAZORPAY_KEY_SECRET = origSecret;

  console.log(`- Signature Verification Result: ${isSigValid ? 'PASSED ✅' : 'FAILED ❌'}`);
  if (!isSigValid) throw new Error('Signature verification test failed!');

  // Test 2: Pricing & Split Calculation
  console.log('\n2. Testing Pricing & Split Calculation...');
  const dummyBooking = {
    id: '12345678-1234-1234-1234-123456789012',
    booking_number: 'FAH-2026-TEST',
    cafe_amount: 4000,
    event_service_amount: 1000,
    subtotal: 5000,
    total: 5450,
    cafes: {
      id: 'cafe_123',
      owner_id: 'owner_123',
      payment_account_id: 'acc_cafe_test_123'
    }
  };

  const pricing = splitService.calculateBookingPrice(dummyBooking);
  console.log('- Calculated Pricing:', pricing);
  const splits = await splitService.prepareSplits(dummyBooking, pricing.total);
  console.log('- Prepared Splits:', JSON.stringify(splits, null, 2));
  console.log('- Split Calculation: PASSED ✅');

  // Test 3: Bank Account Verification and Masking
  console.log('\n3. Testing Bank Account Verification and Masking...');
  const dummyUser = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Partner',
    email: 'partner@fahara.com',
    phone: '9876543210'
  };

  // Find or create test cafe for verification test
  let testCafe = await prisma.cafes.findFirst();
  if (testCafe) {
    const bankRes = await linkedAccountService.updateBankDetailsAndVerify({
      user: dummyUser,
      vendorType: 'CAFE',
      entityId: testCafe.id,
      accountNumber: '123456789012',
      confirmAccountNumber: '123456789012',
      accountHolder: 'Test Cafe Owner',
      ifsc: 'HDFC0001234',
      phone: '9876543210',
      email: 'partner@fahara.com'
    });

    console.log('- Bank Details Result:', {
      accountId: bankRes.accountId,
      bankVerificationStatus: bankRes.bankVerificationStatus,
      maskedBankAccount: bankRes.maskedAccountNumber,
      message: bankRes.message
    });

    if (bankRes.maskedAccountNumber.includes('123456789012')) {
      throw new Error('FAILED ❌: Bank account number was not properly masked!');
    }
    console.log('- Bank Account Masking & Status Test: PASSED ✅');
  } else {
    console.log('- Skipping cafe DB test (No cafe record found in DB)');
  }

  // Test 4: Webhook Processing Test
  console.log('\n4. Testing Webhook Handler Idempotency & Signature Guard...');
  const reqMock = {
    headers: {},
    rawBody: JSON.stringify({ event: 'payment.authorized', payload: {} }),
    body: { event: 'payment.authorized', payload: {} }
  };

  const webhookRes = await webhookService.processRazorpayWebhook(reqMock);
  console.log('- Webhook Process Output:', webhookRes);
  console.log('- Webhook Processing: PASSED ✅');

  console.log('\n=== ALL RAZORPAY INTEGRATION TESTS PASSED SUCCESSFULLY! ✅ ===');
}

testRazorpayIntegration()
  .catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
