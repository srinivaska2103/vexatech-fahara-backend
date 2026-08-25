const prisma = require('../config/prisma');

const PLATFORM_FEE_PERCENTAGE = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '4');
const GST_PERCENTAGE = parseFloat(process.env.GST_PERCENTAGE || '5');

/**
 * Calculates pricing breakdowns for a booking.
 * Recalculates subtotal, platform fee, GST, and total on backend.
 */
const calculateBookingPrice = (booking) => {
  const cafeAmount = Number(booking.cafe_amount || 0);
  const eventServiceAmount = Number(booking.event_service_amount || 0);
  const foodAmount = Number(booking.food_amount || 0);
  const decorationAmount = Number(booking.decoration_amount || 0);
  const extraPersonAmount = Number(booking.extra_person_amount || 0);

  const subtotal = cafeAmount + eventServiceAmount + foodAmount + decorationAmount + extraPersonAmount;
  const platformFee = Number(((subtotal * PLATFORM_FEE_PERCENTAGE) / 100).toFixed(2));
  const gstAmount = Number((((subtotal + platformFee) * GST_PERCENTAGE) / 100).toFixed(2));
  const total = Number((subtotal + platformFee + gstAmount).toFixed(2));

  return {
    cafeAmount,
    eventServiceAmount,
    subtotal,
    platformFeePercentage: PLATFORM_FEE_PERCENTAGE,
    platformFee,
    gstPercentage: GST_PERCENTAGE,
    gstAmount,
    total
  };
};

/**
 * Prepares splits array for Razorpay Route and database recording.
 */
const prepareSplits = async (booking, totalAmount) => {
  const cafe = booking.cafes;
  const eventService = booking.event_services;

  const razorpaySplits = [];
  const dbSplitRecords = [];

  const eventServiceAmount = Number(booking.event_service_amount || 0);
  const cafeAmount = Number(booking.subtotal || totalAmount) - (booking.package_id && !eventService ? 0 : eventServiceAmount);

  // 1. Cafe Split
  const cafeAccountId = cafe?.payment_account_id || cafe?.razorpay_linked_account_id || cafe?.razorpay_account_id;
  const cafeVendorId = cafe?.owner_id || cafe?.id || null;
  if (cafeAccountId) {
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

  // 3. Fahara Platform Share
  const totalVendorShare = cafeAmount + (eventService && eventServiceAmount > 0 ? eventServiceAmount : 0);
  const faharaShare = Number((totalAmount - totalVendorShare).toFixed(2));

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
