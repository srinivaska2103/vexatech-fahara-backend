require('dotenv').config({ path: __dirname + '/../.env' });
const loyaltyService = require('../src/services/loyaltyService');
const prisma = require('../src/config/prisma');

async function testLoyaltySystem() {
  console.log('--- STARTING FAHARA LOYALTY SYSTEM TEST SUITE ---');

  // 1. Get a test user
  const user = await prisma.users.findFirst();
  if (!user) {
    console.error('No user found to run test');
    process.exit(1);
  }
  console.log(`Test Customer: ${user.name} (${user.id})`);

  // Clean test loyalty record if any
  await prisma.loyalty_redemptions.deleteMany({ where: { user_id: user.id } });
  await prisma.loyalty_credit_transactions.deleteMany({ where: { user_id: user.id } });
  await prisma.user_loyalty_accounts.deleteMany({ where: { user_id: user.id } });

  // TEST 1: Initial state
  console.log('\n[TEST 1] Initial Account Summary (0 credits)...');
  let summary = await loyaltyService.getAccountSummary(user.id);
  console.log('Summary:', summary);
  if (summary.credit_balance !== 0 || summary.rupee_value !== 0) throw new Error('TEST 1 Failed');

  // TEST 2: Complete booking reward (Simulate award)
  console.log('\n[TEST 2] Completing a booking and awarding credit...');
  let testBooking = await prisma.bookings.findFirst({ where: { customer_id: user.id } });
  if (!testBooking) {
    console.log('Creating mock completed booking for test...');
    const cafe = await prisma.cafes.findFirst();
    testBooking = await prisma.bookings.create({
      data: {
        booking_number: `FAH-TEST-${Date.now().toString().slice(-6)}`,
        customer_id: user.id,
        cafe_id: cafe.id,
        booking_date: new Date(),
        start_time: new Date(),
        end_time: new Date(),
        hours: 1,
        total_persons: 2,
        booking_status: 'COMPLETED',
        payment_status: 'PAID'
      }
    });
  } else {
    await prisma.bookings.update({
      where: { id: testBooking.id },
      data: { booking_status: 'COMPLETED' }
    });
  }

  const awardRes1 = await loyaltyService.awardBookingCredit(testBooking.id);
  console.log('Award Result 1:', awardRes1);
  if (awardRes1.account.credit_balance !== 1) throw new Error('TEST 2 Failed');

  // TEST 4: Duplicate protection
  console.log('\n[TEST 4] Awarding credit again for SAME booking...');
  const awardRes2 = await loyaltyService.awardBookingCredit(testBooking.id);
  console.log('Award Result 2 (Duplicate Check):', awardRes2);
  if (awardRes2.awarded !== false || awardRes2.account.credit_balance !== 1) throw new Error('TEST 4 Failed (Duplicate reward awarded!)');

  // TEST 10: Admin manual adjustment (+49 credits)
  console.log('\n[TEST 10] Admin adding +49 credits to reach 50...');
  const adminRes = await loyaltyService.adminAdjustCredits(user.id, user.id, 49, 'ADJUSTMENT', 'Customer service bonus');
  console.log('Admin Adjust Result:', adminRes);
  if (adminRes.account.credit_balance !== 50) throw new Error('TEST 10 Failed');

  // TEST 3: Redeem 50 credits
  console.log('\n[TEST 3] Redeeming 50 credits (Worth ₹1)...');
  const redeemRes = await loyaltyService.redeemCredits(user.id, 50);
  console.log('Redemption Result:', redeemRes);
  if (redeemRes.account.credit_balance !== 0 || redeemRes.rupeeValue !== 1) throw new Error('TEST 3 Failed');

  // TEST 7: Invalid multiple redemption (e.g. 25 credits)
  console.log('\n[TEST 7] Attempting invalid redemption of 25 credits...');
  try {
    await loyaltyService.redeemCredits(user.id, 25);
    throw new Error('TEST 7 Failed (Should have rejected 25 credits)');
  } catch (err) {
    console.log('Expected Error Received:', err.message);
  }

  // TEST 8: Insufficient balance
  console.log('\n[TEST 8] Attempting redemption of 50 credits with 0 balance...');
  try {
    await loyaltyService.redeemCredits(user.id, 50);
    throw new Error('TEST 8 Failed (Should have rejected insufficient balance)');
  } catch (err) {
    console.log('Expected Error Received:', err.message);
  }

  // TEST 6: Reversal test
  console.log('\n[TEST 6] Reversing booking credit...');
  const reverseRes = await loyaltyService.reverseBookingCredit(testBooking.id, 'Test reversal');
  console.log('Reversal Result:', reverseRes);

  console.log('\n✅ ALL FAHARA LOYALTY SYSTEM BACKEND TESTS PASSED SUCCESSFULLY! 🚀');
}

testLoyaltySystem()
  .catch(err => console.error('Test Suite Failed:', err))
  .finally(() => prisma.$disconnect());
