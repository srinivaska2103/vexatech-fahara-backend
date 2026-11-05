/**
 * Restaurant Business Hours & Ordering Availability Service
 * High-precision evaluation of open/closed status, multiple time slots,
 * overnight hours, holiday/special closing dates, manual pauses, and timezone boundaries.
 */

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Returns the current date/time parts in the given IANA timezone.
 * Defaults to 'Asia/Kolkata'.
 */
function getNowInTimezone(timeZone = 'Asia/Kolkata', baseDate = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(baseDate);
    const map = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }

    const dayName = (map.weekday || '').toLowerCase(); // 'monday'
    const dayIndex = DAYS_OF_WEEK.indexOf(dayName);
    const hour = parseInt(map.hour, 10) || 0;
    const minute = parseInt(map.minute, 10) || 0;
    const year = map.year;
    const month = map.month;
    const day = map.day;
    const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD
    const minutesSinceMidnight = hour * 60 + minute;

    return {
      dayName,
      dayIndex: dayIndex >= 0 ? dayIndex : 0,
      hour,
      minute,
      dateStr,
      minutesSinceMidnight,
      timeZone
    };
  } catch (err) {
    // Fallback if timezone string is invalid
    const dayIndex = baseDate.getDay();
    const dayName = DAYS_OF_WEEK[dayIndex];
    const hour = baseDate.getHours();
    const minute = baseDate.getMinutes();
    const dateStr = baseDate.toISOString().slice(0, 10);
    return {
      dayName,
      dayIndex,
      hour,
      minute,
      dateStr,
      minutesSinceMidnight: hour * 60 + minute,
      timeZone: 'Asia/Kolkata'
    };
  }
}

/**
 * Converts 'HH:mm' or 'hh:mm AM/PM' string to minutes since midnight (0..1439).
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const clean = timeStr.trim().toUpperCase();

  // Check 12-hour AM/PM format (e.g. "09:30 AM", "9:30PM")
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3];
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }

  // Check 24-hour format (e.g. "14:30", "09:00")
  const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    return h * 60 + m;
  }

  return null;
}

/**
 * Converts minutes since midnight back to a 12-hour formatted string: "09:30 AM"
 */
function formatMinutesTo12Hour(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '';
  const normalized = ((minutes % 1440) + 1440) % 1440;
  let h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const hStr = h < 10 ? `0${h}` : `${h}`;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${hStr}:${mStr} ${period}`;
}

/**
 * Evaluates whether current minutes fall into a slot that may cross midnight.
 * e.g. 18:00 (1080m) to 01:00 (60m).
 * If start < end: simple range [start, end)
 * If start >= end: overnight slot covers [start, 1440) OR [0, end)
 */
function isMinuteInSlot(currMins, startMins, endMins) {
  if (startMins === null || endMins === null) return false;
  if (startMins < endMins) {
    return currMins >= startMins && currMins < endMins;
  } else if (startMins > endMins) {
    // Overnight: e.g. 18:00 to 01:00
    return currMins >= startMins || currMins < endMins;
  } else {
    // start === end: closed/zero-length
    return false;
  }
}

/**
 * Evaluates full food ordering availability for a restaurant / cafe.
 * 
 * @param {Object} fulfilmentSettings - Record from cafe_fulfilment_settings
 * @param {Date} [referenceTime=new Date()] - Date to evaluate against
 * @returns {Object} status report
 */
function evaluateOrderingAvailability(fulfilmentSettings, referenceTime = new Date()) {
  // If no settings exist at all, default to open
  if (!fulfilmentSettings) {
    return {
      isOpen: true,
      canPlaceOrder: true,
      reasonCode: 'DEFAULT_OPEN',
      message: 'Restaurant is open for orders',
      badge: 'Open for Orders',
      nextOpening: null
    };
  }

  const s = fulfilmentSettings;
  const timezone = s.restaurant_timezone || 'Asia/Kolkata';
  const now = getNowInTimezone(timezone, referenceTime);

  // 1. MASTER TOGGLE: Accept Food Orders ON/OFF
  const isOrderingEnabled = s.is_ordering_enabled ?? true;
  if (!isOrderingEnabled) {
    return {
      isOpen: false,
      canPlaceOrder: false,
      reasonCode: 'ORDERING_DISABLED',
      message: 'This restaurant is currently not accepting online food orders.',
      badge: 'Ordering Disabled',
      nextOpening: null
    };
  }

  // 2. TEMPORARY PAUSE
  const isPaused = s.is_temporarily_paused ?? false;
  if (isPaused) {
    // Check if paused_until is still in future
    if (s.paused_until) {
      const pauseEnd = new Date(s.paused_until);
      if (referenceTime < pauseEnd) {
        return {
          isOpen: false,
          canPlaceOrder: false,
          reasonCode: 'TEMPORARILY_PAUSED',
          message: s.pause_reason || 'Restaurant has temporarily paused accepting orders.',
          badge: 'Temporarily Paused',
          pausedUntil: s.paused_until,
          nextOpening: null
        };
      }
    } else {
      return {
        isOpen: false,
        canPlaceOrder: false,
        reasonCode: 'TEMPORARILY_PAUSED',
        message: s.pause_reason || 'Restaurant has temporarily paused accepting orders.',
        badge: 'Temporarily Paused',
        nextOpening: null
      };
    }
  }

  // 3. SPECIAL CLOSING DATES & HOLIDAYS
  const specialClosures = Array.isArray(s.special_closing_dates) ? s.special_closing_dates : [];
  for (const holiday of specialClosures) {
    if (!holiday) continue;
    const holidayDate = typeof holiday === 'string' ? holiday : holiday.date;
    if (holidayDate === now.dateStr) {
      const reason = holiday.reason || 'Closed for holiday / special occasion';
      return {
        isOpen: false,
        canPlaceOrder: false,
        reasonCode: 'HOLIDAY_CLOSURE',
        message: `Restaurant is closed today (${reason}).`,
        badge: 'Holiday Closure',
        nextOpening: findNextOpeningSlot(s, now, 1)
      };
    }
  }

  // 4. WEEKLY BUSINESS HOURS
  // If auto_enable_ordering_hours is false, we honor manual master switch
  const autoEnable = s.auto_enable_ordering_hours ?? true;
  const allowOutside = s.allow_orders_outside_hours ?? false;

  const weeklyHours = s.weekly_business_hours || {};
  const todayConfig = weeklyHours[now.dayName] || null;

  // Check if today is marked closed
  const isTodayClosed = !todayConfig || todayConfig.isClosed === true || !Array.isArray(todayConfig.slots) || todayConfig.slots.length === 0;

  // Check overnight slot from previous day:
  // e.g. Yesterday started 18:00 and closes at 02:00 today.
  const prevDayIndex = (now.dayIndex + 6) % 7;
  const prevDayName = DAYS_OF_WEEK[prevDayIndex];
  const prevDayConfig = weeklyHours[prevDayName];
  let isCoveredByYesterdayOvernight = false;

  if (prevDayConfig && !prevDayConfig.isClosed && Array.isArray(prevDayConfig.slots)) {
    for (const slot of prevDayConfig.slots) {
      const startMins = parseTimeToMinutes(slot.openTime);
      const endMins = parseTimeToMinutes(slot.closeTime);
      if (startMins !== null && endMins !== null && startMins > endMins) {
        // Spans overnight! Covers now if now.minutesSinceMidnight < endMins
        if (now.minutesSinceMidnight < endMins) {
          isCoveredByYesterdayOvernight = true;
          break;
        }
      }
    }
  }

  // Check today's active slots
  let isCurrentlyOpenToday = false;
  let activeSlot = null;

  if (!isTodayClosed && todayConfig && Array.isArray(todayConfig.slots)) {
    for (const slot of todayConfig.slots) {
      const startMins = parseTimeToMinutes(slot.openTime);
      const endMins = parseTimeToMinutes(slot.closeTime);
      if (startMins !== null && endMins !== null) {
        if (startMins > endMins) {
          // Overnight slot starting today: covers now if now >= startMins
          if (now.minutesSinceMidnight >= startMins) {
            isCurrentlyOpenToday = true;
            activeSlot = slot;
            break;
          }
        } else if (isMinuteInSlot(now.minutesSinceMidnight, startMins, endMins)) {
          isCurrentlyOpenToday = true;
          activeSlot = slot;
          break;
        }
      }
    }
  }

  const isOpenNow = isCoveredByYesterdayOvernight || isCurrentlyOpenToday;

  // If no hours configured at all, fallback to open
  const hasAnyHoursConfigured = Object.keys(weeklyHours).length > 0;
  if (!hasAnyHoursConfigured) {
    return {
      isOpen: true,
      canPlaceOrder: true,
      reasonCode: 'NO_HOURS_SET',
      message: 'Restaurant is open for orders',
      badge: 'Open for Orders',
      todayHoursFormatted: 'Open 24/7 (Not set)',
      nextOpening: null
    };
  }

  // Format today's operating hours text for customer view
  const todayFormatted = formatDaySlots(todayConfig);

  if (isOpenNow) {
    return {
      isOpen: true,
      canPlaceOrder: true,
      reasonCode: 'OPEN_NOW',
      message: 'Restaurant is currently open and accepting orders.',
      badge: 'Open for Orders',
      activeSlot,
      todayHoursFormatted: todayFormatted,
      nextOpening: null
    };
  }

  // Closed right now
  const nextOpening = findNextOpeningSlot(s, now, 0);

  // If outside hours, can customer still order? (allow_orders_outside_hours)
  if (allowOutside) {
    return {
      isOpen: false,
      canPlaceOrder: true,
      allowPreOrder: true,
      reasonCode: 'PRE_ORDER_ALLOWED',
      message: `Restaurant is currently closed, but accepts advance pre-orders. Opens ${nextOpening?.label || 'soon'}.`,
      badge: 'Pre-Orders Accepted',
      todayHoursFormatted: todayFormatted,
      nextOpening
    };
  }

  return {
    isOpen: false,
    canPlaceOrder: false,
    reasonCode: 'CLOSED_OUTSIDE_HOURS',
    message: `Restaurant is currently closed. ${nextOpening ? `Opens ${nextOpening.label}.` : ''}`,
    badge: 'Currently Closed',
    todayHoursFormatted: todayFormatted,
    nextOpening
  };
}

/**
 * Formats a day's slots into human text like "09:00 AM - 02:00 PM, 05:00 PM - 10:00 PM"
 */
function formatDaySlots(dayConfig) {
  if (!dayConfig || dayConfig.isClosed || !Array.isArray(dayConfig.slots) || dayConfig.slots.length === 0) {
    return 'Closed';
  }
  return dayConfig.slots
    .map(s => {
      const start = s.openTime;
      const end = s.closeTime;
      return `${start} – ${end}`;
    })
    .join(', ');
}

/**
 * Searches the upcoming 7 days to find the next opening slot.
 */
function findNextOpeningSlot(fulfilmentSettings, currentNow, startDayOffset = 0) {
  const weeklyHours = fulfilmentSettings?.weekly_business_hours || {};
  const specialClosures = Array.isArray(fulfilmentSettings?.special_closing_dates) ? fulfilmentSettings.special_closing_dates : [];

  for (let offset = startDayOffset; offset < 7; offset++) {
    const checkDayIndex = (currentNow.dayIndex + offset) % 7;
    const checkDayName = DAYS_OF_WEEK[checkDayIndex];
    const dayConfig = weeklyHours[checkDayName];

    if (!dayConfig || dayConfig.isClosed || !Array.isArray(dayConfig.slots) || dayConfig.slots.length === 0) {
      continue;
    }

    // Check if this date has a special closure
    // Calculate approximate date YYYY-MM-DD
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offset);
    const dateStr = targetDate.toISOString().slice(0, 10);
    const isHoliday = specialClosures.some(h => (typeof h === 'string' ? h : h?.date) === dateStr);
    if (isHoliday) continue;

    for (const slot of dayConfig.slots) {
      const startMins = parseTimeToMinutes(slot.openTime);
      if (startMins === null) continue;

      if (offset === 0) {
        // Today: must be in the future
        if (startMins > currentNow.minutesSinceMidnight) {
          const capDay = checkDayName.charAt(0).toUpperCase() + checkDayName.slice(1);
          return {
            day: capDay,
            time: slot.openTime,
            isToday: true,
            label: `Today at ${slot.openTime}`
          };
        }
      } else {
        // Future day
        const capDay = checkDayName.charAt(0).toUpperCase() + checkDayName.slice(1);
        const dayLabel = offset === 1 ? 'Tomorrow' : capDay;
        return {
          day: capDay,
          time: slot.openTime,
          isToday: false,
          label: `${dayLabel} at ${slot.openTime}`
        };
      }
    }
  }

  return null;
}

module.exports = {
  DAYS_OF_WEEK,
  getNowInTimezone,
  parseTimeToMinutes,
  formatMinutesTo12Hour,
  isMinuteInSlot,
  evaluateOrderingAvailability,
  formatDaySlots,
  findNextOpeningSlot
};

