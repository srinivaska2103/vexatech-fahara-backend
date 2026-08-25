require('dotenv').config();
const { Cashfree, CFEnvironment } = require('cashfree-pg');

const cashfree = new Cashfree(
  CFEnvironment.SANDBOX,
  process.env.CASHFREE_APP_ID,
  process.env.CASHFREE_SECRET_KEY
);

const orderId = 'ORDER_TEST_' + Date.now();
const request = {
  order_amount: 100.50,
  order_currency: 'INR',
  order_id: orderId,
  customer_details: {
    customer_id: 'CUST_123',
    customer_phone: '9999999999',
    customer_name: 'Guest',
    customer_email: 'test@example.com',
  },
  order_meta: {
    return_url: `http://localhost:3000/payment-success?order_id=${orderId}`,
  }
};

async function test() {
  try {
    const response = await cashfree.PGCreateOrder(request);
    console.log("Success:", response.data);
  } catch (error) {
    console.error("Cashfree Error:", error.response?.data || error.message);
  }
}

test();
