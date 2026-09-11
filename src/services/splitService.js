const prisma = require('../config/prisma');

const PLATFORM_FEE_PERCENTAGE = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '4');
const GST_PERCENTAGE = parseFloat(process.env.GST_PERCENTAGE || '5');

/**
 * Calculates pricing breakdowns for a booking.
 * Recalculates subtotal, platform fee, GST, and total on backend.
 */
/**
 * Helper to calculate individual inclusion tier amounts and format strings.
 */
const calculateInclusionAmount = ({
  inclusionId = null,
  name = '',
  tierId = null,
  tierName = '',
  pricingType = 'FIXED',
  unitPrice = 0,
  quantity = 1,
  guestCount = 1,
  providerType = 'CAFE'
}) => {
  const price = Number(unitPrice || 0);
  const pType = String(pricingType || 'FIXED').toUpperCase();
  const guests = Math.max(1, Number(guestCount || 1));
  const qty = Math.max(1, Number(quantity || 1));

  let calculatedAmount = 0;
  let calculation = '';

  if (pType === 'PER_GUEST') {
    calculatedAmount = Number((price * guests).toFixed(2));
    calculation = `₹${price} × ${guests} guests = ₹${calculatedAmount}`;
  } else if (pType === 'PER_UNIT') {
    calculatedAmount = Number((price * qty).toFixed(2));
    calculation = `₹${price} × ${qty} units = ₹${calculatedAmount}`;
  } else {
    // FIXED
    calculatedAmount = Number((price * 1).toFixed(2));
    calculation = `₹${price} × 1 = ₹${calculatedAmount}`;
  }

  return {
    inclusionId: inclusionId || null,
    name: name || 'Inclusion',
    tierId: tierId || null,
    tierName: tierName || '',
    pricingType: pType,
    unitPrice: price,
    quantity: pType === 'PER_GUEST' ? guests : qty,
    calculatedAmount,
    calculation,
    providerType: providerType || 'CAFE'
  };
};

/**
 * Calculates authoritative pricing breakdowns for a booking.
 * Recalculates subtotal, platform fee, GST, and total on backend.
 */
const calculateBookingPrice = async (booking) => {
  if (!booking) return null;
  const pricingEngine = require('./pricingEngine');
  return await pricingEngine.calculateBookingPricing(booking.id);
};

/**
 * Prepares splits array for Razorpay Route and database recording.
 */
const prepareSplits = async (booking, totalAmount) => {
  const cafe = booking.cafes;
  const eventService = booking.event_services;

  const pricingEngine = require('./pricingEngine');
  const pricing = await pricingEngine.calculateBookingPricing(booking.id);
  const effectiveTotal = pricing ? pricing.grandTotal : Number(totalAmount || 0);

  const razorpaySplits = [];
  const dbSplitRecords = [];

  // Calculate Cafe Share: Sum of all CAFE booking items
  const cafeAmount = Number((pricing?.cafe?.subtotal || 0).toFixed(2));

  // Calculate Event Manager Share: Sum of all EVENT booking items
  const eventServiceAmount = Number((pricing?.event?.subtotal || 0).toFixed(2));

  // 1. Cafe Split
  const cafeAccountId = cafe?.payment_account_id || cafe?.razorpay_linked_account_id || cafe?.razorpay_account_id;
  const cafeVendorId = cafe?.owner_id || cafe?.id || null;
  if (cafeAccountId && cafeAmount > 0) {
    razorpaySplits.push({
      account: cafeAccountId,
      amount: Math.round(cafeAmount * 100),
      currency: 'INR',
      notes: { vendor_type: 'CAFE', cafe_id: cafe?.id, owner_id: cafe?.owner_id }
    });

    dbSplitRecords.push({
      vendor_type: 'CAFE',
      vendor_id: cafeVendorId,
      razorpay_account_id: cafeAccountId,
      payment_account_id: cafeAccountId,
      split_amount: cafeAmount,
      transfer_status: 'PENDING',
      settlement_status: 'PENDING'
    });
  } else if (cafe) {
    dbSplitRecords.push({
      vendor_type: 'CAFE',
      vendor_id: cafeVendorId,
      razorpay_account_id: null,
      payment_account_id: null,
      split_amount: cafeAmount,
      transfer_status: 'NOT_CREATED',
      settlement_status: 'PENDING'
    });
  }

  // 2. Event Manager Split
  if (eventService && (eventService.user_id || eventService.users)) {
    const eventUserId = eventService.user_id || eventService.users?.id;
    const eventProfile = await prisma.event_management_profiles.findFirst({
      where: { user_id: eventUserId }
    });

    const eventAccountId = eventProfile?.payment_account_id || eventProfile?.razorpay_linked_account_id || eventProfile?.razorpay_account_id;

    if (eventAccountId && eventServiceAmount > 0) {
      razorpaySplits.push({
        account: eventAccountId,
        amount: Math.round(eventServiceAmount * 100),
        currency: 'INR',
        notes: { vendor_type: 'EVENT_MANAGER', user_id: eventUserId }
      });
    }

    if (eventServiceAmount > 0) {
      dbSplitRecords.push({
        vendor_type: 'EVENT_MANAGER',
        vendor_id: eventUserId,
        razorpay_account_id: eventAccountId || null,
        payment_account_id: eventAccountId || null,
        split_amount: eventServiceAmount,
        transfer_status: eventAccountId ? 'PENDING' : 'NOT_CREATED',
        settlement_status: 'PENDING'
      });
    }
  }

  // 3. Fahara Platform Share (Fees + GST)
  const faharaShare = Number((effectiveTotal - cafeAmount - eventServiceAmount).toFixed(2));

  dbSplitRecords.push({
    vendor_type: 'FAHARA',
    vendor_id: null,
    razorpay_account_id: 'FAHARA_PLATFORM',
    payment_account_id: 'FAHARA_PLATFORM',
    split_amount: faharaShare > 0 ? faharaShare : 0,
    transfer_status: 'PROCESSED',
    settlement_status: 'COMPLETED'
  });

  return {
    razorpaySplits: razorpaySplits.length > 0 ? razorpaySplits : null,
    dbSplitRecords
  };
};

module.exports = {
  calculateBookingPrice,
  prepareSplits,
  PLATFORM_FEE_PERCENTAGE,
  GST_PERCENTAGE
};
