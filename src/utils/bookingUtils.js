const crypto = require('crypto');

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const generateBookingNumber = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `FAH-${dateStr}-${randomStr}`;
};

/**
 * Gets the day of week name ('SUNDAY', 'MONDAY', etc.) for any given date string or Date object.
 */
const getDayNameOfDate = (dateVal) => {
  if (!dateVal) return null;
  let idx;
  if (typeof dateVal === 'string') {
    const dateOnly = dateVal.split('T')[0];
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        idx = new Date(year, month, day).getDay();
      }
    }
  }
  if (idx === undefined) {
    const d = new Date(dateVal);
    idx = d.getDay();
  }
  if (isNaN(idx)) return null;
  return DAYS_OF_WEEK[idx];
};

/**
 * Checks if a cafe is closed on a specified date based on its business hours setup.
 * Returns true if closed, false if open.
 */
const isCafeClosedOnDate = (cafe, dateVal) => {
  if (!cafe) return false;

  const dayName = getDayNameOfDate(dateVal);
  if (!dayName) return false;

  const businessHours = cafe.cafe_business_hours || cafe.business_hours || cafe.operating_hours || cafe.operatingHours || cafe.hours;
  if (!businessHours) return false;

  if (Array.isArray(businessHours) && businessHours.length > 0) {
    const dayEntry = businessHours.find(h => {
      const val = (h.day_of_week || h.dayOfWeek || h.day || '').toString().trim().toUpperCase();
      return val === dayName;
    });

    if (dayEntry) {
      const isClosed = dayEntry.is_closed === true || 
                       dayEntry.isClosed === true || 
                       dayEntry.isOpen === false || 
                       String(dayEntry.is_closed).toLowerCase() === 'true' ||
                       (!dayEntry.open_time && !dayEntry.close_time && !dayEntry.openTime && !dayEntry.closeTime);
      return Boolean(isClosed);
    } else {
      return true;
    }
  } else if (typeof businessHours === 'object') {
    const keyLower = dayName.toLowerCase();
    const dayEntry = businessHours[keyLower] || businessHours[dayName];
    if (dayEntry) {
      const isClosed = dayEntry.is_closed === true || 
                       dayEntry.isClosed === true || 
                       dayEntry.isOpen === false || 
                       String(dayEntry.is_closed).toLowerCase() === 'true';
      return Boolean(isClosed);
    } else {
      return true;
    }
  }

  return false;
};

/**
 * Checks if the requested booking start date/time is less than 24 hours from current time.
 * Returns true if less than 24 hours (i.e. invalid), false if at least 24 hours in advance.
 */
const isBookingWithin24Hours = (bookingDateVal, startTimeVal) => {
  if (!bookingDateVal) return true;

  let dateOnlyStr;
  if (typeof bookingDateVal === 'string') {
    dateOnlyStr = bookingDateVal.split('T')[0];
  } else if (bookingDateVal instanceof Date) {
    dateOnlyStr = bookingDateVal.toISOString().split('T')[0];
  } else {
    dateOnlyStr = String(bookingDateVal).split('T')[0];
  }

  let timeOnlyStr = '00:00:00';
  if (startTimeVal) {
    if (typeof startTimeVal === 'string') {
      timeOnlyStr = startTimeVal.includes('T') ? startTimeVal.split('T')[1].slice(0, 8) : startTimeVal;
    } else if (startTimeVal instanceof Date) {
      const hours = String(startTimeVal.getHours() || startTimeVal.getUTCHours()).padStart(2, '0');
      const mins = String(startTimeVal.getMinutes() || startTimeVal.getUTCMinutes()).padStart(2, '0');
      timeOnlyStr = `${hours}:${mins}:00`;
    }
  }

  if (timeOnlyStr.length === 5) {
    timeOnlyStr = `${timeOnlyStr}:00`;
  }

  const bookingStartDateTime = new Date(`${dateOnlyStr}T${timeOnlyStr}`);
  if (isNaN(bookingStartDateTime.getTime())) {
    return false;
  }

  const now = new Date();
  const hoursDiff = (bookingStartDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  return hoursDiff < 24;
};

const parseTimeToMinutes = (timeVal) => {
  if (!timeVal) return null;
  if (timeVal instanceof Date) {
    if (isNaN(timeVal.getTime())) return null;
    return timeVal.getUTCHours() * 60 + timeVal.getUTCMinutes();
  }
  let str = String(timeVal).trim();
  if (str.includes('T')) {
    const timePart = str.split('T')[1];
    str = timePart.substring(0, 8);
  }
  const isPM = /PM/i.test(str);
  const isAM = /AM/i.test(str);
  if (isAM || isPM) {
    const clean = str.replace(/AM|PM/gi, '').trim();
    let [h, m] = clean.split(':').map(Number);
    if (isNaN(h)) return null;
    m = isNaN(m) ? 0 : m;
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  }
  const parts = str.split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return null;
};

const formatMinutesTo12Hour = (minutes) => {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '';
  let h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
};

/**
 * Checks if the requested booking start/end times fall outside the entity's (cafe or event service) operating hours.
 * Returns null if valid, or error message string if invalid.
 */
const checkBookingTimeBusinessHours = (entity, dateVal, startTimeVal, endTimeVal, entityLabel = 'Venue') => {
  if (!entity || !dateVal || !startTimeVal || !endTimeVal) return null;

  const dayName = getDayNameOfDate(dateVal);
  if (!dayName) return null;

  const businessHours = entity.cafe_business_hours || 
                        entity.event_business_hours || 
                        entity.users?.event_business_hours || 
                        entity.business_hours || 
                        entity.operating_hours || 
                        entity.operatingHours || 
                        entity.hours;

  if (!businessHours) return null;

  let dayEntry = null;
  if (Array.isArray(businessHours) && businessHours.length > 0) {
    dayEntry = businessHours.find(h => {
      const val = (h.day_of_week || h.dayOfWeek || h.day || '').toString().trim().toUpperCase();
      return val === dayName;
    });
  } else if (typeof businessHours === 'object') {
    const keyLower = dayName.toLowerCase();
    dayEntry = businessHours[keyLower] || businessHours[dayName];
  }

  if (dayEntry) {
    const isClosed = dayEntry.is_closed === true || 
                     dayEntry.isClosed === true || 
                     dayEntry.isOpen === false || 
                     String(dayEntry.is_closed).toLowerCase() === 'true';

    if (isClosed) {
      return `${entityLabel} "${name}" is closed on ${dayFormatted}s and is not available for this time slot.`;
    }
  }

  let openMinutes = parseTimeToMinutes(dayEntry ? (dayEntry.open_time || dayEntry.openTime || dayEntry.open) : null);
  let closeMinutes = parseTimeToMinutes(dayEntry ? (dayEntry.close_time || dayEntry.closeTime || dayEntry.close) : null);

  // Fallback defaults if null or missing (default operating hours: 09:00 AM - 10:00 PM)
  if (openMinutes === null) openMinutes = 540; // 09:00 AM
  if (closeMinutes === null) closeMinutes = 1320; // 10:00 PM

  const startMinutes = parseTimeToMinutes(startTimeVal);
  const endMinutes = parseTimeToMinutes(endTimeVal);

  if (startMinutes === null || endMinutes === null) return null;

  const openStr = formatMinutesTo12Hour(openMinutes);
  const closeStr = formatMinutesTo12Hour(closeMinutes);

  if (closeMinutes > openMinutes) {
    if (startMinutes < openMinutes || endMinutes > closeMinutes || startMinutes >= closeMinutes) {
      const startStr = formatMinutesTo12Hour(startMinutes);
      const endStr = formatMinutesTo12Hour(endMinutes);
      return `Selected time (${startStr} - ${endStr}) is outside ${entityLabel} "${name}"'s operating hours (${openStr} - ${closeStr}) on ${dayFormatted}s.`;
    }
  } else {
    let effStart = startMinutes;
    let effEnd = endMinutes;
    if (effStart < openMinutes && effStart < closeMinutes) effStart += 1440;
    if (effEnd < openMinutes && effEnd <= closeMinutes) effEnd += 1440;
    const effClose = closeMinutes + 1440;
    if (effStart < openMinutes || effEnd > effClose) {
      const startStr = formatMinutesTo12Hour(startMinutes);
      const endStr = formatMinutesTo12Hour(endMinutes);
      return `Selected time (${startStr} - ${endStr}) is outside ${entityLabel} "${name}"'s operating hours (${openStr} - ${closeStr}) on ${dayFormatted}s.`;
    }
  }

  return null;
};

module.exports = {
  generateBookingNumber,
  getDayNameOfDate,
  isCafeClosedOnDate,
  isBookingWithin24Hours,
  checkBookingTimeBusinessHours
};

