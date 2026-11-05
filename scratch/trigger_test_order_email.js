require('dotenv').config();
const foodOrderEmailEvents = require('../src/services/email/foodOrderEmailEvents');
const prisma = require('../src/config/prisma');

async function triggerForLatestOrder() {
  const orderId = '304ae3d7-6d4d-495d-946c-7d6510212655';
  console.log('Sending emails for order:', orderId);
  
  console.log('1. Triggering New Order email (Owner + Customer)...');
  await foodOrderEmailEvents.sendNewOrderEmail(orderId);

  console.log('2. Triggering Payment Success email...');
  await foodOrderEmailEvents.sendPaymentSuccessEmail(orderId, {
    razorpay_payment_id: 'pay_test_live_verify',
    method: 'upi'
  });

  console.log('Waiting 5 seconds for queue processing...');
  await new Promise(r => setTimeout(r, 5000));

  const notifs = await prisma.email_notifications.findMany({
    where: { order_id: orderId }
  });
  console.log('Resulting email_notifications in DB:');
  notifs.forEach(n => {
    console.log(`[${n.status}] to ${n.recipient_email} (${n.notification_type}): error="${n.last_error}" attempts=${n.attempts}`);
  });
}

triggerForLatestOrder()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

