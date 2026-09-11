const prisma = require('../config/prisma');

/**
 * Authoritative Central Pricing Engine for Fahara
 * Calculates itemized totals for CAFE and EVENT booking items.
 *
 * @param {string|object} bookingOrId - Booking ID string or pre-fetched booking object
 * @returns {Promise<object>} Unified pricing breakdown
 */
const calculateBookingPricing = async (bookingOrId) => {
  let booking;
  if (typeof bookingOrId === 'string') {
    booking = await prisma.bookings.findUnique({
      where: { id: bookingOrId },
      include: {
        booking_items: true,
        cafes: true,
        event_services: true
      }
    });
  } else {
    booking = bookingOrId;
    if (!booking.booking_items) {
      const items = await prisma.booking_items.findMany({
        where: { booking_id: booking.id }
      });
      booking.booking_items = items;
    }
  }

  if (!booking) {
    throw new Error('Booking not found');
  }

  const guestCount = Number(booking.total_persons || 1);
  let items = booking.booking_items || [];

  // Migration/Fallback layer for older bookings created prior to booking_items table
  if (items.length === 0 && booking.inclusions) {
    const rawInclusions = Array.isArray(booking.inclusions) ? booking.inclusions : [];
    items = rawInclusions.map(inc => {
      let pricingType = (inc.pricingType || inc.pricing_type || 'FIXED').toUpperCase();
      let unitPrice = Number(inc.unitPrice || inc.price || inc.calculatedAmount || 0);
      let quantity = Number(inc.quantity || 1);
      let providerType = (inc.providerType || inc.provider_type || 'CAFE').toUpperCase();
      let itemType = inc.itemType || inc.item_type || (providerType === 'EVENT' ? 'EVENT_INCLUSION' : 'CAFE_INCLUSION');

      let amount = 0;
      if (pricingType === 'PER_GUEST') {
        amount = unitPrice * guestCount;
      } else {
        amount = unitPrice * quantity;
      }

      return {
        id: inc.id || null,
        booking_id: booking.id,
        provider_type: providerType,
        item_type: itemType,
        provider_id: inc.providerId || inc.provider_id || (providerType === 'EVENT' ? booking.event_service_id : booking.cafe_id),
        package_id: inc.packageId || inc.package_id || booking.package_id || null,
        inclusion_id: inc.inclusionId || inc.inclusion_id || null,
        tier_id: inc.tierId || inc.tier_id || null,
        item_name: inc.title || inc.name || inc.item_name || 'Inclusion Item',
        tier_name: inc.tierName || inc.tier_name || null,
        pricing_type: pricingType,
        unit_price: unitPrice,
        quantity: quantity,
        amount: amount,
        description: inc.description || null
      };
    });
  }

  const cafeItems = [];
  const eventItems = [];

  // Always include Cafe Base Charge if cafe_amount is present and > 0, and not already in items
  const cafeAmountNum = Number(booking.cafe_amount || 0);
  const cafeHours = Number(booking.hours || 1);
  const hasCafeChargeItem = items.some(i => i.item_type === 'CAFE_CHARGE' || i.item_name === 'Cafe Charges');
  const cafeHourlyRate = cafeHours > 0 ? Math.round((cafeAmountNum / cafeHours) * 100) / 100 : cafeAmountNum;

  if (cafeAmountNum > 0 && !hasCafeChargeItem) {
    cafeItems.push({
      itemType: 'CAFE_CHARGE',
      providerType: 'CAFE',
      itemName: 'Cafe Charges',
      tierName: null,
      tierId: null,
      pricingType: 'FIXED',
      unitPrice: cafeAmountNum,
      quantity: 1,
      amount: cafeAmountNum,
      calculation: `₹${cafeHourlyRate.toFixed(2)}/hr × ${cafeHours} ${cafeHours === 1 ? 'hr' : 'hrs'} = ₹${cafeAmountNum.toFixed(2)}`
    });
  }

  let cafeSubtotal = cafeItems.reduce((sum, item) => sum + Number(item.amount), 0);
  let eventSubtotal = 0;

  items.forEach(item => {
    const pricingType = (item.pricing_type || 'FIXED').toUpperCase();
    const unitPrice = Number(item.unit_price || 0);
    const quantity = Number(item.quantity || 1);
    
    let computedAmount = 0;
    if (pricingType === 'PER_GUEST') {
      computedAmount = Math.round((unitPrice * guestCount) * 100) / 100;
    } else {
      computedAmount = Math.round((unitPrice * quantity) * 100) / 100;
    }

    const rawTier = item.tier_name || item.package_level || null;
    const formattedLevel = rawTier ? (rawTier.charAt(0).toUpperCase() + rawTier.slice(1).toLowerCase()) : null;

    const calcStr = pricingType === 'PER_GUEST'
      ? `₹${unitPrice.toFixed(2)} × ${guestCount} guests = ₹${computedAmount.toFixed(2)}`
      : (quantity > 1 ? `₹${unitPrice.toFixed(2)} × ${quantity} = ₹${computedAmount.toFixed(2)}` : `₹${computedAmount.toFixed(2)}`);

    const isCafeCharge = item.item_type === 'CAFE_CHARGE';
    const targetTierId = isCafeCharge ? null : (item.tier_id || item.tierId || item.selectedTier?.id || (item.inclusion_id && (item.tier_name || item.tierName || formattedLevel) ? `${item.inclusion_id}_${String(item.tier_name || item.tierName || formattedLevel).toLowerCase()}` : null));
    const targetTierName = isCafeCharge ? null : (item.tier_name || item.tierName || item.selectedTier?.name || (formattedLevel ? formattedLevel.toUpperCase() : null));

    const formattedItem = {
      id: item.id || null,
      providerType: item.provider_type || 'CAFE',
      itemType: item.item_type || 'CAFE_INCLUSION',
      providerId: item.provider_id || null,
      packageId: item.package_id || null,
      inclusionId: item.inclusion_id || null,
      tierId: targetTierId,
      itemName: item.item_name || item.name || 'Item',
      tierName: targetTierName,
      level: formattedLevel,
      tierLevel: formattedLevel,
      selectedTier: (!isCafeCharge && (targetTierId || targetTierName)) ? {
        id: targetTierId,
        name: targetTierName,
        level: formattedLevel
      } : null,
      pricingType: pricingType,
      unitPrice: unitPrice,
      quantity: pricingType === 'PER_GUEST' ? guestCount : quantity,
      guestCount: pricingType === 'PER_GUEST' ? guestCount : null,
      amount: computedAmount,
      calculation: isCafeCharge ? `₹${unitPrice.toFixed(2)}/hr × ${quantity} hrs = ₹${computedAmount.toFixed(2)}` : calcStr,
      description: item.description || null
    };

    if (formattedItem.providerType === 'EVENT') {
      eventItems.push(formattedItem);
      eventSubtotal += computedAmount;
    } else {
      cafeItems.push(formattedItem);
      cafeSubtotal += computedAmount;
    }
  });

  cafeSubtotal = Math.round(cafeSubtotal * 100) / 100;
  eventSubtotal = Math.round(eventSubtotal * 100) / 100;
  const subtotal = Math.round((cafeSubtotal + eventSubtotal) * 100) / 100;

  const discount = Math.round(Number(booking.discount || 0) * 100) / 100;
  const taxableAmount = Math.max(0, subtotal - discount);

  // Fee calculation rules: 3% Platform Fee, 3% Transaction Fee, 18% GST on fees
  const platformFeePercentage = 3;
  const transactionFeePercentage = 3;
  const gstPercentage = 18; // GST is applied on transactionFee ONLY

  const platformFeeAmount = Math.round((taxableAmount * (platformFeePercentage / 100)) * 100) / 100;
  const transactionFeeAmount = Math.round((taxableAmount * (transactionFeePercentage / 100)) * 100) / 100;
  
  // GST is 18% of transaction fee only (NOT of both fees)
  const gstAmount = Math.round((transactionFeeAmount * (gstPercentage / 100)) * 100) / 100;

  const grandTotal = Math.round((taxableAmount + platformFeeAmount + transactionFeeAmount + gstAmount) * 100) / 100;

  return {
    bookingId: booking.id,
    bookingNumber: booking.booking_number,
    guestCount: guestCount,
    cafeCharges: cafeAmountNum,
    cafe: {
      items: cafeItems,
      subtotal: cafeSubtotal
    },
    event: {
      items: eventItems,
      subtotal: eventSubtotal
    },
    cafeInclusions: cafeItems,
    eventInclusions: eventItems,
    subtotal: subtotal,
    discount: discount,
    platformFee: {
      percentage: platformFeePercentage,
      amount: platformFeeAmount
    },
    transactionFee: {
      percentage: transactionFeePercentage,
      amount: transactionFeeAmount
    },
    gst: {
      percentage: gstPercentage,
      amount: gstAmount
    },
    grandTotal: grandTotal
  };
};

module.exports = {
  calculateBookingPricing
};
