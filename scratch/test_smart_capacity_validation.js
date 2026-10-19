/**
 * Automated Test Suite for Fahara Smart Guest Count & Package Capacity Validation
 * Validates all 14 scenarios outlined in Requirement 11.
 */

const { calculateAllowedGuestCount, validateGuestCount } = require('../src/utils/capacityValidator');

async function runAllCapacityTests() {
  console.log('================================================================');
  console.log('🧪 Starting Fahara Smart Capacity Validation Verification Suite');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(scenarioName, condition, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${scenarioName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${scenarioName} - ${details}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Scenario 1: Guest count is within all applicable limits
  // -------------------------------------------------------------
  {
    const res = validateGuestCount({
      guestCount: 8,
      cafeCapacity: 50,
      tableCapacity: 10,
      hasSelectedTable: true,
      cafePackageCapacity: 25,
      eventManagerPackageCapacity: 20
    });
    assert(
      'Scenario 1: Guest count (8) is within all limits (min 10)',
      res.isValid === true && res.maxAllowedGuests === 10,
      JSON.stringify(res)
    );
  }

  // -------------------------------------------------------------
  // Scenario 2: Guest count exceeds cafe capacity
  // -------------------------------------------------------------
  {
    const res = validateGuestCount({
      guestCount: 55,
      cafeCapacity: 50,
      hasSelectedTable: false
    });
    assert(
      'Scenario 2: Guest count (55) exceeds cafe capacity (50)',
      res.isValid === false && res.maxAllowedGuests === 50 && res.errorType === 'EXCEEDS_CAFE_CAPACITY',
      JSON.stringify(res)
    );
  }

  // -------------------------------------------------------------
  // Scenario 3: Guest count exceeds selected table capacity
  // -------------------------------------------------------------
  {
    const res = validateGuestCount({
      guestCount: 6,
      cafeCapacity: 50,
      tableCapacity: 4,
      hasSelectedTable: true
    });
    assert(
      'Scenario 3: Guest count (6) exceeds table capacity (4)',
      res.isValid === false && res.maxAllowedGuests === 4 && res.errorType === 'EXCEEDS_TABLE_CAPACITY',
      JSON.stringify(res)
    );
  }

  // -------------------------------------------------------------
  // Scenario 4: Guest count exceeds cafe package capacity
  // -------------------------------------------------------------
  {
    const res = validateGuestCount({
      guestCount: 18,
      cafeCapacity: 40,
      cafePackageCapacity: 15,
      hasSelectedTable: false
    });
    assert(
      'Scenario 4: Guest count (18) exceeds cafe package capacity (15)',
      res.isValid === false && res.maxAllowedGuests === 15 && res.errorType === 'EXCEEDS_PACKAGE_CAPACITY',
      JSON.stringify(res)
    );
  }

  // -------------------------------------------------------------
  // Scenario 5: Guest count exceeds Event Manager package capacity
  // -------------------------------------------------------------
  {
    const res = validateGuestCount({
      guestCount: 45,
      cafeCapacity: 60,
      eventManagerPackageCapacity: 40,
      hasSelectedTable: false
    });
    assert(
      'Scenario 5: Guest count (45) exceeds Event Manager package capacity (40)',
      res.isValid === false && res.maxAllowedGuests === 40 && res.errorType === 'EXCEEDS_EVENT_MANAGER_CAPACITY',
      JSON.stringify(res)
    );
  }

  // -------------------------------------------------------------
  // Scenario 6: Event Manager package limit exceeds cafe capacity
  // (Effective max must be cafe capacity: 30, not 40)
  // -------------------------------------------------------------
  {
    const calc = calculateAllowedGuestCount({
      cafeCapacity: 30,
      eventManagerPackageCapacity: 40,
      hasSelectedTable: false
    });
    const res = validateGuestCount({
      guestCount: 35,
      cafeCapacity: 30,
      eventManagerPackageCapacity: 40,
      hasSelectedTable: false
    });
    assert(
      'Scenario 6: EM package (40) cannot override cafe capacity (30) - effective max is 30',
      calc.maxAllowedGuests === 30 && res.isValid === false && res.maxAllowedGuests === 30,
      `maxAllowed: ${calc.maxAllowedGuests}, res: ${JSON.stringify(res)}`
    );
  }

  // -------------------------------------------------------------
  // Scenario 7: Cafe package and Event Manager package have different limits
  // (Cafe pkg: 25, EM pkg: 18 -> effective max is 18)
  // -------------------------------------------------------------
  {
    const calc = calculateAllowedGuestCount({
      cafeCapacity: 50,
      cafePackageCapacity: 25,
      eventManagerPackageCapacity: 18,
      hasSelectedTable: false
    });
    assert(
      'Scenario 7: Minimum of cafe package (25) and EM package (18) is respected (18)',
      calc.maxAllowedGuests === 18 && (calc.limitingFactor.includes('Event Manager') || calc.bindingConstraint?.type === 'EVENT_MANAGER_PACKAGE'),
      JSON.stringify(calc)
    );
  }

  // -------------------------------------------------------------
  // Scenario 8: Customer changes guest count after selecting a package
  // (Customer selects 15-guest package with 10 guests [OK], then increases to 16 [Incompatible])
  // -------------------------------------------------------------
  {
    const before = validateGuestCount({
      guestCount: 10,
      cafeCapacity: 50,
      cafePackageCapacity: 15,
      hasSelectedTable: false
    });
    const after = validateGuestCount({
      guestCount: 16,
      cafeCapacity: 50,
      cafePackageCapacity: 15,
      hasSelectedTable: false
    });
    assert(
      'Scenario 8: Guest count change from 10 to 16 flags package incompatibility immediately',
      before.isValid === true && after.isValid === false && after.errorType === 'EXCEEDS_PACKAGE_CAPACITY',
      `before: ${before.isValid}, after: ${after.isValid}`
    );
  }

  // -------------------------------------------------------------
  // Scenario 9: Customer switches packages after selecting guests
  // (12 guests: switches from 20-guest package [OK] to 10-guest package [Incompatible])
  // -------------------------------------------------------------
  {
    const pkgA = validateGuestCount({
      guestCount: 12,
      cafeCapacity: 50,
      cafePackageCapacity: 20,
      hasSelectedTable: false
    });
    const pkgB = validateGuestCount({
      guestCount: 12,
      cafeCapacity: 50,
      cafePackageCapacity: 10,
      hasSelectedTable: false
    });
    assert(
      'Scenario 9: Switching from 20-guest package to 10-guest package rejects 12 guests',
      pkgA.isValid === true && pkgB.isValid === false && pkgB.maxAllowedGuests === 10,
      `pkgA: ${pkgA.isValid}, pkgB: ${pkgB.isValid}`
    );
  }

  // -------------------------------------------------------------
  // Scenario 10: Table booking is not required and must not impose a table limit
  // -------------------------------------------------------------
  {
    const calc = calculateAllowedGuestCount({
      cafeCapacity: 60,
      tableCapacity: 4,
      hasSelectedTable: false, // Open seating / event venue space
      cafePackageCapacity: 30
    });
    assert(
      'Scenario 10: Unselected table (4) does NOT limit open event booking (max is 30)',
      calc.maxAllowedGuests === 30 && calc.tableCapacity === null,
      JSON.stringify(calc)
    );
  }

  // -------------------------------------------------------------
  // Scenario 11: Capacity data is missing or invalid
  // (Safe fallback to positive cafe capacity; invalid strings / negatives handled safely)
  // -------------------------------------------------------------
  {
    const calc = calculateAllowedGuestCount({
      cafeCapacity: '50',
      tableCapacity: null,
      hasSelectedTable: true,
      cafePackageCapacity: undefined,
      eventManagerPackageCapacity: -5, // Invalid negative
      inclusionTierLimits: [null, undefined, 'abc', 45]
    });
    assert(
      'Scenario 11: Missing, invalid and negative limits handled safely without defaulting to 0 or infinity',
      calc.maxAllowedGuests === 45 && calc.eventManagerPackageCapacity === null,
      JSON.stringify(calc)
    );
  }

  // -------------------------------------------------------------
  // Scenario 12: Customer attempts to bypass frontend restrictions and submits invalid booking directly to API
  // -------------------------------------------------------------
  {
    const resNegative = validateGuestCount({
      guestCount: -2,
      cafeCapacity: 50
    });
    const resZero = validateGuestCount({
      guestCount: 0,
      cafeCapacity: 50
    });
    const resString = validateGuestCount({
      guestCount: 'twelve',
      cafeCapacity: 50
    });
    const resExceeding = validateGuestCount({
      guestCount: 9999,
      cafeCapacity: 50
    });
    assert(
      'Scenario 12: Direct API bypass with negative, zero, non-integer or excess count is rejected',
      resNegative.isValid === false &&
      resZero.isValid === false &&
      resString.isValid === false &&
      resExceeding.isValid === false,
      `neg: ${resNegative.isValid}, zero: ${resZero.isValid}, str: ${resString.isValid}, exc: ${resExceeding.isValid}`
    );
  }

  // -------------------------------------------------------------
  // Scenario 13: Customer proceeds to payment with valid and invalid selections
  // -------------------------------------------------------------
  {
    // Payment service creates order only when capacity validation passes
    const validBooking = validateGuestCount({
      guestCount: 15,
      cafeCapacity: 50,
      cafePackageCapacity: 20,
      hasSelectedTable: false
    });
    const invalidBooking = validateGuestCount({
      guestCount: 25,
      cafeCapacity: 50,
      cafePackageCapacity: 20,
      hasSelectedTable: false
    });
    assert(
      'Scenario 13: Payment checkout validation accepts 15 guests and blocks 25 guests for 20-cap package',
      validBooking.isValid === true && invalidBooking.isValid === false,
      `valid: ${validBooking.isValid}, invalid: ${invalidBooking.isValid}`
    );
  }

  // -------------------------------------------------------------
  // Scenario 14: Desktop and mobile booking summaries remain synchronized
  // (Both evaluate the exact same calculateAllowedGuestCount specification)
  // -------------------------------------------------------------
  {
    const summaryCapacity = calculateAllowedGuestCount({
      cafeCapacity: 40,
      tableCapacity: 8,
      hasSelectedTable: true,
      cafePackageCapacity: 15,
      eventManagerPackageCapacity: null
    });
    assert(
      'Scenario 14: Summary capacity calculation produces uniform maxAllowedGuests (8) across all viewports',
      summaryCapacity.maxAllowedGuests === 8 &&
      summaryCapacity.cafeCapacity === 40 &&
      summaryCapacity.packageCapacity === 15 &&
      summaryCapacity.tableCapacity === 8,
      JSON.stringify(summaryCapacity)
    );
  }

  console.log('\n================================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllCapacityTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
