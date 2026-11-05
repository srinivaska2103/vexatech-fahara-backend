const assert = require('assert');
const {
  evaluateOrderingAvailability,
  getNowInTimezone,
  parseTimeToMinutes,
  isMinuteInSlot
} = require('./src/services/restaurantAvailabilityService');

console.log('===============================================================');
console.log('🧪 COMPREHENSIVE RESTAURANT BUSINESS HOURS & AVAILABILITY SUITE');
console.log('===============================================================\n');

// ── TEST 1: Timezone day and hour calculation ──────────────────────────────
console.log('▶ TEST 1: Timezone Resolution (Asia/Kolkata vs America/New_York)');
const baseUtc = new Date('2026-11-05T04:30:00.000Z'); // 10:00 AM IST, 11:30 PM prev day EST
const kolkata = getNowInTimezone('Asia/Kolkata', baseUtc);
assert.strictEqual(kolkata.hour, 10);
assert.strictEqual(kolkata.minute, 0);
assert.strictEqual(kolkata.dayName, 'thursday');

const newYork = getNowInTimezone('America/New_York', baseUtc);
assert.strictEqual(newYork.dayName, 'wednesday');
assert.strictEqual(newYork.hour, 23);
assert.strictEqual(newYork.minute, 30);
console.log('  ✓ Correctly resolved timezone wall-clock times and day boundary offsets\n');

// ── TEST 2: Multiple Daily Slots with Break ─────────────────────────────────
console.log('▶ TEST 2: Multiple Daily Slots (09:00 AM – 02:00 PM and 05:00 PM – 10:00 PM)');
const multiSlotSettings = {
  is_ordering_enabled: true,
  auto_enable_ordering_hours: true,
  allow_orders_outside_hours: false,
  restaurant_timezone: 'Asia/Kolkata',
  weekly_business_hours: {
    thursday: {
      isClosed: false,
      slots: [
        { openTime: '09:00 AM', closeTime: '02:00 PM' },
        { openTime: '05:00 PM', closeTime: '10:00 PM' }
      ]
    }
  }
};

// 2A. During Slot 1 (11:00 AM)
const slot1Time = new Date('2026-11-05T05:30:00.000Z'); // 11:00 AM IST
const resSlot1 = evaluateOrderingAvailability(multiSlotSettings, slot1Time);
assert.strictEqual(resSlot1.isOpen, true);
assert.strictEqual(resSlot1.canPlaceOrder, true);
assert.strictEqual(resSlot1.badge, 'Open for Orders');
console.log('  ✓ 2A: Open during morning slot (11:00 AM)');

// 2B. Break between slots (03:30 PM)
const breakTime = new Date('2026-11-05T10:00:00.000Z'); // 03:30 PM IST
const resBreak = evaluateOrderingAvailability(multiSlotSettings, breakTime);
assert.strictEqual(resBreak.isOpen, false);
assert.strictEqual(resBreak.canPlaceOrder, false);
assert.strictEqual(resBreak.reasonCode, 'CLOSED_OUTSIDE_HOURS');
assert(resBreak.nextOpening.label.includes('05:00 PM'));
console.log('  ✓ 2B: Closed during break (03:30 PM), reports opens Today at 05:00 PM');

// 2C. During Slot 2 (07:30 PM)
const slot2Time = new Date('2026-11-05T14:00:00.000Z'); // 07:30 PM IST
const resSlot2 = evaluateOrderingAvailability(multiSlotSettings, slot2Time);
assert.strictEqual(resSlot2.isOpen, true);
assert.strictEqual(resSlot2.canPlaceOrder, true);
console.log('  ✓ 2C: Open during evening slot (07:30 PM)');

// 2D. After Closing (10:30 PM)
const afterCloseTime = new Date('2026-11-05T17:00:00.000Z'); // 10:30 PM IST
const resAfterClose = evaluateOrderingAvailability(multiSlotSettings, afterCloseTime);
assert.strictEqual(resAfterClose.isOpen, false);
assert.strictEqual(resAfterClose.canPlaceOrder, false);
console.log('  ✓ 2D: Closed after evening slot (10:30 PM)\n');

// ── TEST 3: Overnight Operating Hours (06:00 PM – 01:00 AM) ────────────────
console.log('▶ TEST 3: Overnight Operating Hours (06:00 PM to 01:00 AM next morning)');
const overnightSettings = {
  is_ordering_enabled: true,
  auto_enable_ordering_hours: true,
  restaurant_timezone: 'Asia/Kolkata',
  weekly_business_hours: {
    thursday: {
      isClosed: false,
      slots: [{ openTime: '06:00 PM', closeTime: '01:00 AM' }]
    },
    friday: {
      isClosed: true,
      slots: []
    }
  }
};

// 3A. Evening at 09:00 PM (Thursday)
const eveningTime = new Date('2026-11-05T15:30:00.000Z'); // 09:00 PM IST
const resEvening = evaluateOrderingAvailability(overnightSettings, eveningTime);
assert.strictEqual(resEvening.isOpen, true);
console.log('  ✓ 3A: Open on Thursday night at 09:00 PM');

// 3B. Past midnight at 00:30 AM (Friday morning)
const pastMidnight = new Date('2026-11-05T19:00:00.000Z'); // Friday 00:30 AM IST
const resMidnight = evaluateOrderingAvailability(overnightSettings, pastMidnight);
assert.strictEqual(resMidnight.isOpen, true);
console.log('  ✓ 3B: Open past midnight on Friday morning at 00:30 AM (spillover from Thursday)');

// 3C. After 01:00 AM at 01:30 AM (Friday morning)
const pastOvernight = new Date('2026-11-05T20:00:00.000Z'); // Friday 01:30 AM IST
const resPastOvernight = evaluateOrderingAvailability(overnightSettings, pastOvernight);
assert.strictEqual(resPastOvernight.isOpen, false);
console.log('  ✓ 3C: Closed at 01:30 AM after overnight closing threshold\n');

// ── TEST 4: Temporary Pause Switch (Manual Kitchen Overwhelm) ───────────────
console.log('▶ TEST 4: Temporary Pause (Kitchen Overwhelmed)');
const pausedSettings = {
  ...multiSlotSettings,
  is_temporarily_paused: true,
  pause_reason: 'Kitchen is at peak capacity. Back in 30 mins.'
};
const resPaused = evaluateOrderingAvailability(pausedSettings, slot1Time);
assert.strictEqual(resPaused.canPlaceOrder, false);
assert.strictEqual(resPaused.reasonCode, 'TEMPORARILY_PAUSED');
assert.strictEqual(resPaused.badge, 'Temporarily Paused');
assert(resPaused.message.includes('peak capacity'));
console.log('  ✓ Preserves weekly business hours while blocking customer orders with custom pause notice\n');

// ── TEST 5: Special Closing Dates & Holidays ────────────────────────────────
console.log('▶ TEST 5: Special Holiday Closure');
const holidaySettings = {
  ...multiSlotSettings,
  special_closing_dates: [
    { date: '2026-11-05', reason: 'Annual Deep Cleaning & Renovation' }
  ]
};
const resHoliday = evaluateOrderingAvailability(holidaySettings, slot1Time);
assert.strictEqual(resHoliday.isOpen, false);
assert.strictEqual(resHoliday.canPlaceOrder, false);
assert.strictEqual(resHoliday.reasonCode, 'HOLIDAY_CLOSURE');
assert(resHoliday.message.includes('Deep Cleaning'));
console.log('  ✓ Special closing date overrides regular Thursday opening hours\n');

// ── TEST 6: Closed Weekday (Sunday) ─────────────────────────────────────────
console.log('▶ TEST 6: Closed Weekday (Sunday)');
const sundaySettings = {
  is_ordering_enabled: true,
  restaurant_timezone: 'Asia/Kolkata',
  weekly_business_hours: {
    sunday: { isClosed: true, slots: [] },
    monday: { isClosed: false, slots: [{ openTime: '09:00 AM', closeTime: '09:00 PM' }] }
  }
};
const sundayNoon = new Date('2026-11-08T06:30:00.000Z'); // Sunday 12:00 PM IST
const resSunday = evaluateOrderingAvailability(sundaySettings, sundayNoon);
assert.strictEqual(resSunday.isOpen, false);
assert.strictEqual(resSunday.canPlaceOrder, false);
assert(resSunday.nextOpening.label.includes('Tomorrow') || resSunday.nextOpening.day === 'Monday');
console.log('  ✓ Sunday is marked closed; next opening accurately detects Monday 09:00 AM\n');

// ── TEST 7: Allow Orders Outside Hours (Advance Pre-Orders) ─────────────────
console.log('▶ TEST 7: Advance Pre-Orders Outside Business Hours');
const preOrderSettings = {
  ...multiSlotSettings,
  allow_orders_outside_hours: true
};
const resPreOrder = evaluateOrderingAvailability(preOrderSettings, breakTime);
assert.strictEqual(resPreOrder.isOpen, false);
assert.strictEqual(resPreOrder.canPlaceOrder, true);
assert.strictEqual(resPreOrder.allowPreOrder, true);
assert.strictEqual(resPreOrder.badge, 'Pre-Orders Accepted');
console.log('  ✓ Customers permitted to place advance pre-order when allow_orders_outside_hours is enabled\n');

console.log('===============================================================');
console.log('🎉 ALL 7 RESTAURANT AVAILABILITY TEST SCENARIOS PASSED WITH 0 ERRORS');
console.log('===============================================================\n');
