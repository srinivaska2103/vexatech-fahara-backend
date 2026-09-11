const bookingRepository = require('../repositories/bookingRepository');
const cafeRepository = require('../repositories/cafeRepository');
const tableRepository = require('../repositories/tableRepository');
const tableService = require('./tableService');
const bookingUtils = require('../utils/bookingUtils');
const notificationService = require('./notificationService');
const paymentService = require('./paymentService');

const createBooking = async (userId, data) => {
  // ═══════════════════════════════════════════════════════════════
  // CRITICAL ENTRY DIAGNOSTIC — shows raw inclusions type/value
  // ═══════════════════════════════════════════════════════════════
  const _rawInc = data ? data.inclusions : undefined;
  console.log(`[FAHARA ENTRY] inclusions type=${typeof _rawInc} | isArray=${Array.isArray(_rawInc)} | isNull=${_rawInc === null} | isUndef=${_rawInc === undefined} | len=${Array.isArray(_rawInc) ? _rawInc.length : (typeof _rawInc === 'object' && _rawInc ? Object.keys(_rawInc).length : 'N/A')} | sample=${JSON.stringify(Array.isArray(_rawInc) ? _rawInc[0] : _rawInc)?.slice(0,120)}`);

  const {
    cafe_id,
    package_id,
    event_service_id,
    booking_date,
    start_time,
    end_time,
    hours,
    total_persons,
    food_amount = 0,
    decoration_amount = 0,
    extra_person_amount = 0,
    discount = 0,
    special_request,
    event_special_request,
    table_id,
  } = data;


  // 1. Validate Cafe & Bank Verification
  const cafe = await cafeRepository.findCafeById(cafe_id);
  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }

  const categoryStr = `${cafe.category || ''} ${cafe.service_type || ''} ${cafe.name || ''}`.toLowerCase();
  const isRestaurant = categoryStr.includes('restaur') || categoryStr.includes('restur');

  if (!isRestaurant && String(cafe.bank_verification_status || '').toUpperCase() !== 'VERIFIED') {
    const error = new Error('This venue cannot accept bookings until their bank details are verified.');
    error.statusCode = 400;
    throw error;
  }

  // 1b. Check if Cafe is open on the requested date
  if (bookingUtils.isCafeClosedOnDate(cafe, booking_date)) {
    const dayName = bookingUtils.getDayNameOfDate(booking_date);
    const dayFormatted = dayName ? (dayName.charAt(0) + dayName.slice(1).toLowerCase()) : 'the selected day';
    const error = new Error(`The cafe is closed on ${dayFormatted}s and cannot accept bookings for this date.`);
    error.statusCode = 400;
    throw error;
  }

  // 1b-2. Check if selected booking time is within Cafe operating hours
  const cafeBusinessHoursErr = bookingUtils.checkBookingTimeBusinessHours(cafe, booking_date, start_time, end_time, 'Cafe');

  // 1c. Enforce 24-hour advance booking policy
  if (bookingUtils.isBookingWithin24Hours(booking_date, start_time)) {
    const error = new Error('Bookings must be made at least 24 hours in advance of the scheduled booking time.');
    error.statusCode = 400;
    throw error;
  }

  // format date and times
  const bDate = new Date(booking_date);
  // Assuming start_time and end_time are provided as HH:mm:ss strings, convert them for Prisma
  const sTime = new Date(`1970-01-01T${start_time}Z`);
  const eTime = new Date(`1970-01-01T${end_time}Z`);

  // 2. Check Availability
  const isAvailable = await bookingRepository.checkAvailability(cafe_id, bDate, sTime, eTime);
  if (!isAvailable) {
    const error = new Error('The selected time slot is not available');
    error.statusCode = 409;
    throw error;
  }

  // 2b. Check Table Allocation if cafe has configured active tables
  const tableAllocation = await tableService.findSuitableTablesForBooking(cafe_id, total_persons, booking_date, start_time, end_time);
  const cafeTables = await tableRepository.getTablesByCafe(cafe_id);
  const activeTablesCount = cafeTables.filter(t => t.status === 'ACTIVE').length;

  if (activeTablesCount > 0 && !tableAllocation) {
    const error = new Error('No available cafe tables match your guest count for the selected time slot.');
    error.statusCode = 409;
    throw error;
  }

  // 3. Pricing Calculation
  let base_cafe_charge = Number(cafe.price_per_hour || 0) * hours;
  let package_add_on_charge = 0;
  let event_service_amount = 0;
  let actual_package_id = package_id;
  let actual_event_service_id = null;
  let eventServiceEntity = null;

  const validatedGuestCount = Math.max(1, Number(total_persons || 1));

  let selectedInclusionItems = [];
  let matchedProviderType = null;
  let pkg = null;

  if (package_id) {
    if (cafe.cafe_packages) {
      pkg = cafe.cafe_packages.find(p => String(p.id) === String(package_id));
      if (pkg) {
        matchedProviderType = 'CAFE';
        actual_package_id = pkg.id;
        const pkgBasePrice = Number(pkg.price || pkg.package_price || pkg.base_price || 0);
        if (pkgBasePrice > 0) {
          package_add_on_charge += pkgBasePrice;
        }
      }
    }
    
    if (!pkg) {
      const eventServiceRepo = require('../repositories/eventServiceRepository');
      const extService = await eventServiceRepo.findEventServiceById(package_id);
      if (extService) {
        pkg = extService;
        matchedProviderType = 'EVENT';
        eventServiceEntity = extService;
        actual_event_service_id = pkg.id;
        actual_package_id = null;
        
        // Check if event manager bank account is verified
        const prisma = require('../config/prisma');
        const eventProfile = await prisma.event_management_profiles.findFirst({
          where: { user_id: extService.user_id }
        });
        if (!eventProfile || String(eventProfile.bank_verification_status || '').toUpperCase() !== 'VERIFIED') {
          const error = new Error('Selected event service cannot be booked until the event manager verifies their bank account.');
          error.statusCode = 400;
          throw error;
        }

        event_service_amount += Number(extService.price !== null && extService.price !== undefined ? extService.price : 0);
      }
    }
  }

  // Also check event_service_id explicitly if passed separately or if pkg is not yet resolved
  if (!pkg && event_service_id) {
    const eventServiceRepo = require('../repositories/eventServiceRepository');
    const extService = await eventServiceRepo.findEventServiceById(event_service_id);
    if (extService) {
      pkg = extService;
      matchedProviderType = 'EVENT';
      eventServiceEntity = extService;
      actual_event_service_id = pkg.id;
      actual_package_id = null;
      
      const prisma = require('../config/prisma');
      const eventProfile = await prisma.event_management_profiles.findFirst({
        where: { user_id: extService.user_id }
      });
      if (!eventProfile || String(eventProfile.bank_verification_status || '').toUpperCase() !== 'VERIFIED') {
        const error = new Error('Selected event service cannot be booked until the event manager verifies their bank account.');
        error.statusCode = 400;
        throw error;
      }

      const baseServicePrice = Number(extService.price !== null && extService.price !== undefined ? extService.price : 0);
      // Only add base service price if service has an explicit base price and no inclusions override it
      if (baseServicePrice > 0 && (!extService.inclusions || extService.inclusions.length === 0)) {
        event_service_amount += baseServicePrice;
      }
    }
  }

  // Calculate Package & Inclusions Charges strictly on backend
  if (pkg) {
      console.log(`[FAHARA PACKAGE DEBUG] bookingId: ${data.bookingId || 'NEW'} | requestedPackageId: ${package_id} | resolvedPackageId: ${pkg.id} | providerType: ${matchedProviderType}`);

      let packageInclusionsTotal = 0;
      let rawInclusions = pkg.inclusions;
      if (typeof rawInclusions === 'string') {
        try { rawInclusions = JSON.parse(rawInclusions); } catch(e) { rawInclusions = null; }
      }

      // ─────────────────────────────────────────────────────────────────
      // CANONICAL INCLUSIONS NORMALIZER
      // Accepts data.inclusions as a flat array (the only supported format).
      // Each item must have inclusionId + tierId.
      // ─────────────────────────────────────────────────────────────────
      const normalizeBookingInclusions = (rawInput) => {
        if (!Array.isArray(rawInput) || rawInput.length === 0) return [];
        return rawInput.map((item, idx) => {
          const inclusionId = item.inclusionId || item.inclusion_id || null;
          const tierId = item.tierId || item.tier_id ||
            // fallback: item.id if it looks like a tier id (has _ suffix after the base incId)
            (item.id && inclusionId && item.id !== inclusionId ? item.id : null);
          const normalized = {
            inclusionId,
            tierId,
            tierName: item.tierName || item.tier_name || item.level || item.tierLevel || null,
            quantity: Number(item.quantity || 1),
            // pass-through fields for resolveInclusionSelection to use as secondary fallbacks
            _raw: item,
          };
          console.log(`[FAHARA INC-NORMALIZED] [${idx}] inclusionId=${inclusionId} | tierId=${tierId} | tierName=${normalized.tierName} | name=${item.name || item.inclusionName}`);
          return normalized;
        }).filter(n => n.inclusionId); // discard items with no inclusionId
      };

      // Extract client inclusion payload if provided
      const hasClientInclusionsPayload = Array.isArray(data.inclusions) && data.inclusions.length > 0;
      const clientInclusionsList = normalizeBookingInclusions(data.inclusions);
      let clientInclusionsObj = {}; // kept for legacy path compatibility

      console.log(`[FAHARA INC-RECV] isArray=${Array.isArray(data.inclusions)} | rawLen=${Array.isArray(data.inclusions) ? data.inclusions.length : 'N/A'} | normalizedLen=${clientInclusionsList.length}`);


      const resolveInclusionSelection = (inc, catKey) => {
        // --- STEP 1: Identify the DB inclusion record ---
        // incId is the PARENT inclusion id (e.g. "inc_1788950888119"), NOT a tier id
        const incId = inc.id || inc.inclusionId || inc.inclusion_id;
        const incName = inc.name || inc.category || inc.title || catKey || 'Inclusion';
        const tiers = Array.isArray(inc.tiers) ? inc.tiers : [];

        // --- STEP 2: Extract the client's selected tier object ---
        // The normalized list items have: { inclusionId, tierId, tierName, _raw }
        let rawClientSelection = null;

        // Priority 1: match by inclusionId (exact)
        if (incId && clientInclusionsList.length > 0) {
          const normIncId = String(incId).toLowerCase().replace(/[^a-z0-9]/g, '');
          const normIncName = String(incName).toLowerCase().replace(/[^a-z0-9]/g, '');

          rawClientSelection = clientInclusionsList.find(c => {
            // Match on inclusionId
            const cIncId = String(c.inclusionId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cTierId = String(c.tierId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cName = String(c._raw?.name || c._raw?.inclusionName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normIncId && cIncId && (cIncId === normIncId || cIncId.includes(normIncId) || normIncId.includes(cIncId))) return true;
            if (normIncId && cTierId && cTierId.startsWith(normIncId)) return true;
            if (normIncName && cName && (cName === normIncName || cName.includes(normIncName) || normIncName.includes(cName))) return true;
            return false;
          });

          if (rawClientSelection) {
            console.log(`[FAHARA INC-MATCH] incId=${incId} | incName=${incName} | matched => tierId=${rawClientSelection.tierId} | tierName=${rawClientSelection.tierName}`);
          }
        }

        // No client selection for this inclusion — skip it (user did not select / send this inclusion)
        if (hasClientInclusionsPayload && !rawClientSelection) {
          console.log(`[FAHARA INC-SKIP] incId=${incId} | incName=${incName} — not in client selection, skipping`);
          return null;
        }

        // Build clientSelectedTier from the normalized item's _raw (actual frontend object)
        const clientSelectedTier = rawClientSelection ? rawClientSelection._raw : null;

        // GUARD: if clientSelectedTier has a tiers array but no tierId — it's a raw DB object
        if (
          clientSelectedTier && typeof clientSelectedTier === 'object' &&
          Array.isArray(clientSelectedTier.tiers) &&
          !clientSelectedTier.tierId && !clientSelectedTier.tier_id && !clientSelectedTier.tierName && !clientSelectedTier.tier_name
        ) {
          console.log(`[FAHARA INC-GUARD] Detected raw DB inclusion blob for incId=${incId}. Rejecting to prevent tier fallback.`);
          return null;
        }



        // --- STEP 3: Extract the explicitly selected tierId and tierName ---
        let selectedTierId = rawClientSelection ? rawClientSelection.tierId : null;
        let selectedTierName = rawClientSelection ? rawClientSelection.tierName : null;
        let selectedDescription = null;
        let selectedUnitPrice = null;
        let selectedPricingType = null;
        let selectedQuantity = rawClientSelection ? rawClientSelection.quantity : null;

        if (clientSelectedTier && typeof clientSelectedTier === 'object') {
          // Augment from the raw frontend object if normalizer didn't extract them
          if (!selectedTierId) {
            selectedTierId = clientSelectedTier.tierId || clientSelectedTier.tier_id ||
              (clientSelectedTier.id && clientSelectedTier.id !== incId ? clientSelectedTier.id : null);
          }
          if (!selectedTierName) {
            selectedTierName = clientSelectedTier.tierName || clientSelectedTier.tier_name ||
              clientSelectedTier.tierLevel || clientSelectedTier.level ||
              (clientSelectedTier.name && ['basic', 'standard', 'premium'].includes(String(clientSelectedTier.name).toLowerCase()) ? clientSelectedTier.name : null);
          }
          // Extract tier suffix from tierId as last resort
          if (!selectedTierName && selectedTierId) {
            const parts = String(selectedTierId).split('_');
            const lastPart = parts[parts.length - 1].toLowerCase();
            if (['basic', 'standard', 'premium'].includes(lastPart)) selectedTierName = lastPart.toUpperCase();
          }
          selectedDescription = clientSelectedTier.description || clientSelectedTier.desc || null;
          selectedUnitPrice = clientSelectedTier.unitPrice ?? clientSelectedTier.unit_price ?? clientSelectedTier.price ?? null;
          selectedPricingType = clientSelectedTier.pricingType || clientSelectedTier.pricing_type || null;
          if (!selectedQuantity) selectedQuantity = clientSelectedTier.quantity || null;
        }

        // --- STEP 4: Look up the matching DB tier using ONLY selectedTierId or selectedTierName ---
        // RULE: NEVER use incId (the parent inclusion ID) to look up a tier.
        let dbTierMatch = null;
        if (tiers.length > 0 && (selectedTierId || selectedTierName)) {
          dbTierMatch = tiers.find(t => {
            const tTierId = String(t.id || t.tier_id || t.tierId || '').toLowerCase();
            const tTierName = String(t.tier_name || t.name || t.tierName || t.level || '').toLowerCase();
            const sId = String(selectedTierId || '').toLowerCase();
            const sName = String(selectedTierName || '').toLowerCase();
            // Exact tierId match
            if (sId && tTierId === sId) return true;
            // Suffix match (e.g. inc_xxx_basic vs inc_xxx_tier_basic)
            if (sId && tTierName && sId.endsWith(tTierName)) return true;
            // Tier name match (BASIC/STANDARD/PREMIUM)
            if (sName && tTierName === sName) return true;
            if (sName && tTierName.includes(sName)) return true;
            return false;
          });
        }

        // If no client selection resolved AND tiers exist:
        // NEVER silently fall back to tiers[0]. The client MUST specify the tier.
        if (!dbTierMatch && !selectedTierId && !selectedTierName && tiers.length > 0) {
          console.log(`[FAHARA INC-ERROR] incId=${incId} | No matching tier found and no client selection. SKIPPING — do NOT default to first tier.`);
          return null;
        }

        // --- STEP 5: Build final resolved values ---
        // Priority: client explicit > DB tier > DB inclusion defaults

        // tierId: use selectedTierId (explicit). NEVER replace with incId.
        const finalTierId = selectedTierId ||
          (dbTierMatch ? (dbTierMatch.id || dbTierMatch.tier_id || dbTierMatch.tierId) : null) ||
          (selectedTierName ? `${incId}_${selectedTierName.toLowerCase()}` : null);

        // tierName: explicit client value wins
        const finalTierName = (selectedTierName ? selectedTierName.toUpperCase() : null) ||
          (dbTierMatch ? (dbTierMatch.tier_name || dbTierMatch.name) : null);

        // unitPrice: DB tier is authoritative (database price), client price is a fallback
        // (prevents client from manipulating prices, but falls back to client if DB tier not found)
        let finalUnitPrice;
        if (dbTierMatch) {
          finalUnitPrice = Number(dbTierMatch.unit_price ?? dbTierMatch.price ?? selectedUnitPrice ?? inc.unit_price ?? inc.price ?? 0);
        } else if (selectedUnitPrice !== null && selectedUnitPrice !== undefined) {
          finalUnitPrice = Number(selectedUnitPrice);
        } else {
          finalUnitPrice = Number(inc.unit_price || inc.unitPrice || inc.price || 0);
        }

        // pricingType: explicit > DB tier > DB inclusion > catKey default
        const finalPricingType = String(
          (dbTierMatch && (dbTierMatch.pricing_type || dbTierMatch.pricingType)) ||
          selectedPricingType ||
          inc.pricing_type || inc.pricingType ||
          (catKey === 'food_items' ? 'PER_GUEST' : 'FIXED')
        ).toUpperCase();

        // description: DB tier > client > inclusion default
        const finalDescription = (dbTierMatch && dbTierMatch.description) || selectedDescription || inc.description || null;

        // quantity
        const finalQuantity = Math.max(1, Number(selectedQuantity || inc.quantity || 1));

        // amount based on pricing type
        const finalAmount = finalPricingType === 'PER_GUEST' ? (finalUnitPrice * validatedGuestCount) : (finalUnitPrice * finalQuantity);
        const finalLevel = finalTierName ? (finalTierName.charAt(0).toUpperCase() + finalTierName.slice(1).toLowerCase()) : null;

        console.log(`[FAHARA INCLUSION] incId=${incId} | selectedTierId=${selectedTierId} | finalTierId=${finalTierId} | finalTierName=${finalTierName} | dbTierMatch=${dbTierMatch ? dbTierMatch.tier_name : 'NONE'} | finalUnitPrice=${finalUnitPrice} | pricingType=${finalPricingType} | guestCount=${validatedGuestCount} | amount=${finalAmount}`);

        return {
          provider_type: matchedProviderType,
          item_type: matchedProviderType === 'CAFE' ? 'CAFE_INCLUSION' : 'EVENT_INCLUSION',
          provider_id: matchedProviderType === 'CAFE' ? cafe_id : eventServiceEntity?.id,
          package_id: matchedProviderType === 'CAFE' ? actual_package_id : null,
          event_service_id: matchedProviderType === 'EVENT' ? actual_event_service_id : null,
          inclusion_id: incId,
          tier_id: finalTierId,
          item_name: `${incName} (${finalTierName || 'Standard'})`,
          tier_name: finalTierName,
          package_level: finalLevel,
          level: finalLevel,
          tier_level: finalLevel,
          pricing_type: finalPricingType,
          unit_price: finalUnitPrice,
          quantity: finalQuantity,
          amount: Number(finalAmount.toFixed(2)),
          description: finalDescription
        };
      };


      if (Array.isArray(rawInclusions)) {
        rawInclusions.forEach(inc => {
          if (inc && typeof inc === 'object') {
            const itemRes = resolveInclusionSelection(inc);
            if (itemRes) {
              selectedInclusionItems.push(itemRes);
              packageInclusionsTotal += itemRes.amount;
            }
          }
        });
      } else if (rawInclusions && typeof rawInclusions === 'object') {
        const catKeys = ['food_items', 'cake_items', 'decoration_items', 'music_items', 'other_items'];
        catKeys.forEach(catKey => {
          const items = rawInclusions[catKey];
          if (Array.isArray(items) && items.length > 0) {
            items.forEach(inc => {
              const itemRes = resolveInclusionSelection(inc, catKey);
              if (itemRes) {
                selectedInclusionItems.push(itemRes);
                packageInclusionsTotal += itemRes.amount;
              }
            });
          }
        });
      }

      if (matchedProviderType === 'CAFE') {
        package_add_on_charge = packageInclusionsTotal;
      } else {
        event_service_amount += packageInclusionsTotal;
      }
    }

  // Calculate Selected Optional Add-ons Charges strictly on backend
  let addOnsTotal = 0;
  if (data.selected_add_ons && Array.isArray(data.selected_add_ons)) {
    data.selected_add_ons.forEach(addOn => {
      const unitPrice = Number(addOn.price || addOn.unitPrice || 0);
      const pType = String(addOn.pricing_type || addOn.pricingType || 'FIXED').toUpperCase();
      if (pType === 'PER_GUEST') {
        addOnsTotal += unitPrice * validatedGuestCount;
      } else if (pType === 'PER_UNIT') {
        const qty = Math.max(1, Number(addOn.quantity || addOn.qty || 1));
        addOnsTotal += unitPrice * qty;
      } else {
        addOnsTotal += unitPrice;
      }
    });
  }

  let cafe_amount = base_cafe_charge;
  let final_food_amount = package_add_on_charge + addOnsTotal;
  let final_decoration_amount = 0;
  let final_extra_person_amount = 0;



  // If event_service_id is explicitly passed and base price not yet accumulated
  if (event_service_id && actual_event_service_id !== event_service_id) {
    const eventServiceRepo = require('../repositories/eventServiceRepository');
    const extService = await eventServiceRepo.findEventServiceById(event_service_id);
    if (extService) {
      eventServiceEntity = extService;
      if (matchedProviderType !== 'EVENT') {
        event_service_amount += Number(extService.price !== null && extService.price !== undefined ? extService.price : 0);
      }
      actual_event_service_id = event_service_id;
    }
  }

  // Check Event Service business hours if selected
  const eventBusinessHoursErr = eventServiceEntity 
    ? bookingUtils.checkBookingTimeBusinessHours(eventServiceEntity, booking_date, start_time, end_time, 'Event Service')
    : null;

  if (cafeBusinessHoursErr && eventBusinessHoursErr) {
    const error = new Error(`Both Cafe and Event Service are not available at the selected time slot.`);
    error.statusCode = 400;
    throw error;
  } else if (cafeBusinessHoursErr) {
    const error = new Error(cafeBusinessHoursErr);
    error.statusCode = 400;
    throw error;
  } else if (eventBusinessHoursErr) {
    const error = new Error(eventBusinessHoursErr);
    error.statusCode = 400;
    throw error;
  }

  let appliedDiscount = Number(discount || 0);

  // Validate user loyalty credit balance if credit discount is applied
  if (data.redeemed_credits && Number(data.redeemed_credits) > 0) {
    const creditsToRedeem = Number(data.redeemed_credits);
    const prisma = require('../config/prisma');
    const loyaltyAccount = await prisma.user_loyalty_accounts.findUnique({
      where: { user_id: userId }
    });

    const currentBalance = loyaltyAccount ? Number(loyaltyAccount.credit_balance || 0) : 0;
    if (currentBalance < creditsToRedeem) {
      const error = new Error(`Insufficient Fahara Credits. You have ${currentBalance} credits available.`);
      error.statusCode = 400;
      throw error;
    }

    const creditDiscountRupees = creditsToRedeem / 50; // 50 credits = ₹1
    appliedDiscount = Math.max(appliedDiscount, creditDiscountRupees);
  }

  let final_event_service_amount = 0; // Excluded from subtotal calculation per user requirements

  const rawSubtotal = Math.max(0, cafe_amount + final_food_amount + final_decoration_amount + final_extra_person_amount + event_service_amount - appliedDiscount);
  const subtotal = Number(rawSubtotal.toFixed(2));

  // Apply Fahara Service Charge (3%)
  const fahara_service_charge = Number((subtotal * 0.03).toFixed(2));

  // Apply Transaction Fee (3% from subtotal)
  const transaction_fee = Number((subtotal * 0.03).toFixed(2));

  // Apply GST (18% on transaction fee)
  const gst = Number((transaction_fee * 0.18).toFixed(2));

  const total = Number((subtotal + fahara_service_charge + transaction_fee + gst).toFixed(2));

  // 4. Generate Booking Number
  const booking_number = bookingUtils.generateBookingNumber();

  // Helper to snapshot only selected/single tier per inclusion category
  const sanitizeInclusionsForStorage = (rawInc) => {
    if (!rawInc) return null;
    let parsed = typeof rawInc === 'string' ? (() => { try { return JSON.parse(rawInc); } catch (e) { return null; } })() : rawInc;
    if (!parsed || typeof parsed !== 'object') return rawInc;

    const snapshot = { ...parsed };
    const catKeys = ['food_items', 'cake_items', 'decoration_items', 'music_items', 'other_items'];

    catKeys.forEach(catKey => {
      if (Array.isArray(parsed[catKey]) && parsed[catKey].length > 0) {
        // If customer provided array of selected items in parsed[catKey], keep it directly
        snapshot[catKey] = parsed[catKey];
      }
    });

    return snapshot;
  };

  let inclusionsToStore = null;
  if (selectedInclusionItems && selectedInclusionItems.length > 0) {
    inclusionsToStore = selectedInclusionItems;
  } else if (data.inclusions) {
    inclusionsToStore = sanitizeInclusionsForStorage(data.inclusions);
  } else if (actual_package_id && cafe.cafe_packages) {
    const pkg = cafe.cafe_packages.find(p => String(p.id) === String(actual_package_id));
    if (pkg && pkg.inclusions) {
      inclusionsToStore = sanitizeInclusionsForStorage(pkg.inclusions);
    }
  }

  const isFreeReservation = isRestaurant || total === 0;

  // 5. Create Booking
  const bookingRecord = {
    booking_number,
    customer_id: userId,
    cafe_id,
    package_id: actual_package_id,
    event_service_id: actual_event_service_id,
    booking_date: bDate,
    start_time: sTime,
    end_time: eTime,
    hours,
    total_persons,
    cafe_amount,
    event_service_amount,
    food_amount: final_food_amount,
    decoration_amount: final_decoration_amount,
    extra_person_amount,
    subtotal,
    discount: appliedDiscount,
    fahara_service_charge,
    transaction_fee,
    gst,
    total,
    inclusions: inclusionsToStore,
    payment_status: isFreeReservation ? 'PAID' : 'PENDING',
    booking_status: 'PENDING',
    special_request: special_request || '',
    event_special_request: event_special_request || '',
  };

  const createdBooking = await bookingRepository.createBooking(bookingRecord);

  // 6. Save itemized booking_items snapshot
  const prisma = require('../config/prisma');
  const itemsToCreate = [];
  
  // Cafe charge item if present
  if (cafe_amount > 0) {
    const pricePerHour = Number(cafe.price_per_hour || 0);
    const cafeChargeUnitPrice = pricePerHour > 0 ? pricePerHour : cafe_amount;
    const cafeChargeQty = pricePerHour > 0 ? Math.max(1, Number(hours || 1)) : 1;
    itemsToCreate.push({
      booking_id: createdBooking.id,
      provider_type: 'CAFE',
      item_type: 'CAFE_CHARGE',
      provider_id: cafe_id,
      item_name: 'Cafe Charges',
      pricing_type: 'FIXED',
      unit_price: cafeChargeUnitPrice,
      quantity: cafeChargeQty,
      amount: cafe_amount,
      description: `${hours} hours booking`
    });
  }


  // Base package record if present
  if (actual_package_id && cafe.cafe_packages) {
    const pkg = cafe.cafe_packages.find(p => String(p.id) === String(actual_package_id));
    if (pkg) {
      const basePkgPrice = Number(pkg.price || pkg.package_price || pkg.base_price || 0);
      itemsToCreate.push({
        booking_id: createdBooking.id,
        provider_type: 'CAFE',
        item_type: 'PACKAGE',
        provider_id: cafe_id,
        package_id: actual_package_id,
        item_name: pkg.package_name || pkg.name || 'Cafe Package',
        package_name: pkg.package_name || pkg.name || 'Cafe Package',
        package_level: pkg.package_level || null,
        pricing_type: 'FIXED',
        unit_price: basePkgPrice,
        quantity: 1,
        guest_count: validatedGuestCount,
        amount: basePkgPrice,
        is_package_base: true,
        is_addon: false,
        description: pkg.description || null
      });
    }
  }

  // Add parsed inclusion items to itemsToCreate
  selectedInclusionItems.forEach(incItem => {
    const formattedLevel = incItem.level || incItem.tier_level ||
      (incItem.tier_name ? (incItem.tier_name.charAt(0).toUpperCase() + incItem.tier_name.slice(1).toLowerCase()) : null);
    const itemProvType = incItem.provider_type || (actual_event_service_id ? 'EVENT' : 'CAFE');
    itemsToCreate.push({
      booking_id: createdBooking.id,
      provider_type: itemProvType,
      item_type: incItem.item_type || (itemProvType === 'EVENT' ? 'EVENT_INCLUSION' : 'CAFE_INCLUSION'),
      provider_id: incItem.provider_id || (itemProvType === 'EVENT' ? actual_event_service_id : cafe_id),
      package_id: itemProvType === 'CAFE' ? (incItem.package_id || actual_package_id || null) : null,
      inclusion_id: incItem.inclusion_id,
      tier_id: incItem.tier_id,
      item_name: incItem.item_name,
      tier_name: incItem.tier_name,
      package_level: formattedLevel,
      pricing_type: incItem.pricing_type,
      unit_price: incItem.unit_price,
      quantity: incItem.quantity,
      amount: incItem.amount,
      description: incItem.description
    });
  });

  // Parse any explicit cafeSelections and eventSelections if provided
  let cafeSelections = Array.isArray(data.cafeSelections) ? data.cafeSelections : [];
  let eventSelections = Array.isArray(data.eventSelections) ? data.eventSelections : [];

  cafeSelections.forEach(sel => {
    const pricingType = String(sel.pricingType || sel.pricing_type || 'FIXED').toUpperCase();
    const unitPrice = Number(sel.unitPrice || sel.price || 0);
    const qty = Math.max(1, Number(sel.quantity || sel.qty || 1));
    const amount = pricingType === 'PER_GUEST' ? (unitPrice * validatedGuestCount) : (unitPrice * qty);

    itemsToCreate.push({
      booking_id: createdBooking.id,
      provider_type: 'CAFE',
      item_type: sel.itemType || 'CAFE_INCLUSION',
      provider_id: cafe_id,
      package_id: sel.packageId || actual_package_id || null,
      inclusion_id: sel.inclusionId || sel.id || null,
      tier_id: sel.tierId || null,
      item_name: sel.itemName || sel.title || sel.name || 'Cafe Inclusion',
      tier_name: sel.tierName || sel.tier || null,
      pricing_type: pricingType,
      unit_price: unitPrice,
      quantity: qty,
      amount: amount,
      description: sel.description || null
    });
  });

  eventSelections.forEach(sel => {
    const pricingType = String(sel.pricingType || sel.pricing_type || 'FIXED').toUpperCase();
    const unitPrice = Number(sel.unitPrice || sel.price || 0);
    const qty = Math.max(1, Number(sel.quantity || sel.qty || 1));
    const amount = pricingType === 'PER_GUEST' ? (unitPrice * validatedGuestCount) : (unitPrice * qty);

    itemsToCreate.push({
      booking_id: createdBooking.id,
      provider_type: 'EVENT',
      item_type: sel.itemType || 'EVENT_INCLUSION',
      provider_id: sel.providerId || actual_event_service_id || null,
      package_id: sel.packageId || actual_event_service_id || null,
      inclusion_id: sel.inclusionId || sel.id || null,
      tier_id: sel.tierId || null,
      item_name: sel.itemName || sel.title || sel.name || 'Event Inclusion',
      tier_name: sel.tierName || sel.tier || null,
      pricing_type: pricingType,
      unit_price: unitPrice,
      quantity: qty,
      amount: amount,
      description: sel.description || null
    });
  });

  if (itemsToCreate.length > 0) {
    await prisma.booking_items.createMany({ data: itemsToCreate });
  }

  // Assign chosen or allocated tables to booking record if present
  const assignedTableIds = table_id ? [table_id] : (tableAllocation && Array.isArray(tableAllocation.table_ids) ? tableAllocation.table_ids : []);
  if (assignedTableIds.length > 0) {
    await tableRepository.assignTablesToBooking(createdBooking.id, assignedTableIds);
  }

  // Fetch full details for notification
  const fullBooking = await bookingRepository.getBookingById(createdBooking.id);
  // Fire and forget notification
  notificationService.notifyBookingCreated(fullBooking).catch(err => console.error(err));

  // Return the full pricing engine output (includes itemized breakdown with calculation strings,
  // tier names, IDs, level, etc.) merged with essential booking record fields the frontend needs.
  const pricingEngine = require('./pricingEngine');
  const pricingResult = await pricingEngine.calculateBookingPricing(createdBooking.id);
  return {
    ...pricingResult,
    // Essential booking record fields for frontend routing
    id: createdBooking.id,
    booking_number: createdBooking.booking_number,
    payment_status: createdBooking.payment_status,
    booking_status: createdBooking.booking_status,
    total: createdBooking.total,
  };


};

const getMyBookings = async (userId) => {
  return await bookingRepository.getBookingsByCustomer(userId);
};

const getCafeBookings = async (ownerId, query = {}, userRole = 'CAFE_OWNER') => {
  let bookings = await bookingRepository.getBookingsByCafeOwner(ownerId, userRole);
  
  if (query.status && query.status.toUpperCase() !== 'ALL') {
    bookings = bookings.filter(b => b.booking_status.toUpperCase() === query.status.toUpperCase());
  }

  // Frontend expects mapped format
  return bookings.map(b => {
    let cafeNet = Number(b.cafe_amount || 0);
    if (cafeNet === 0 && Array.isArray(b.booking_items)) {
      cafeNet = b.booking_items
        .filter(it => it.provider_type === 'CAFE' || it.item_type === 'CAFE_CHARGE' || it.item_type === 'CAFE_INCLUSION')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    }
    if (cafeNet === 0 && b.subtotal !== undefined && b.subtotal !== null) {
      const calcSub = Number(b.subtotal || 0);
      const evAmt = Number(b.event_service_amount || 0);
      cafeNet = calcSub >= evAmt ? (calcSub - evAmt) : calcSub;
    }
    cafeNet = Math.max(0, cafeNet);

    const calculatedAmount = userRole === 'EVENT_MANAGER'
      ? Number(b.event_service_amount || 0)
      : cafeNet;

    return {
      id: b.id,
      booking_number: b.booking_number,
      customerName: b.users?.name || 'Guest User',
      customerEmail: b.users?.email || 'N/A',
      customerPhone: b.users?.phone || 'N/A',
      cafeName: b.cafes?.name,
      date: b.booking_date,
      startTime: b.start_time,
      endTime: b.end_time,
      guests: b.total_persons,
      amount: calculatedAmount,
      status: b.booking_status,
      paymentStatus: b.payment_status || 'PENDING',
      createdAt: b.created_at,
      package_name: b.packages?.package_name || b.packages?.name || b.packages?.title || b.event_services?.service_name || b.event_services?.title || b.event_services?.name || 'Standard Package'
    };
  });
};

const getAllAdminBookings = async (query = {}) => {
  const bookings = await bookingRepository.getAllAdminBookings(query);

  return bookings.map(b => ({
    id: b.id,
    booking_number: b.booking_number,
    customerName: b.users?.name || 'Guest User',
    customerEmail: b.users?.email,
    customerPhone: b.users?.phone,
    cafeName: b.cafes?.name,
    eventManagerName: b.event_services?.users?.name || 'N/A',
    date: b.booking_date,
    startTime: b.start_time,
    endTime: b.end_time,
    guests: b.total_persons,
    amount: Number(b.total || 0),
    status: b.booking_status,
    paymentStatus: b.payment_status,
    createdAt: b.created_at,
    package_name: b.packages?.package_name || b.packages?.name || b.packages?.title || 'Standard Package',
    event_service_name: b.event_services?.service_name || b.event_services?.title || b.event_services?.name || 'N/A'
  }));
};

const sanitizeBookingForPartner = (booking) => {
  if (!booking) return booking;
  const sanitized = { ...booking };
  delete sanitized.fahara_service_charge;
  delete sanitized.gst;
  delete sanitized.transaction_fee;
  return sanitized;
};

const getBookingById = async (id, userId, userRole) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  // Authorization check
  if (userRole === 'ADMIN') {
    return booking; // Admin can view any booking
  }

  if (userRole === 'CUSTOMER') {
    if (booking.customer_id !== userId) {
      const error = new Error('Unauthorized access to booking');
      error.statusCode = 403;
      throw error;
    }
    return booking;
  }

  const isCafeOwner = booking.cafes?.owner_id === userId;
  const isEventManager = booking.event_services?.user_id === userId;

  if (userRole === 'CAFE_OWNER' && !isCafeOwner) {
    const error = new Error('Unauthorized access to booking');
    error.statusCode = 403;
    throw error;
  }

  if (userRole === 'EVENT_MANAGER' && !isEventManager) {
    const error = new Error('Unauthorized access to booking');
    error.statusCode = 403;
    throw error;
  }

  if (userRole === 'CAFE_OWNER' || userRole === 'EVENT_MANAGER') {
    return sanitizeBookingForPartner(booking);
  }

  return booking;
};

const updateBookingStatus = async (id, userId, status) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  // Only Cafe Owner or Event Manager can update the status
  const isCafeOwner = booking.cafes.owner_id === userId;
  const isEventManager = booking.event_services?.user_id === userId;

  if (!isCafeOwner && !isEventManager) {
    const error = new Error('Unauthorized to update this booking status');
    error.statusCode = 403;
    throw error;
  }

  // Prevent duplicate status updates and emails
  if (booking.booking_status === status || booking.payment_status === status) {
    return booking;
  }

  // Process refund if cafe owner cancels a paid booking
  if (status === 'CANCELLED' && booking.payment_status === 'PAID') {
    const paymentService = require('./paymentService');
    await paymentService.processRefund(id);
    await bookingRepository.updateBookingPaymentStatus(id, 'REFUNDED');
  }

  const updatedBooking = await bookingRepository.updateBookingStatus(id, status);
  
  // Loyalty Service Hook: Award 1 credit when status becomes COMPLETED, or Reverse if CANCELLED
  const loyaltyService = require('./loyaltyService');
  if (status === 'COMPLETED') {
    loyaltyService.awardBookingCredit(id).catch(err => console.error('[LoyaltyHook] Error awarding credit:', err));
  } else if (status === 'CANCELLED' || status === 'REJECTED') {
    loyaltyService.reverseBookingCredit(id, `Booking status changed to ${status}`).catch(err => console.error('[LoyaltyHook] Error reversing credit:', err));
  }
  
  // Fetch full details for notification
  const fullBooking = await bookingRepository.getBookingById(id);
  const actorRole = isCafeOwner ? 'Cafe Owner' : 'Event Manager';
  // Fire and forget notification
  notificationService.notifyBookingStatusUpdated(fullBooking, status, actorRole).catch(err => console.error(err));

  return updatedBooking;
};

const cancelBooking = async (id, userId, userRole) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  const isCustomer = booking.customer_id === userId;
  const isCafeOwner = booking.cafes?.owner_id === userId;
  const isEventManager = booking.event_services?.user_id === userId;
  const isAdmin = userRole === 'ADMIN';

  if (!isCustomer && !isCafeOwner && !isEventManager && !isAdmin) {
    const error = new Error('Unauthorized to cancel this booking');
    error.statusCode = 403;
    throw error;
  }

  if (booking.booking_status === 'CANCELLED') {
    const error = new Error('Booking is already cancelled');
    error.statusCode = 400;
    throw error;
  }

  // Customer cancellation rule: allowed ONLY within 3 hours from the time of booking creation
  if (isCustomer && !isAdmin && !isCafeOwner && !isEventManager) {
    const now = new Date();
    const bookingCreatedAt = new Date(booking.created_at || now);
    const hoursSinceBookingCreated = (now.getTime() - bookingCreatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceBookingCreated > 3) {
      const error = new Error('Cancellations are allowed only within 3 hours from the time of booking creation.');
      error.statusCode = 400;
      throw error;
    }
  }

  // Process refund if paid
  if (booking.payment_status === 'PAID') {
    await paymentService.processRefund(id);
    await bookingRepository.updateBookingPaymentStatus(id, 'REFUNDED');
  }

  const updatedBooking = await bookingRepository.updateBookingStatus(id, 'CANCELLED');

  // Loyalty Service Hook: Reverse credit if previously awarded
  const loyaltyService = require('./loyaltyService');
  loyaltyService.reverseBookingCredit(id, 'Booking cancelled by customer/admin').catch(err => console.error('[LoyaltyHook] Error reversing credit:', err));
  
  // Fetch full details for notification
  const fullBooking = await bookingRepository.getBookingById(id);
  let actorRole = 'Customer';
  if (isAdmin) actorRole = 'Admin';
  else if (isCafeOwner) actorRole = 'Cafe Owner';
  else if (isEventManager) actorRole = 'Event Manager';

  notificationService.notifyBookingStatusUpdated(fullBooking, 'CANCELLED', actorRole).catch(err => console.error(err));

  return updatedBooking;
};

const deleteBooking = async (id, userId, userRole) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }
  
  const isCustomer = booking.customer_id === userId;
  const isCafeOwner = booking.cafes?.owner_id === userId;
  const isEventManager = booking.event_services?.user_id === userId;
  const isAdmin = userRole === 'ADMIN';

  if (!isCustomer && !isCafeOwner && !isEventManager && !isAdmin) {
    const error = new Error('Unauthorized to delete this booking');
    error.statusCode = 403;
    throw error;
  }
  
  // Actually delete the booking using Prisma
  return await bookingRepository.deleteBooking(booking.id);
};

const getBookingPricing = async (id, userId, userRole) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  const pricingEngine = require('./pricingEngine');
  return await pricingEngine.calculateBookingPricing(id);
};

const selectPackage = async (id, userId, payload) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  const pricingEngine = require('./pricingEngine');
  const providerType = (payload.providerType || payload.provider_type || 'CAFE').toUpperCase();
  const packageId = payload.packageId || payload.package_id;
  const addOnInclusionIds = Array.isArray(payload.addOns)
    ? payload.addOns.map(a => typeof a === 'string' ? a : (a.inclusionId || a.inclusion_id || a.id))
    : (Array.isArray(payload.addOnInclusionIds) ? payload.addOnInclusionIds : []);

  await pricingEngine.saveBookingSelection({
    bookingId: id,
    providerType,
    packageId,
    addOnInclusionIds,
  });

  return await pricingEngine.calculateBookingPricing(id);
};

module.exports = {
  createBooking,
  getMyBookings,
  getCafeBookings,
  getAllAdminBookings,
  getBookingById,
  getBookingPricing,
  selectPackage,
  updateBookingStatus,
  cancelBooking,
  deleteBooking,
};
