/**
 * End-to-End Simulation Test for Full Grab2Go Food Order Lifecycle Email Notifications
 * Tests:
 * 1. Customer places order -> Customer receives Confirmation + Owner receives New Order Alert
 * 2. Payment succeeds -> Customer receives Payment Receipt + Owner receives Payment Notification
 * 3. Restaurant starts preparing -> Customer receives Preparation Update
 * 4. Restaurant marks order ready -> Customer receives Pickup/Handover notification
 * 5. Order is completed -> Customer receives Order Completion Email
 * 6. Order cancelled within 10 min -> Owner receives Cancellation Email + Customer receives Refund Initiated Email
 */

const assert = require('assert');
const templates = require('./src/services/email/foodOrderEmailTemplates');

async function testFullLifecycle() {
  console.log('\n===============================================================');
  console.log('🧪 GRAB2GO FULL LIFECYCLE EMAIL NOTIFICATIONS SIMULATION TEST');
  console.log('===============================================================\n');

  const mockOrder = {
    id: 'f00d-9876-4321-abcd-1234567890ef',
    order_number: 'G2G-20261105-9988',
    customer_id: 'cust-uuid-1',
    customer_name: 'Srinivas K A',
    customer_phone: '9876543210',
    order_type: 'TAKEAWAY',
    order_status: 'NEW',
    payment_status: 'UNPAID',
    subtotal: 650.00,
    discount_amount: 50.00,
    delivery_charge: 0.00,
    total_amount: 600.00,
    pickup_date: '2026-11-05',
    pickup_time: '12:30 PM',
    cafes: {
      name: 'Srini Restaurant',
      address: '123 Food Street, Indiranagar',
      city: 'Bangalore'
    },
    users: {
      id: 'cust-uuid-1',
      name: 'Srinivas K A',
      email: 'customer@fahara.in'
    },
    order_items: [
      { id: 'item-1', quantity: 2, item_name_snapshot: 'Crispy Veg Burger', line_total: 300.00 },
      { id: 'item-2', quantity: 1, item_name_snapshot: 'Cold Coffee with Ice Cream', line_total: 150.00 },
      { id: 'item-3', quantity: 1, item_name_snapshot: 'French Fries', line_total: 150.00 }
    ]
  };

  const mockOwner = {
    id: 'owner-uuid-1',
    name: 'Srini Owner',
    email: 'owner@srinirestaurant.in'
  };

  // ── STEP 1: CUSTOMER PLACES ORDER ──────────────────────────────────────────
  console.log('▶ STEP 1: Customer Places Order');
  
  // 1A. Restaurant Owner Email
  const ownerNewOrder = templates.getNewOrderOwnerEmail(mockOrder, mockOwner, 'https://cafe.fahara.in/owner/orders');
  assert(ownerNewOrder.subject.includes('G2G-20261105-9988'), 'Owner subject must contain order number');
  assert(ownerNewOrder.html.includes('Srini Restaurant'), 'Owner email must contain cafe name');
  assert(ownerNewOrder.html.includes('Crispy Veg Burger'), 'Owner email must list ordered food items');
  console.log('  ✓ 1A. Owner receives New Order alert (Subject: "' + ownerNewOrder.subject + '")');

  // 1B. Customer Order Confirmation Email
  const customerConfirmation = templates.getNewOrderCustomerConfirmationEmail(mockOrder, 'https://fahara.in/customer/orders/' + mockOrder.id);
  assert(customerConfirmation.subject.includes('G2G-20261105-9988'), 'Customer subject must contain order number');
  assert(customerConfirmation.html.includes('Srinivas K A'), 'Customer confirmation must greet customer');
  assert(customerConfirmation.html.includes('₹600.00'), 'Customer confirmation must state total');
  console.log('  ✓ 1B. Customer receives Order Confirmation (Subject: "' + customerConfirmation.subject + '")');


  // ── STEP 2: PAYMENT SUCCEEDS (Verified Backend State) ──────────────────────
  console.log('\n▶ STEP 2: Online Payment Captured & Verified via Razorpay');
  const paidOrder = { ...mockOrder, payment_status: 'PAID' };
  const paymentData = {
    gateway_payment_id: 'pay_LiveSampleRazorpayId123',
    provider_payment_id: 'pay_LiveSampleRazorpayId123'
  };

  // 2A. Owner Payment Notification
  const ownerPayment = templates.getPaymentSuccessfulOwnerEmail({
    order: paidOrder,
    payment: paymentData,
    breakdown: { restaurantSettlementAmount: 570.00 }
  });
  assert(ownerPayment.subject.includes('Payment Received'), 'Owner payment subject verified');
  assert(ownerPayment.html.includes('pay_LiveSampleRazorpayId123'), 'Payment ID verified in owner email');
  console.log('  ✓ 2A. Owner receives Payment Verified Notification (Subject: "' + ownerPayment.subject + '")');

  // 2B. Customer Payment Receipt
  const customerReceipt = templates.getPaymentSuccessfulCustomerEmail({
    order: paidOrder,
    payment: paymentData,
    trackingUrl: 'https://fahara.in/customer/orders/' + mockOrder.id
  });
  assert(customerReceipt.subject.includes('Payment Receipt'), 'Customer receipt subject verified');
  assert(customerReceipt.html.includes('₹600.00'), 'Receipt must display ₹600.00 total');
  console.log('  ✓ 2B. Customer receives Payment Receipt (Subject: "' + customerReceipt.subject + '")');


  // ── STEP 3: RESTAURANT STARTS PREPARING FOOD ──────────────────────────────
  console.log('\n▶ STEP 3: Restaurant Owner Starts Preparation (Status -> PREPARING)');
  const preparingOrder = { ...paidOrder, order_status: 'PREPARING', estimated_preparation_time: 15 };
  const prepCustomer = templates.getPreparationStartedCustomerEmail(preparingOrder, mockOrder.users, 'https://fahara.in/customer/orders/' + mockOrder.id);
  assert(prepCustomer.subject.includes('Your Food Is Being Prepared!'), 'Prep subject verified');
  assert(prepCustomer.html.includes('~15 mins'), 'Estimated prep time displayed');
  console.log('  ✓ 3. Customer receives Food Preparation Started notification (Subject: "' + prepCustomer.subject + '")');


  // ── STEP 4: ORDER IS READY (Takeaway & Delivery variants) ──────────────────
  console.log('\n▶ STEP 4: Restaurant Marks Order as Ready (Status -> READY_FOR_PICKUP)');
  const readyOrder = { ...paidOrder, order_status: 'READY_FOR_PICKUP' };
  const readyCustomer = templates.getOrderReadyCustomerEmail(readyOrder, mockOrder.users, 'https://fahara.in/customer/orders/' + mockOrder.id);
  assert(readyCustomer.subject.includes('Your Order Is Ready!'), 'Ready subject verified');
  assert(readyCustomer.html.includes('ready for pickup'), 'Takeaway pickup instructions verified');
  console.log('  ✓ 4. Customer receives Order Ready for Pickup alert (Subject: "' + readyCustomer.subject + '")');


  // ── STEP 5: ORDER COMPLETED ───────────────────────────────────────────────
  console.log('\n▶ STEP 5: Order Completed (Status -> COMPLETED)');
  const completedOrder = { ...paidOrder, order_status: 'COMPLETED' };
  const completedCustomer = templates.getOrderCompletedCustomerEmail(completedOrder, 'https://fahara.in/customer/orders/' + mockOrder.id);
  assert(completedCustomer.subject.includes('Order Completed'), 'Completion subject verified');
  assert(completedCustomer.html.includes('Rate &amp; Review Order') || completedCustomer.html.includes('Rate & Review Order'), 'Rating CTA included');
  console.log('  ✓ 5. Customer receives Order Completed notification (Subject: "' + completedCustomer.subject + '")');


  // ── STEP 6: ORDER CANCELLATION & REFUND LIFECYCLE ─────────────────────────
  console.log('\n▶ STEP 6: Customer Cancels Within 10-Minute Window & Automated Refund');
  const cancelledOrder = { ...paidOrder, order_status: 'CANCELLED', cancellation_reason: 'Changed my mind' };
  
  // 6A. Owner Cancellation Email
  const ownerCancel = templates.getOrderCancelledOwnerEmail({
    order: cancelledOrder,
    reason: 'Changed my mind'
  });
  assert(ownerCancel.subject.includes('Order Cancelled by Customer'), 'Owner cancel subject verified');
  assert(ownerCancel.html.includes('Changed my mind'), 'Reason included in owner email');
  console.log('  ✓ 6A. Owner receives Order Cancelled Alert (Subject: "' + ownerCancel.subject + '")');

  // 6B. Customer Refund Initiated Email
  const customerRefund = templates.getRefundCustomerEmail({
    type: 'INITIATED',
    order: cancelledOrder,
    refund: { provider_refund_id: 'rfnd_SampleRazorpay123' },
    amount: 600.00
  });
  assert(customerRefund.subject.includes('Your Refund Has Been Initiated'), 'Refund subject verified');
  assert(customerRefund.html.includes('₹600.00'), 'Refund amount verified');
  console.log('  ✓ 6B. Customer receives Refund Initiated Email (Subject: "' + customerRefund.subject + '")');

  console.log('\n===============================================================');
  console.log('🎉 ALL 6 ORDER LIFECYCLE STAGES AND 8 NOTIFICATION EVENTS PASSED');
  console.log('===============================================================\n');
}

testFullLifecycle().catch(err => {
  console.error('Lifecycle test failed:', err);
  process.exit(1);
});
