/**
 * Fahara Booking Capacity Validator
 * Calculates the authoritative maximum allowed guest count across all applicable constraints:
 * - Cafe / Venue physical capacity
 * - Selected table capacity (only when table booking is selected/applied)
 * - Cafe event package guest limit (maximum_persons / max_guests)
 * - Event Manager package guest limit (max_guests / maximum_persons)
 * - Event Manager service inclusion / tier limits (min/max limits configured on selected inclusions/tiers)
 */

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Calculates all limits and the maximum allowed guests for a booking configuration.
 *
 * @param {Object} params
 * @param {Object} [params.cafe] - Cafe object
 * @param {Object} [params.selectedTable] - Selected table object (if table booking applies)
 * @param {Object} [params.cafePackage] - Selected cafe-provided package
 * @param {Object} [params.eventService] - Selected event manager package/service
 * @param {Array} [params.inclusions] - Selected inclusions/tiers
 * @returns {Object} Capacity calculation breakdown
 */
function calculateAllowedGuestCount(params = {}) {
  // Support both object entities ({ cafe, selectedTable, cafePackage, eventService, inclusions })
  // and direct numeric/shorthand options ({ cafeCapacity, tableCapacity, hasSelectedTable, cafePackageCapacity, eventManagerPackageCapacity, inclusionTierLimits })
  const cafeObj = params.cafe || (params.cafeCapacity !== undefined ? { maximum_persons: params.cafeCapacity } : null);
  const selectedTableObj = params.selectedTable || (params.hasSelectedTable && params.tableCapacity !== undefined ? { capacity: params.tableCapacity } : null);
  const cafePackageObj = params.cafePackage || (params.cafePackageCapacity !== undefined ? { maximum_persons: params.cafePackageCapacity } : null);
  const eventServiceObj = params.eventService || (params.eventManagerPackageCapacity !== undefined ? { max_guests: params.eventManagerPackageCapacity } : null);
  const inclusionsArr = params.inclusions || (Array.isArray(params.inclusionTierLimits) ? params.inclusionTierLimits.map(lim => typeof lim === 'object' && lim !== null ? lim : { max_guests: lim }) : []);

  const limits = [];

  // 1. Cafe maximum physical capacity
  const cafeLimit = parseNumber(cafeObj?.maximum_persons);
  if (cafeLimit !== null) {
    limits.push({
      type: 'CAFE',
      label: 'Cafe Capacity',
      limit: cafeLimit,
      description: `Maximum ${cafeLimit} guests accommodated by ${cafeObj?.name || 'the cafe'}`,
    });
  }

  // 2. Selected table capacity (strictly applied only if table is selected)
  if (selectedTableObj && parseNumber(selectedTableObj.capacity) !== null) {
    const tableLimit = parseNumber(selectedTableObj.capacity);
    limits.push({
      type: 'TABLE',
      label: 'Table Capacity',
      limit: tableLimit,
      description: `Maximum ${tableLimit} guests for Table ${selectedTableObj.table_number || selectedTableObj.name || ''}`,
    });
  }

  // 3. Cafe Event Package guest limit
  if (cafePackageObj) {
    let pkgMax = parseNumber(cafePackageObj.maximum_persons || cafePackageObj.max_guests);
    // If not found at top level, check inclusions if stored as json object
    if (pkgMax === null && cafePackageObj.inclusions && typeof cafePackageObj.inclusions === 'object' && !Array.isArray(cafePackageObj.inclusions)) {
      pkgMax = parseNumber(cafePackageObj.inclusions.maximum_persons || cafePackageObj.inclusions.max_guests);
    }
    if (pkgMax !== null) {
      limits.push({
        type: 'CAFE_PACKAGE',
        label: 'Cafe Package Limit',
        limit: pkgMax,
        description: `Up to ${pkgMax} guests supported by ${cafePackageObj.package_name || 'selected cafe package'}`,
      });
    }
  }

  // 4. Event Manager Package guest limit
  if (eventServiceObj) {
    const emPkgMax = parseNumber(
      eventServiceObj.max_guests ||
      eventServiceObj.maximum_persons ||
      eventServiceObj.originalEvent?.max_guests ||
      eventServiceObj.originalEvent?.maximum_persons
    );
    if (emPkgMax !== null) {
      limits.push({
        type: 'EVENT_MANAGER_PACKAGE',
        label: 'Event Manager Package Limit',
        limit: emPkgMax,
        description: `Up to ${emPkgMax} guests supported by ${eventServiceObj.service_name || eventServiceObj.name || 'Event Manager package'}`,
      });
    }

    // 5. Inclusion / Tier specific limits
    const rawInclusions = inclusionsArr.length > 0 ? inclusionsArr : (eventServiceObj.selectedInclusions || []);
    const incList = Array.isArray(rawInclusions) ? rawInclusions : [];
    
    incList.forEach((inc, idx) => {
      const incMax = parseNumber(inc?.max_guests || inc?.tier?.max_guests);
      if (incMax !== null) {
        const incName = inc.name || inc.itemName || inc.inclusionName || `Inclusion #${idx + 1}`;
        limits.push({
          type: 'INCLUSION_TIER',
          label: `${incName} Limit`,
          limit: incMax,
          description: `Up to ${incMax} guests allowed for ${incName}`,
        });
      }
    });
  }

  // Calculate minimum of all applicable limits
  let maximumAllowedGuests = null;
  let bindingConstraint = null;

  if (limits.length > 0) {
    let minLimit = Infinity;
    limits.forEach((item) => {
      if (item.limit < minLimit) {
        minLimit = item.limit;
        bindingConstraint = item;
      }
    });
    maximumAllowedGuests = minLimit === Infinity ? null : minLimit;
  }

  const packageLimit = cafePackageObj ? parseNumber(cafePackageObj.maximum_persons || cafePackageObj.max_guests) : null;
  const emLimit = eventServiceObj ? parseNumber(eventServiceObj.max_guests || eventServiceObj.maximum_persons || eventServiceObj.originalEvent?.max_guests) : null;
  const tableLim = selectedTableObj ? parseNumber(selectedTableObj.capacity) : null;

  return {
    cafeLimit,
    cafeCapacity: cafeLimit,
    tableLimit: tableLim,
    tableCapacity: tableLim,
    cafePackageLimit: packageLimit,
    cafePackageCapacity: packageLimit,
    packageCapacity: packageLimit,
    eventManagerLimit: emLimit,
    eventManagerPackageCapacity: emLimit,
    maximumAllowedGuests,
    maxAllowedGuests: maximumAllowedGuests,
    bindingConstraint,
    limitingFactor: bindingConstraint ? bindingConstraint.label : null,
    limits,
  };
}

/**
 * Validates whether a requested guest count is permissible.
 *
 * @param {number|Object} guestCountOrOptions - Number of guests requested OR options object
 * @param {Object} [capacityInfo] - Output from calculateAllowedGuestCount (optional if options passed in first arg)
 * @returns {Object} { isValid: boolean, message?: string, code?: string, maxAllowed: number, maxAllowedGuests: number, errorType?: string }
 */
function validateGuestCount(guestCountOrOptions, capacityInfo) {
  let guestCount;
  let info = capacityInfo;

  if (typeof guestCountOrOptions === 'object' && guestCountOrOptions !== null) {
    guestCount = guestCountOrOptions.guestCount;
    if (!info) {
      info = calculateAllowedGuestCount(guestCountOrOptions);
    }
  } else {
    guestCount = guestCountOrOptions;
    if (!info) {
      info = calculateAllowedGuestCount({});
    }
  }

  const maxAllowed = info?.maximumAllowedGuests ?? null;

  const count = Number(guestCount);
  if (!Number.isInteger(count) || count < 1) {
    return {
      isValid: false,
      code: 'INVALID_GUEST_COUNT',
      errorType: 'INVALID_GUEST_COUNT',
      message: 'Guest count must be a positive integer of at least 1.',
      maxAllowed: maxAllowed,
      maxAllowedGuests: maxAllowed,
    };
  }

  const { limits = [], maximumAllowedGuests, bindingConstraint } = info;

  // Check specific limits in priority order to give the most accurate descriptive error
  for (const item of limits) {
    if (count > item.limit) {
      let message = `Requested guest count (${count}) exceeds the limit of ${item.limit}.`;
      let errorType = `EXCEEDS_${item.type}_CAPACITY`;
      if (item.type === 'CAFE') {
        message = `Requested guest count (${count}) exceeds cafe maximum capacity of ${item.limit} guests.`;
        errorType = 'EXCEEDS_CAFE_CAPACITY';
      } else if (item.type === 'TABLE') {
        message = `Requested guest count (${count}) exceeds selected table capacity of ${item.limit} guests. Choose a larger table or adjust guests.`;
        errorType = 'EXCEEDS_TABLE_CAPACITY';
      } else if (item.type === 'CAFE_PACKAGE') {
        message = `Requested guest count (${count}) exceeds selected cafe package limit of ${item.limit} guests. Choose a compatible package or reduce guest count.`;
        errorType = 'EXCEEDS_PACKAGE_CAPACITY';
      } else if (item.type === 'EVENT_MANAGER_PACKAGE') {
        message = `Your selected Event Manager package supports up to ${item.limit} guests. Choose a compatible package or reduce the guest count.`;
        errorType = 'EXCEEDS_EVENT_MANAGER_CAPACITY';
      } else if (item.type === 'INCLUSION_TIER') {
        message = `Requested guest count (${count}) exceeds limit of ${item.limit} guests for ${item.label}.`;
        errorType = 'EXCEEDS_INCLUSION_TIER_CAPACITY';
      }

      return {
        isValid: false,
        code: `EXCEEDS_${item.type}_LIMIT`,
        errorType,
        message,
        maxAllowed: maximumAllowedGuests,
        maxAllowedGuests: maximumAllowedGuests,
        bindingConstraint: item,
      };
    }
  }

  return {
    isValid: true,
    maxAllowed: maximumAllowedGuests,
    maxAllowedGuests: maximumAllowedGuests,
    bindingConstraint,
  };
}


module.exports = {
  calculateAllowedGuestCount,
  validateGuestCount,
};
