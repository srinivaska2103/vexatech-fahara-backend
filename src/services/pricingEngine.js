const prisma = require('../config/prisma');

const pricingEngine = {
  /**
   * Central Authoritative Booking Pricing Engine
   * The ONLY source of truth for pricing calculations across Fahara.
   * @param {string} bookingId 
   */
  calculateBookingPricing: async (bookingId) => {
    if (!bookingId) {
      throw new Error('Booking ID is required for pricing calculation');
    }

    const booking = await prisma.bookings.findUnique({
      where: { id: bookingId },
      include: {
        booking_items: true,
        cafes: true,
        event_services: true,
      },
    });

    if (!booking) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    const guestCount = Math.max(1, Number(booking.total_persons) || 1);
    const items = booking.booking_items || [];

    let parsedInclusionsList = [];
    if (booking.inclusions) {
      let inc = booking.inclusions;
      if (typeof inc === 'string') {
        try { inc = JSON.parse(inc); } catch (e) { inc = []; }
      }
      if (Array.isArray(inc)) {
        parsedInclusionsList = inc;
      } else if (inc && typeof inc === 'object') {
        Object.entries(inc).forEach(([key, val]) => {
          if (key === 'selectedInclusions') return;
          if (Array.isArray(val)) {
            val.forEach(item => {
              if (item && typeof item === 'object') parsedInclusionsList.push(item);
            });
          } else if (val && typeof val === 'object') {
            parsedInclusionsList.push(val);
          }
        });
      }
    }

    let cafePackage = null;
    let cafeItemsList = [];
    let cafeSubtotal = 0;

    let eventPackage = null;
    let eventItemsList = [];
    let eventSubtotal = 0;

    for (const item of items) {
      const unitPrice = Number(item.unit_price) || 0;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const isPerGuest = item.pricing_type === 'PER_GUEST';
      
      let computedAmount = 0;
      let calcStr = '';

      if (item.item_type === 'PACKAGE') {
        computedAmount = unitPrice;
        calcStr = `₹${unitPrice.toFixed(2)} Base`;
      } else if (isPerGuest) {
        computedAmount = unitPrice * guestCount;
        calcStr = `₹${unitPrice.toFixed(2)} × ${guestCount} guests = ₹${computedAmount.toFixed(2)}`;
      } else {
        computedAmount = unitPrice * quantity;
        calcStr = `₹${unitPrice.toFixed(2)} × ${quantity} = ₹${computedAmount.toFixed(2)}`;
      }

      let resolvedTierName = item.tier_name;
      let resolvedTierId = item.tier_id;
      let resolvedLevel = item.package_level;
      let snapMatch = null;

      if (!resolvedTierName || !resolvedTierId || !resolvedLevel) {
        snapMatch = parsedInclusionsList.find(s => {
          if (typeof s !== 'object' || !s) return false;
          const sIncId = s.inclusion_id || s.inclusionId;
          const sTierId = s.tier_id || s.tierId || s.id;
          const sName = s.item_name || s.name || s.title || '';
          if (item.inclusion_id && (sIncId === item.inclusion_id || (sTierId && String(sTierId).startsWith(String(item.inclusion_id))))) return true;
          if (item.tier_id && sTierId === item.tier_id) return true;
          return sName && item.item_name && String(sName).toLowerCase() === String(item.item_name).toLowerCase();
        });
        if (snapMatch) {
          resolvedTierId = resolvedTierId || snapMatch.tier_id || snapMatch.tierId || snapMatch.id;
          resolvedTierName = resolvedTierName || snapMatch.tier_name || snapMatch.tierName || snapMatch.tier || snapMatch.level || snapMatch.tierLevel || (snapMatch.name !== item.item_name ? snapMatch.name : null);
          if (!resolvedTierName && resolvedTierId && String(resolvedTierId).includes('_')) {
            const parts = String(resolvedTierId).split('_');
            const lastPart = parts[parts.length - 1];
            if (['basic', 'standard', 'premium'].includes(lastPart.toLowerCase())) {
              resolvedTierName = lastPart.toUpperCase();
            }
          }
          resolvedLevel = resolvedLevel || snapMatch.level || snapMatch.tierLevel || snapMatch.package_level || resolvedTierName;
        }
      }

      const isCafeCharge = item.item_type === 'CAFE_CHARGE';
      const isPackageBase = item.item_type === 'PACKAGE';

      let extractedTierFromId = null;
      const targetTierId = item.tier_id || resolvedTierId || (snapMatch ? (snapMatch.tierId || snapMatch.tier_id || snapMatch.id) : null);
      if (targetTierId && String(targetTierId).includes('_')) {
        const parts = String(targetTierId).split('_');
        const lastPart = parts[parts.length - 1];
        if (['basic', 'standard', 'premium'].includes(lastPart.toLowerCase())) {
          extractedTierFromId = lastPart.toUpperCase();
        }
      }

      const rawTier = isCafeCharge ? null : (item.tier_name || resolvedTierName || extractedTierFromId || (snapMatch ? (snapMatch.tierName || snapMatch.tier_name || snapMatch.level || snapMatch.tierLevel) : null) || null);
      const formattedLevel = rawTier ? (rawTier.charAt(0).toUpperCase() + rawTier.slice(1).toLowerCase()) : null;

      const finalTierId = isCafeCharge ? null : (targetTierId || (item.inclusion_id && resolvedTierName ? `${item.inclusion_id}_${String(resolvedTierName).toLowerCase()}` : item.inclusion_id));
      const finalTierName = isCafeCharge ? null : (item.tier_name || resolvedTierName || extractedTierFromId || (snapMatch ? (snapMatch.tierName || snapMatch.tier_name) : null) || (formattedLevel ? formattedLevel.toUpperCase() : null));

      const itemDetail = {
        id: item.id,
        itemType: item.item_type,
        inclusionId: item.inclusion_id || null,
        tierId: isCafeCharge ? null : (finalTierId || item.tier_id || null),
        tierName: finalTierName,
        tierLevel: formattedLevel,
        level: formattedLevel,
        selectedTier: (!isCafeCharge && !isPackageBase && (finalTierId || finalTierName)) ? {
          id: finalTierId,
          name: finalTierName,
          level: formattedLevel
        } : null,
        name: item.item_name,
        description: item.description || (snapMatch ? (snapMatch.description || snapMatch.desc) : null) || null,
        pricingType: item.pricing_type,
        unitPrice: Number(unitPrice.toFixed(2)),
        quantity: isPerGuest ? guestCount : quantity,
        guestCount: isPerGuest ? guestCount : null,
        amount: Number(computedAmount.toFixed(2)),
        calculation: isCafeCharge ? `₹${unitPrice.toFixed(2)}/hr × ${quantity} hrs = ₹${computedAmount.toFixed(2)}` : calcStr,
        isAddon: Boolean(item.is_addon),
      };

      if (item.provider_type === 'CAFE') {
        if (item.item_type === 'PACKAGE') {
          cafePackage = {
            id: item.package_id,
            name: item.package_name || item.item_name,
            level: item.package_level || null,
            baseAmount: Number(computedAmount.toFixed(2)),
          };
        } else {
          cafeItemsList.push(itemDetail);
        }
        cafeSubtotal += computedAmount;
      } else if (item.provider_type === 'EVENT') {
        if (item.item_type === 'PACKAGE') {
          eventPackage = {
            id: item.package_id,
            name: item.package_name || item.item_name,
            level: item.package_level || null,
            baseAmount: Number(computedAmount.toFixed(2)),
          };
        } else {
          eventItemsList.push(itemDetail);
        }
        eventSubtotal += computedAmount;
      }
    }

    const roundMoney = (val) => Math.round((Number(val) + Number.EPSILON) * 100) / 100;

    // Round subtotals safely
    cafeSubtotal = roundMoney(cafeSubtotal);
    eventSubtotal = roundMoney(eventSubtotal);
    const rawSubtotal = cafeSubtotal + eventSubtotal;
    const subtotal = roundMoney(rawSubtotal);

    const discount = Math.min(subtotal, Number(booking.discount || 0));

    // Fee calculations based on Fahara configuration
    const platformFeePct = 3.0; // 3%
    const transactionFeePct = 3.0; // 3%
    const gstPct = 18.0; // 18% GST on transactionFee only

    const netChargeable = Math.max(0, subtotal - discount);
    const platformFeeAmount = roundMoney(netChargeable * (platformFeePct / 100));
    const transactionFeeAmount = roundMoney(netChargeable * (transactionFeePct / 100));
    // GST is 18% of transactionFee only (NOT of both fees combined)
    const gstAmount = roundMoney(transactionFeeAmount * (gstPct / 100));

    const grandTotal = roundMoney(netChargeable + platformFeeAmount + transactionFeeAmount + gstAmount);

    // Structured pricing payload
    const pricingResult = {
      bookingId,
      guestCount,
      cafe: {
        package: cafePackage,
        items: cafeItemsList,
        subtotal: cafeSubtotal,
      },
      event: {
        package: eventPackage,
        items: eventItemsList,
        subtotal: eventSubtotal,
      },
      subtotal,
      discount,
      platformFee: {
        percentage: platformFeePct,
        amount: platformFeeAmount,
      },
      transactionFee: {
        percentage: transactionFeePct,
        amount: transactionFeeAmount,
      },
      gst: {
        percentage: gstPct,
        amount: gstAmount,
      },
      grandTotal,
    };

    // Logging output for debugging/verification
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PRICING ENGINE] Booking: ${bookingId} | Guests: ${guestCount} | Cafe Subtotal: ₹${cafeSubtotal} | Event Subtotal: ₹${eventSubtotal} | Grand Total: ₹${grandTotal}`);
    }

    return pricingResult;
  },

  /**
   * Save selection payload to booking_items inside a clean transaction.
   * Removes previous selection for provider, loads exact package and inclusions,
   * creates booking_items, and updates booking totals.
   */
  saveBookingSelection: async ({ bookingId, providerType, packageId, addOnInclusionIds = [] }) => {
    if (!bookingId || !packageId) {
      throw new Error('bookingId and packageId are required');
    }

    return await prisma.$transaction(async (tx) => {
      const booking = await tx.bookings.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        throw new Error(`Booking not found: ${bookingId}`);
      }

      // Load selected package
      const pkg = await tx.event_packages.findUnique({
        where: { id: packageId },
        include: {
          inclusions: {
            where: { is_active: true },
          },
        },
      });

      if (!pkg || !pkg.is_active) {
        throw new Error(`The selected package is no longer available or inactive.`);
      }

      const guestCount = Math.max(1, Number(booking.total_persons) || 1);

      // Delete existing booking items for this provider_type to prevent duplicates
      await tx.booking_items.deleteMany({
        where: {
          booking_id: bookingId,
          provider_type: providerType,
        },
      });

      const itemsToCreate = [];

      // 1. Base Package Record
      const basePackagePrice = Number(pkg.base_price) || 0;
      itemsToCreate.push({
        booking_id: bookingId,
        provider_type: providerType,
        item_type: 'PACKAGE',
        provider_id: pkg.provider_id,
        package_id: pkg.id,
        item_name: pkg.package_name,
        package_name: pkg.package_name,
        package_level: pkg.package_level,
        pricing_type: 'FIXED',
        unit_price: basePackagePrice,
        quantity: 1,
        guest_count: guestCount,
        amount: basePackagePrice,
        is_package_base: true,
        is_addon: false,
        description: pkg.description || null,
      });

      // 2. Process Package Inclusions
      for (const inc of pkg.inclusions) {
        const isAddonSelected = addOnInclusionIds.includes(inc.id);
        const isIncludedInPackage = inc.inclusion_type === 'INCLUDED' && !inc.is_optional;

        // If BASE_ONLY, standard INCLUDED items do not add extra billing amount
        // If BASE_PLUS_INCLUSIONS or ADDITIONAL or selected OPTIONAL_ADDON, compute billable amount
        if (isIncludedInPackage || isAddonSelected) {
          const unitPrice = Number(inc.unit_price) || 0;
          const isPerGuest = inc.pricing_type === 'PER_GUEST';
          
          let billableUnitPrice = unitPrice;
          if (pkg.package_pricing_mode === 'BASE_ONLY' && isIncludedInPackage) {
            // Price is included in base package price
            billableUnitPrice = 0;
          }

          let amount = 0;
          if (isPerGuest) {
            amount = billableUnitPrice * guestCount;
          } else {
            amount = billableUnitPrice * (inc.quantity || 1);
          }

          itemsToCreate.push({
            booking_id: bookingId,
            provider_type: providerType,
            item_type: isAddonSelected ? 'ADDON' : 'INCLUSION',
            provider_id: pkg.provider_id,
            package_id: pkg.id,
            inclusion_id: inc.id,
            tier_id: inc.tier_id || inc.tierId || inc.tier || null,
            tier_name: inc.tier_name || inc.tierName || inc.tier || null,
            item_name: inc.name,
            package_name: pkg.package_name,
            package_level: pkg.package_level,
            pricing_type: inc.pricing_type,
            unit_price: unitPrice,
            quantity: isPerGuest ? guestCount : (inc.quantity || 1),
            guest_count: isPerGuest ? guestCount : null,
            amount: Number(amount.toFixed(2)),
            is_package_base: false,
            is_addon: isAddonSelected,
            inclusion_type: inc.inclusion_type,
            description: inc.description || null,
          });
        }
      }

      await tx.booking_items.createMany({
        data: itemsToCreate,
      });

      // Update package_id / event_service_id reference on booking
      const updateData = { updated_at: new Date() };
      if (providerType === 'CAFE') {
        updateData.package_id = pkg.id;
      } else if (providerType === 'EVENT') {
        updateData.event_service_id = pkg.id;
      }

      await tx.bookings.update({
        where: { id: bookingId },
        data: updateData,
      });
    });
  },
};

module.exports = pricingEngine;
