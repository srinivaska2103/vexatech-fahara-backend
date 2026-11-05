const assert = require('assert');
const {
  evaluateOrderingAvailability,
  parseTimeToMinutes,
  isMinuteInSlot
} = require('./src/services/restaurantAvailabilityService');

console.log('🧪 Testing Restaurant Availability Service...');

// 1. Time parsing test
assert.strictEqual(parseTimeToMinutes('09:30 AM'), 9 * 60 + 30);
assert.strictEqual(parseTimeToMinutes('02:00 PM'), 14 * 60);
assert.strictEqual(parseTimeToMinutes('12:00 AM'), 0);
assert.strictEqual(parseTimeToMinutes('12:00 PM'), 12 * 60);
assert.strictEqual(parseTimeToMinutes('18:00'), 18 * 60);
assert.strictEqual(parseTimeToMinutes('01:00'), 60);
console.log('✓ Time parsing verified');

// 2. Overnight slot test (18:00 to 01:00)
// At 20:00 (1200m) -> true
assert.strictEqual(isMinuteInSlot(1200, 18 * 60, 1 * 60), true);
// At 00:30 (30m) -> true
assert.strictEqual(isMinuteInSlot(30, 18 * 60, 1 * 60), true);
// At 01:30 (90m) -> false
assert.strictEqual(isMinuteInSlot(90, 18 * 60, 1 * 60), false);
// At 15:00 (900m) -> false
assert.strictEqual(isMinuteInSlot(900, 18 * 60, 1 * 60), false);
console.log('✓ Overnight logic verified');

// 3. Evaluation: Master Switch OFF
const disabledSettings = {
  is_ordering_enabled: false,
  restaurant_timezone: 'Asia/Kolkata'
};
const resDisabled = evaluateOrderingAvailability(disabledSettings);
assert.strictEqual(resDisabled.canPlaceOrder, false);
assert.strictEqual(resDisabled.reasonCode, 'ORDERING_DISABLED');
console.log('✓ Master switch OFF verified');

// 4. Evaluation: Temporarily Paused
const pausedSettings = {
  is_ordering_enabled: true,
  is_temporarily_paused: true,
  pause_reason: 'Kitchen is overwhelmed for 30 minutes',
  restaurant_timezone: 'Asia/Kolkata'
};
const resPaused = evaluateOrderingAvailability(pausedSettings);
assert.strictEqual(resPaused.canPlaceOrder, false);
assert.strictEqual(resPaused.reasonCode, 'TEMPORARILY_PAUSED');
assert(resPaused.message.includes('overwhelmed'));
console.log('✓ Temporary pause verified');

// 5. Multiple Slots per day: 09:00 AM - 02:00 PM and 05:00 PM - 10:00 PM
const multiSlotSettings = {
  is_ordering_enabled: true,
  is_temporarily_paused: false,
  restaurant_timezone: 'Asia/Kolkata',
  weekly_business_hours: {
    thursday: {
      isClosed: false,
      slots: [
        { openTime: '09:00 AM', closeTime: '02:00 PM' },
        { openTime: '05:00 PM', closeTime: '10:00 PM' }
      ]
    },
    friday: {
      isClosed: true,
      slots: []
    }
  }
};

// Check at 11:00 AM (during first slot)
const testDate11AM = new Date('2026-11-05T05:30:00.000Z'); // 11:00 AM IST
const eval11AM = evaluateOrderingAvailability(multiSlotSettings, testDate11AM);
assert.strictEqual(eval11AM.isOpen, true);
assert.strictEqual(eval11AM.canPlaceOrder, true);
console.log('✓ Multi-slot open window verified');

// Check at 03:30 PM (between the two slots, restaurant is closed)
const testDate330PM = new Date('2026-11-05T10:00:00.000Z'); // 03:30 PM IST
const eval330PM = evaluateOrderingAvailability(multiSlotSettings, testDate330PM);
assert.strictEqual(eval330PM.isOpen, false);
assert.strictEqual(eval330PM.canPlaceOrder, false);
assert.strictEqual(eval330PM.reasonCode, 'CLOSED_OUTSIDE_HOURS');
assert(eval330PM.nextOpening.label.includes('05:00 PM'));
console.log('✓ Break between slots verified: correctly reports opens Today at 05:00 PM');

console.log('\n🎉 ALL AVAILABILITY TESTS PASSED!\n');

