const Razorpay = require('razorpay');
const crypto = require('crypto');

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

let razorpayInstance = null;

if (keyId && keySecret) {
  razorpayInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
  const isLive = keyId.startsWith('rzp_live_');
  const isTest = keyId.startsWith('rzp_test_');
  const modeLabel = isLive ? 'LIVE MODE' : isTest ? 'TEST MODE' : 'UNKNOWN MODE';
  const keyMasked = `${keyId.substring(0, 12)}...`;
  console.log(`[Razorpay SDK] Initialized successfully in ${modeLabel} (${keyMasked})`);
} else {
  console.warn('[Razorpay SDK] WARNING: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET environment variables are missing!');
}


/**
 * Verifies Razorpay payment signature from checkout frontend.
 */
const verifyPaymentSignature = ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return false;

  try {
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(razorpay_signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('[Razorpay] Signature verification error:', error);
    return false;
  }
};

/**
 * Verifies Razorpay webhook signature.
 */
const verifyWebhookSignature = (rawBody, signature, customSecret) => {
  const secret = customSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature || !rawBody) return false;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('[Razorpay] Webhook signature verification error:', error);
    return false;
  }
};

module.exports = {
  getRazorpayInstance: () => {
    if (!razorpayInstance && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      razorpayInstance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
      });
    }
    return razorpayInstance;
  },
  verifyPaymentSignature,
  verifyWebhookSignature,
  keyId
};
