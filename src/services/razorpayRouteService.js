const { getRazorpayInstance, verifyPaymentSignature, verifyWebhookSignature } = require('../config/razorpay');

/**
 * Razorpay Route Payment Provider Service
 * Modular abstraction for linked accounts, order creation, payment verification,
 * Route transfers, refunds, and transfer reversals via real Razorpay API calls.
 */
class RazorpayRouteService {
  constructor() {
    this.providerName = 'RAZORPAY';
  }

  getAuthHeader() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return null;
    return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  }

  getErrorMessage(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (err.error && err.error.description) return err.error.description;
    if (err.description) return err.description;
    try {
      return JSON.stringify(err);
    } catch (e) {
      return String(err);
    }
  }

  /**
   * 1. Creates a Razorpay Route Linked Account via V2 Accounts API.
   */
  async createLinkedAccount(accountData) {
    const razorpay = getRazorpayInstance();
    if (!razorpay || typeof razorpay.accounts?.create !== 'function') {
      throw new Error('Razorpay SDK is not initialized. Check API credentials.');
    }

    try {
      const response = await razorpay.accounts.create(accountData);
      console.log(`[RAZORPAY LINKED ACCOUNT CREATED] accountId: ${response.id}`);
      return {
        success: true,
        accountId: response.id,
        status: response.status || 'ACTIVE',
        data: response
      };
    } catch (error) {
      const msg = this.getErrorMessage(error);
      console.error(`[RAZORPAY LINKED ACCOUNT ERROR]: ${msg}`);
      throw new Error(`Razorpay Linked Account creation failed: ${msg}`);
    }
  }

  /**
   * 2. Fetches status of a Razorpay Linked Account.
   */
  async getLinkedAccount(accountId) {
    const authHeader = this.getAuthHeader();
    if (!authHeader) throw new Error('Razorpay API keys missing in environment.');

    try {
      const res = await fetch(`https://api.razorpay.com/v2/accounts/${accountId}`, {
        method: 'GET',
        headers: { 'Authorization': authHeader }
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.description || 'Failed to fetch linked account');
      }
      return { success: true, data };
    } catch (error) {
      const msg = this.getErrorMessage(error);
      throw new Error(`Fetch linked account failed: ${msg}`);
    }
  }

  /**
   * 3. Creates a Razorpay Payment Order with integer amount (paise).
   */
  async createPaymentOrder({ amountInRupees, bookingNumber, bookingId, customerId, splits }) {
    const razorpay = getRazorpayInstance();
    if (!razorpay || typeof razorpay.orders?.create !== 'function') {
      throw new Error('Razorpay SDK is missing or invalid.');
    }

    const amountInPaise = Math.round(Number(amountInRupees) * 100);
    if (isNaN(amountInPaise) || amountInPaise <= 0) {
      throw new Error('Invalid order amount: must be greater than 0');
    }

    const basePayload = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${bookingNumber}`.slice(0, 40),
      notes: {
        booking_id: String(bookingId),
        booking_number: String(bookingNumber),
        customer_id: String(customerId)
      }
    };

    try {
      const payload = { ...basePayload };
      if (splits && Array.isArray(splits) && splits.length > 0) {
        payload.transfers = splits;
      }

      const order = await razorpay.orders.create(payload);
      console.log(`[RAZORPAY ORDER CREATED] bookingId: ${bookingId}, razorpayOrderId: ${order.id}, amountPaise: ${amountInPaise}`);
      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        order
      };
    } catch (error) {
      const msg = this.getErrorMessage(error);
      console.warn(`[RAZORPAY ORDER CREATE WARNING]: ${msg}. Retrying standard order creation without inline transfers...`);
      try {
        const fallbackOrder = await razorpay.orders.create(basePayload);
        console.log(`[RAZORPAY STANDARD ORDER CREATED] bookingId: ${bookingId}, razorpayOrderId: ${fallbackOrder.id}`);
        return {
          success: true,
          orderId: fallbackOrder.id,
          amount: fallbackOrder.amount,
          currency: fallbackOrder.currency,
          order: fallbackOrder
        };
      } catch (fallbackError) {
        const fallbackMsg = this.getErrorMessage(fallbackError);
        console.error(`[RAZORPAY ORDER CREATION FAILED]: ${fallbackMsg}`);
        throw new Error(`Razorpay Order Creation Failed: ${fallbackMsg}`);
      }
    }
  }

  /**
   * 4. Verifies checkout payment signature securely.
   */
  verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    return verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
  }

  /**
   * 5. Fetches real payment record from Razorpay API.
   */
  async fetchPayment(razorpayPaymentId) {
    const razorpay = getRazorpayInstance();
    if (!razorpay || typeof razorpay.payments?.fetch !== 'function') {
      throw new Error('Razorpay SDK unavailable');
    }

    try {
      const payment = await razorpay.payments.fetch(razorpayPaymentId);
      console.log(`[RAZORPAY PAYMENT FETCHED] paymentId: ${razorpayPaymentId}, status: ${payment?.status}`);
      return { success: true, payment };
    } catch (error) {
      const msg = this.getErrorMessage(error);
      console.error(`[RAZORPAY PAYMENT FETCH ERROR]: ${msg}`);
      throw new Error(`Fetch payment failed: ${msg}`);
    }
  }

  /**
   * 6. Creates a Razorpay Route Transfer to a recipient linked account.
   */
  async createTransfer({ gatewayPaymentId, linkedAccountId, amountInRupees, paymentId, bookingId, vendorType }) {
    const razorpay = getRazorpayInstance();
    if (!razorpay || typeof razorpay.payments?.transfer !== 'function') {
      throw new Error('Razorpay SDK payments.transfer function is not available.');
    }

    const transferAmountPaise = Math.round(Number(amountInRupees) * 100);
    if (isNaN(transferAmountPaise) || transferAmountPaise <= 0) {
      throw new Error('Invalid transfer amount');
    }

    console.log(`[ROUTE TRANSFER STARTED] paymentId: ${paymentId}, linkedAccountId: ${linkedAccountId}, transferAmount: ₹${amountInRupees}`);

    try {
      const transferResponse = await razorpay.payments.transfer(gatewayPaymentId, {
        transfers: [
          {
            account: linkedAccountId,
            amount: transferAmountPaise,
            currency: 'INR',
            notes: {
              payment_id: String(paymentId),
              booking_id: String(bookingId),
              vendor_type: String(vendorType)
            }
          }
        ]
      });

      const firstTransfer = transferResponse?.items?.[0] || transferResponse?.transfers?.[0] || transferResponse;
      const transferId = firstTransfer.id;
      const transferStatus = (firstTransfer.status === 'processed' || firstTransfer.status === 'settled') ? 'PROCESSED' : 'PENDING';

      console.log(`[ROUTE TRANSFER SUCCESS] paymentId: ${paymentId}, razorpayTransferId: ${transferId}, transferStatus: ${transferStatus}`);

      return {
        success: true,
        transferId,
        status: transferStatus,
        rawResponse: firstTransfer
      };
    } catch (error) {
      const msg = this.getErrorMessage(error);
      console.error(`[ROUTE TRANSFER FAILED] paymentId: ${paymentId}, errorCode: TRANSFER_FAILED, errorMessage: ${msg}`);
      throw new Error(`Razorpay Route Transfer Failed: ${msg}`);
    }
  }

  /**
   * 7. Fetches status of a Razorpay Transfer.
   */
  async fetchTransfer(transferId) {
    const razorpay = getRazorpayInstance();
    if (!razorpay || typeof razorpay.transfers?.fetch !== 'function') {
      throw new Error('Razorpay SDK transfers.fetch function is not available.');
    }

    try {
      const transfer = await razorpay.transfers.fetch(transferId);
      return { success: true, transfer };
    } catch (error) {
      const msg = this.getErrorMessage(error);
      throw new Error(`Fetch transfer failed: ${msg}`);
    }
  }

  /**
   * 8. Creates a Razorpay Refund for a payment.
   */
  async createRefund({ gatewayPaymentId, amountInRupees, notes }) {
    const razorpay = getRazorpayInstance();
    if (!razorpay || typeof razorpay.payments?.refund !== 'function') {
      throw new Error('Razorpay SDK payments.refund function is unavailable.');
    }

    try {
      const payload = {
        notes: notes || {}
      };
      if (amountInRupees && Number(amountInRupees) > 0) {
        payload.amount = Math.round(Number(amountInRupees) * 100);
      }

      const refund = await razorpay.payments.refund(gatewayPaymentId, payload);
      console.log(`[RAZORPAY REFUND CREATED] refundId: ${refund.id}, amount: ${refund.amount}`);
      return { success: true, refundId: refund.id, refund };
    } catch (error) {
      const msg = this.getErrorMessage(error);
      console.error(`[RAZORPAY REFUND ERROR]: ${msg}`);
      throw new Error(`Razorpay Refund Failed: ${msg}`);
    }
  }

  /**
   * 9. Reverses a Route Transfer.
   */
  async reverseTransferIfRequired({ transferId, amountInRupees, reason }) {
    const razorpay = getRazorpayInstance();
    if (!razorpay || typeof razorpay.transfers?.reverse !== 'function') {
      throw new Error('Razorpay SDK transfers.reverse function is unavailable.');
    }

    try {
      const payload = {
        notes: { reason: reason || 'Booking refund transfer reversal' }
      };
      if (amountInRupees && Number(amountInRupees) > 0) {
        payload.amount = Math.round(Number(amountInRupees) * 100);
      }

      const reversal = await razorpay.transfers.reverse(transferId, payload);
      console.log(`[ROUTE TRANSFER REVERSED] reversalId: ${reversal.id}, transferId: ${transferId}`);
      return { success: true, reversalId: reversal.id, reversal };
    } catch (error) {
      const msg = this.getErrorMessage(error);
      console.error(`[ROUTE TRANSFER REVERSAL ERROR]: ${msg}`);
      throw new Error(`Route Transfer Reversal Failed: ${msg}`);
    }
  }
}

module.exports = new RazorpayRouteService();
