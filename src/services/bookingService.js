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


  // 1. Validate Cafe & Customer Visibility & Bank Verification
  const { isCafeCustomerVisible } = require('./cafeVisibilityService');
  const isVisible = await isCafeCustomerVisible(cafe_id);
  if (!isVisible) {
    const error = new Error('This cafe is currently unavailable for new bookings.');
    error.statusCode = 403;
    error.code = 'CAFE_NOT_AVAILABLE';
    throw error;
  }

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

  // 1b-1. Authoritative Package Duration Resolution
  // If an Event Manager package (event_service_id) or Cafe Owner package (package_id) is selected,
  // automatically calculate the authoritative duration and end_time from the package record.
  let authoritativeHours = hours ? Number(hours) : 1;
  let authoritativeEndTime = end_time;

  let initialPkg = null;
  if (package_id && cafe.cafe_packages) {
    initialPkg = cafe.cafe_packages.find(p => String(p.id) === String(package_id));
  }
  if (!initialPkg && (event_service_id || package_id)) {
    const targetLookupId = event_service_id || package_id;
    const eventServiceRepo = require('../repositories/eventServiceRepository');
    const ext = await eventServiceRepo.findEventServiceById(targetLookupId);
    if (ext) {
      initialPkg = ext;
    }
  }

  if (initialPkg) {
    const configuredDuration = Number(initialPkg.duration_hours || initialPkg.durationHours || 0);
    if (configuredDuration > 0) {
      authoritativeHours = configuredDuration;
      
      // Calculate end_time = start_time + authoritativeHours
      const [sH, sM, sS] = String(start_time).split(':').map(Number);
      const startTotalMinutes = sH * 60 + (sM || 0);
      const endTotalMinutes = startTotalMinutes + (configuredDuration * 60);
      
      const calcEndHour = Math.floor(endTotalMinutes / 60) % 24;
      const calcEndMin = Math.floor(endTotalMinutes % 60);
      authoritativeEndTime = `${String(calcEndHour).padStart(2, '0')}:${String(calcEndMin).padStart(2, '0')}:${String(sS || 0).padStart(2, '0')}`;
      console.log(`[BOOKING DURATION] Automatically calculated authoritative end time ${authoritativeEndTime} based on package duration of ${configuredDuration} hours`);
    }
  }

  if (!authoritativeEndTime) {
    // Default fallback to 1 hour if neither package duration nor client end_time provided
    const [sH, sM, sS] = String(start_time).split(':').map(Number);
    const calcEndHour = (sH + authoritativeHours) % 24;
    authoritativeEndTime = `${String(calcEndHour).padStart(2, '0')}:${String(sM || 0).padStart(2, '0')}:${String(sS || 0).padStart(2, '0')}`;
  }

  const effectiveEndTime = authoritativeEndTime;
  const effectiveHours = authoritativeHours;

  // 1b-2. Check if selected booking time is within Cafe operating hours
  const cafeBusinessHoursErr = bookingUtils.checkBookingTimeBusinessHours(cafe, booking_date, start_time, effectiveEndTime, 'Cafe');

  // 1c. Enforce 24-hour advance booking policy
  if (bookingUtils.isBookingWithin24Hours(booking_date, start_time)) {
    const error = new Error('Bookings must be made at least 24 hours in advance of the scheduled booking time.');
    error.statusCode = 400;
    throw error;
  }

  // format date and times
  const dateStr = typeof booking_date === 'string' ? booking_date.split('T')[0] : new Date(booking_date).toISOString().split('T')[0];
  const bDate = new Date(dateStr);

  const cleanTimeStr = (t) => {
    if (!t) return '12:00:00';
    let s = String(t).trim();
    if (s.includes(' ')) {
      const [val, mod] = s.split(' ');
      let [h, m] = val.split(':').map(Number);
      if (mod?.toUpperCase() === 'PM' && h < 12) h += 12;
      if (mod?.toUpperCase() === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00`;
    }
    const parts = s.split(':');
    const h = String(parts[0] || '12').padStart(2, '0');
    const m = String(parts[1] || '00').padStart(2, '0');
    const sec = String(parts[2] || '00').padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const cleanStartTime = cleanTimeStr(start_time);
  const cleanEndTime = cleanTimeStr(effectiveEndTime);

  // Assuming start_time and end_time are provided as HH:mm:ss strings, convert them for Prisma
  const sTime = new Date(`1970-01-01T${cleanStartTime}Z`);
  const eTime = new Date(`1970-01-01T${cleanEndTime}Z`);

  // 2. Check Availability and Vendor Availability Blocks
  const availRepo = require('../repositories/availabilityRepository');
  const reqStartDt = new Date(`${dateStr}T${cleanStartTime}`);
  const reqEndDt = new Date(`${dateStr}T${cleanEndTime}`);
  const overlappingBlock = await availRepo.checkOverlap(cafe_id, reqStartDt, reqEndDt);
  if (overlappingBlock) {
    const reasonMsg = overlappingBlock.reason === 'HOLIDAY' ? 'the cafe is closed for a holiday' :
                      overlappingBlock.reason === 'PRIVATE_EVENT' ? 'a private event is scheduled' :
                      overlappingBlock.reason === 'MAINTENANCE' ? 'the cafe is undergoing maintenance' :
                      'the cafe is temporarily unavailable';
    const error = new Error(`The selected time slot is unavailable because ${reasonMsg}. Please choose another time.`);
    error.statusCode = 409;
    error.code = 'SLOT_BLOCKED';
    error.blockReason = overlappingBlock.reason;
    throw error;
  }

  const potentialEventServiceId = event_service_id || package_id;
  const isAvailable = await bookingRepository.checkAvailability(cafe_id, bDate, sTime, eTime, potentialEventServiceId);
  if (!isAvailable) {
    const error = new Error('The selected time slot is not available as another booking was confirmed or the slot is blocked.');
    error.statusCode = 409;
    error.code = 'SLOT_BOOKED';
    throw error;
  }

  // 2b. Check Table Allocation if cafe has configured active tables
  const tableAllocation = await tableService.findSuitableTablesForBooking(cafe_id, total_persons, booking_date, start_time, effectiveEndTime);
  const cafeTables = await tableRepository.getTablesByCafe(cafe_id);
  const activeTablesCount = cafeTables.filter(t => t.status === 'ACTIVE').length;

  if (activeTablesCount > 0 && !tableAllocation) {
    const error = new Error('No available cafe tables match your guest count for the selected time slot.');
    error.statusCode = 409;
    throw error;
  }

  // 3. Pricing Calculation
  let base_cafe_charge = (cafe.provides_event_services === true) ? 0 : (Number(cafe.price_per_hour || 0) * effectiveHours);
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

        const baseServicePrice = Number(extService.price !== null && extService.price !== undefined ? extService.price : 0);
        const pType = (extService.pricing_type || 'FIXED').toUpperCase();
        if (pType === 'PER_GUEST') {
          event_service_amount = baseServicePrice * validatedGuestCount;
        } else {
          event_service_amount = baseServicePrice;
        }
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
      const pType = (extService.pricing_type || 'FIXED').toUpperCase();
      if (pType === 'PER_GUEST') {
        event_service_amount = baseServicePrice * validatedGuestCount;
      } else {
        event_service_amount = baseServicePrice;
      }
    }
  }

  // 1d. Validate Event Manager Availability Blocks, Buffer times, and Capacity
  if (eventServiceEntity && eventServiceEntity.user_id) {
    const eventManagerId = eventServiceEntity.user_id;
    const eventAvailRepo = require('../repositories/eventAvailabilityRepository');
    
    // Check if the event manager profile is active
    const prisma = require('../config/prisma');
    const emProfile = await prisma.event_management_profiles.findFirst({
      where: { user_id: eventManagerId }
    });
    if (emProfile && emProfile.is_active === false) {
      const error = new Error('The selected event manager is currently not accepting new bookings.');
      error.statusCode = 403;
      error.code = 'EVENT_MANAGER_INACTIVE';
      throw error;
    }

    // Check Event Manager Availability Blocks overlapping requested interval
    const emBlock = await eventAvailRepo.checkOverlap(eventManagerId, reqStartDt, reqEndDt, null, eventServiceEntity.id);
    if (emBlock) {
      const reasonMsg = emBlock.reason === 'HOLIDAY' ? 'the event manager is on holiday' :
                        emBlock.reason === 'PRIVATE_EVENT' ? 'a private event is reserved' :
                        emBlock.reason === 'PERSONAL_BOOKING' ? 'a personal event is booked' :
                        emBlock.reason === 'EQUIPMENT_SETUP' ? 'equipment setup is scheduled' :
                        emBlock.reason === 'MAINTENANCE' ? 'equipment maintenance is ongoing' :
                        'the event manager has blocked this time slot';
      const error = new Error(`The selected time slot is unavailable because ${reasonMsg}. Please choose another time.`);
      error.statusCode = 409;
      error.code = 'EVENT_MANAGER_SLOT_BLOCKED';
      error.blockReason = emBlock.reason;
      throw error;
    }

    // Check buffer minutes configured in any active blocks or default preparation/cleanup buffers
    const nearbyBlocks = await prisma.event_availability_blocks.findMany({
      where: {
        event_manager_id: eventManagerId,
        is_active: true,
        buffer_minutes: { gt: 0 }
      }
    });

    for (const nb of nearbyBlocks) {
      const bufMs = (nb.buffer_minutes || 0) * 60 * 1000;
      const effectiveStart = new Date(new Date(nb.start_at).getTime() - bufMs);
      const effectiveEnd = new Date(new Date(nb.end_at).getTime() + bufMs);
      if (reqStartDt < effectiveEnd && reqEndDt > effectiveStart) {
        const error = new Error(`The selected time slot conflicts with required buffer preparation/cleanup time for an existing event. Please select another time.`);
        error.statusCode = 409;
        error.code = 'BUFFER_CONFLICT';
        throw error;
      }
    }

    // Check existing confirmed/pending bookings for this event manager with concurrency capacity
    const overlappingEmBookings = await eventAvailRepo.findConflictingBookings(eventManagerId, reqStartDt, reqEndDt, eventServiceEntity.id);
    
    // Check max concurrent events allowed (default 1 unless configured on active block or service)
    const maxCapacity = 1;
    if (overlappingEmBookings.length >= maxCapacity) {
      const error = new Error('The event manager is already booked to full capacity for this time slot. Please choose another time.');
      error.statusCode = 409;
      error.code = 'EVENT_MANAGER_FULLY_BOOKED';
      throw error;
    }
  }

  // Validate Positive Integer Guest Count
  const parsedGuestCount = Number(total_persons);
  if (!Number.isInteger(parsedGuestCount) || parsedGuestCount < 1) {
    const error = new Error('Guest count must be a positive integer of at least 1.');
    error.statusCode = 400;
    error.code = 'INVALID_GUEST_COUNT';
    throw error;
  }

  // Authoritative Resource Validation & Ownership Verification
  let selectedTableEntity = null;
  if (table_id) {
    selectedTableEntity = await (tableRepository.findTableById || tableRepository.getTableById)(table_id);
    if (!selectedTableEntity || String(selectedTableEntity.cafe_id) !== String(cafe_id)) {
      const error = new Error('Selected table does not belong to this cafe or does not exist.');
      error.statusCode = 400;
      error.code = 'INVALID_TABLE';
      throw error;
    }
  }

  // Authoritative Capacity Calculation and Validation
  const { calculateAllowedGuestCount, validateGuestCount } = require('../utils/capacityValidator');
  const capacityInfo = calculateAllowedGuestCount({
    cafe,
    selectedTable: selectedTableEntity,
    cafePackage: matchedProviderType === 'CAFE' ? pkg : null,
    eventService: matchedProviderType === 'EVENT' ? (eventServiceEntity || pkg) : null,
    inclusions: data.inclusions,
  });

  const capacityValidation = validateGuestCount(parsedGuestCount, capacityInfo);
  if (!capacityValidation.isValid) {
    const error = new Error(capacityValidation.message);
    error.statusCode = 400;
    error.code = capacityValidation.code;
    error.maxAllowed = capacityValidation.maxAllowed;
    error.bindingConstraint = capacityValidation.bindingConstraint;
    throw error;
  }

  // Calculate Package & Inclusions Charges strictly on backend
  if (pkg) {
      console.log(`[FAHARA PACKAGE DEBUG] bookingId: ${data.bookingId || 'NEW'} | requestedPackageId: ${package_id} | resolvedPackageId: ${pkg.id} | providerType: ${matchedProviderType}`);

      // Verify Package Ownership
      if (matchedProviderType === 'CAFE' && String(pkg.cafe_id) !== String(cafe_id)) {
        const error = new Error('Selected cafe package does not belong to this cafe.');
        error.statusCode = 400;
        error.code = 'INVALID_PACKAGE_OWNERSHIP';
        throw error;
      }

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
        if (!rawInput) return [];
        let items = rawInput;
        if (typeof items === 'string') {
          try { items = JSON.parse(items); } catch(e) { items = []; }
        }
        if (typeof items === 'object' && !Array.isArray(items) && items !== null) {
          items = Object.values(items);
        }
        if (!Array.isArray(items) || items.length === 0) return [];
        return items.map((item, idx) => {
          if (typeof item === 'string') {
            return { inclusionId: item, tierId: null, tierName: null, quantity: 1, _raw: item };
          }
          if (typeof item !== 'object' || item === null) return null;
          const inclusionId = item.inclusionId || item.inclusion_id || item.id || null;
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
        }).filter(n => n && (n.inclusionId || n._raw)); // discard completely empty items
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

      // Inclusions are included features within the package price
      // (packageInclusionsTotal is not added as separate line items)
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

  let cafe_amount = base_cafe_charge + (matchedProviderType === 'CAFE' ? package_add_on_charge : 0);
  let final_food_amount = addOnsTotal;
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
    hours: effectiveHours,
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
  if (base_cafe_charge > 0) {
    const pricePerHour = Number(cafe.price_per_hour || 0);
    const cafeChargeUnitPrice = pricePerHour > 0 ? pricePerHour : base_cafe_charge;
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
      amount: base_cafe_charge,
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

  // Event Service base package item if present
  if (actual_event_service_id && eventServiceEntity) {
    const baseServicePrice = Number(eventServiceEntity.price !== null && eventServiceEntity.price !== undefined ? eventServiceEntity.price : 0);
    const pType = (eventServiceEntity.pricing_type || 'FIXED').toUpperCase();
    const serviceAmount = pType === 'PER_GUEST' ? baseServicePrice * validatedGuestCount : baseServicePrice;

    itemsToCreate.push({
      booking_id: createdBooking.id,
      provider_type: 'EVENT',
      item_type: 'PACKAGE',
      provider_id: actual_event_service_id,
      package_id: actual_event_service_id,
      item_name: eventServiceEntity.service_name || eventServiceEntity.title || eventServiceEntity.name || 'Event Service Package',
      package_name: eventServiceEntity.service_name || eventServiceEntity.title || eventServiceEntity.name || 'Event Service Package',
      pricing_type: pType,
      unit_price: baseServicePrice,
      quantity: pType === 'PER_GUEST' ? validatedGuestCount : 1,
      guest_count: validatedGuestCount,
      amount: serviceAmount,
      is_package_base: true,
      is_addon: false,
      description: eventServiceEntity.description || null
    });
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
      unit_price: 0,
      quantity: incItem.quantity,
      amount: 0,
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
  const rawBookings = await bookingRepository.getBookingsByCustomer(userId);
  return rawBookings.map((b) => ({
    ...b,
    id: b.id,
    booking_number: b.booking_number || b.id,
    booking_status: b.booking_status || b.status || 'CONFIRMED',
    status: b.booking_status || b.status || 'CONFIRMED',
    payment_status: b.payment_status || 'PAID',
    cafe: b.cafes || b.cafe || null,
    cafes: b.cafes || b.cafe || null,
    event_service: b.event_services || b.event_service || null,
    event_services: b.event_services || b.event_service || null,
    booking_date: b.booking_date,
    total_persons: b.total_persons || b.guests || 2,
    total: Number(b.grand_total || b.total_amount || b.total || 0),
    total_amount: Number(b.grand_total || b.total_amount || b.total || 0),
  }));
};

const getCafeBookings = async (ownerId, query = {}, userRole = 'CAFE_OWNER') => {
  let bookings = await bookingRepository.getBookingsByCafeOwner(ownerId, userRole);
  
  if (query.status && query.status.toUpperCase() !== 'ALL') {
    bookings = bookings.filter(b => b.booking_status.toUpperCase() === query.status.toUpperCase());
  }

  // Frontend expects mapped format
  return bookings.map(b => {
    let itemizedCafeTotal = 0;
    let itemizedEventTotal = 0;

    if (Array.isArray(b.booking_items) && b.booking_items.length > 0) {
      itemizedCafeTotal = b.booking_items
        .filter(it => it.provider_type === 'CAFE' || it.item_type === 'CAFE_INCLUSION' || it.item_type === 'CAFE_CHARGE')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

      itemizedEventTotal = b.booking_items
        .filter(it => it.provider_type === 'EVENT' || it.item_type === 'EVENT_INCLUSION')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    }

    // Determine Cafe Net Earning
    let cafeNet = Number(b.cafe_amount || 0);
    if (cafeNet === 0 && itemizedCafeTotal > 0) {
      cafeNet = itemizedCafeTotal;
    }
    // If cafe_amount is not recorded, check if there is an event service and subtract it from subtotal
    if (cafeNet === 0 && (b.subtotal || b.total)) {
      const calcSub = Number(b.subtotal || b.total || 0);
      const evAmt = Number(b.event_service_amount || itemizedEventTotal || 0);
      cafeNet = Math.max(0, calcSub - evAmt);
    }

    // Determine Event Manager Net Earning
    let eventNet = Number(b.event_service_amount || 0);
    if (eventNet === 0 && itemizedEventTotal > 0) {
      eventNet = itemizedEventTotal;
    }

    const calculatedAmount = userRole === 'EVENT_MANAGER'
      ? Number(eventNet.toFixed(2))
      : Number(cafeNet.toFixed(2));

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
      cafe_amount: Number(cafeNet.toFixed(2)),
      event_service_amount: Number(eventNet.toFixed(2)),
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

const sanitizeBookingForPartner = (booking, userRole = 'CAFE_OWNER') => {
  if (!booking) return booking;
  const sanitized = { ...booking };

  // Calculate itemized totals by provider
  let itemizedCafeTotal = 0;
  let itemizedEventTotal = 0;
  if (Array.isArray(sanitized.booking_items) && sanitized.booking_items.length > 0) {
    itemizedCafeTotal = sanitized.booking_items
      .filter(it => it.provider_type === 'CAFE' || it.item_type === 'CAFE_INCLUSION' || it.item_type === 'CAFE_CHARGE')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    itemizedEventTotal = sanitized.booking_items
      .filter(it => it.provider_type === 'EVENT' || it.item_type === 'EVENT_INCLUSION')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }

  // Cafe net split calculation
  let cafeNet = Number(sanitized.cafe_amount || 0);
  if (cafeNet === 0 && itemizedCafeTotal > 0) {
    cafeNet = itemizedCafeTotal;
  }
  if (cafeNet === 0 && (sanitized.subtotal || sanitized.total)) {
    const calcSub = Number(sanitized.subtotal || sanitized.total || 0);
    const evAmt = Number(sanitized.event_service_amount || itemizedEventTotal || 0);
    cafeNet = Math.max(0, calcSub - evAmt);
  }

  // Event service net split calculation
  let eventNet = Number(sanitized.event_service_amount || 0);
  if (eventNet === 0 && itemizedEventTotal > 0) {
    eventNet = itemizedEventTotal;
  }

  // Set net earnings specific to partner role
  sanitized.cafe_earning = Number(cafeNet.toFixed(2));
  sanitized.event_earning = Number(eventNet.toFixed(2));
  sanitized.partner_earnings = userRole === 'EVENT_MANAGER' ? Number(eventNet.toFixed(2)) : Number(cafeNet.toFixed(2));

  // Override total & subtotal to partner's net earning only (don't show total amount paid by user)
  sanitized.total = sanitized.partner_earnings;
  sanitized.subtotal = sanitized.partner_earnings;
  sanitized.amount = sanitized.partner_earnings;

  // Filter booking items visible to partner: only show items belonging to this partner
  if (Array.isArray(sanitized.booking_items)) {
    const expectedProvider = userRole === 'EVENT_MANAGER' ? 'EVENT' : 'CAFE';
    sanitized.booking_items = sanitized.booking_items.filter(it => it.provider_type === expectedProvider);
  }

  // Remove platform charges & fees
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
    return sanitizeBookingForPartner(booking, userRole);
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

  // Terminal / non-cancellable status check
  if (['COMPLETED', 'REJECTED', 'DECLINED'].includes(booking.booking_status)) {
    const error = new Error(`Cannot cancel a booking with status ${booking.booking_status}`);
    error.statusCode = 400;
    throw error;
  }

  // Customer cancellation rule: Customer may cancel only when the scheduled start time is MORE than 3 hours away.
  // When the booking starts within 3 hours or has already passed, customer cancellation is restricted.
  if (isCustomer && !isAdmin && !isCafeOwner && !isEventManager) {
    if (!booking.booking_date) {
      const error = new Error('Scheduled booking date is missing');
      error.statusCode = 400;
      throw error;
    }

    let dateOnlyStr;
    if (typeof booking.booking_date === 'string') {
      dateOnlyStr = booking.booking_date.split('T')[0];
    } else if (booking.booking_date instanceof Date) {
      dateOnlyStr = booking.booking_date.toISOString().split('T')[0];
    } else {
      dateOnlyStr = String(booking.booking_date).split('T')[0];
    }

    let hours = '00';
    let mins = '00';
    let secs = '00';

    if (booking.start_time) {
      if (typeof booking.start_time === 'string') {
        const timePart = booking.start_time.includes('T') ? booking.start_time.split('T')[1].slice(0, 8) : booking.start_time;
        const [h, m, s] = timePart.split(':');
        hours = h ? h.padStart(2, '0') : '00';
        mins = m ? m.padStart(2, '0') : '00';
        secs = s ? s.padStart(2, '0') : '00';
      } else if (booking.start_time instanceof Date) {
        hours = String(booking.start_time.getUTCHours()).padStart(2, '0');
        mins = String(booking.start_time.getUTCMinutes()).padStart(2, '0');
        secs = String(booking.start_time.getUTCSeconds()).padStart(2, '0');
      }
    }

    // Combine scheduled date and time in UTC
    const scheduledStartTime = new Date(`${dateOnlyStr}T${hours}:${mins}:${secs}Z`);
    const now = new Date();

    if (isNaN(scheduledStartTime.getTime())) {
      const error = new Error('Invalid scheduled booking time');
      error.statusCode = 400;
      throw error;
    }

    const msUntilStart = scheduledStartTime.getTime() - now.getTime();
    const hoursUntilStart = msUntilStart / (1000 * 60 * 60);

    if (hoursUntilStart <= 0) {
      const error = new Error('Cancellation is unavailable for bookings that have already started or passed.');
      error.statusCode = 400;
      throw error;
    }

    if (hoursUntilStart <= 3) {
      const error = new Error('Cancellation is unavailable within 3 hours of your booking.');
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

const validateCapacity = async (data = {}) => {
  const {
    cafe_id,
    table_id,
    package_id,
    event_service_id,
    total_persons,
    inclusions = []
  } = data;

  if (!cafe_id) {
    const error = new Error('cafe_id is required');
    error.statusCode = 400;
    throw error;
  }

  const cafe = await cafeRepository.findCafeById(cafe_id);
  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }

  let selectedTable = null;
  if (table_id) {
    selectedTable = await (tableRepository.findTableById || tableRepository.getTableById)(table_id);
    if (!selectedTable || String(selectedTable.cafe_id) !== String(cafe_id)) {
      const error = new Error('Selected table does not belong to this cafe or does not exist.');
      error.statusCode = 400;
      error.code = 'INVALID_TABLE';
      throw error;
    }
  }

  let cafePackage = null;
  if (package_id && cafe.cafe_packages) {
    cafePackage = cafe.cafe_packages.find(p => String(p.id) === String(package_id)) || null;
  }

  let eventService = null;
  const eventServiceIdToLookup = event_service_id || (package_id && !cafePackage ? package_id : null);
  if (eventServiceIdToLookup) {
    const eventServiceRepo = require('../repositories/eventServiceRepository');
    const ext = await eventServiceRepo.findEventServiceById(eventServiceIdToLookup);
    if (ext) {
      eventService = ext;
    }
  }

  const { calculateAllowedGuestCount, validateGuestCount } = require('../utils/capacityValidator');
  const capacityInfo = calculateAllowedGuestCount({
    cafe,
    selectedTable,
    cafePackage,
    eventService,
    inclusions,
  });

  const guestCount = total_persons ? Number(total_persons) : null;
  let validationResult = null;
  if (guestCount !== null && !isNaN(guestCount)) {
    validationResult = validateGuestCount(guestCount, capacityInfo);
  }

  return {
    capacityInfo,
    validationResult,
    requestedGuestCount: guestCount,
  };
};

module.exports = {
  createBooking,
  validateCapacity,
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

