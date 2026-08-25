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

module.exports = {
  generateBookingNumber,
  getDayNameOfDate,
  isCafeClosedOnDate,
  isBookingWithin24Hours
};
