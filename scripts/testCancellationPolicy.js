const assert = require('assert');

// Test policy logic isolated
function evaluateCancellationWindow(orderCreatedAtStr, nowMs) {
  const orderCreatedAt = new Date(orderCreatedAtStr);
  const cancellationDeadline = new Date(orderCreatedAt.getTime() + 5 * 60 * 1000);
  const secondsRemaining = Math.max(0, Math.floor((cancellationDeadline.getTime() - nowMs) / 1000));
  const isWithin5Minutes = secondsRemaining > 0;
  return {
    isWithin5Minutes,
    secondsRemaining,
    canCancel: isWithin5Minutes
  };
}

const baseTime = Date.now();
const orderTime = new Date(baseTime).toISOString();

// Case 1: Immediately after order placement (0s elapsed)
const case1 = evaluateCancellationWindow(orderTime, baseTime);
console.log('Case 1 (Immediately after placement):', case1);
assert.strictEqual(case1.canCancel, true);
assert(case1.secondsRemaining >= 299 && case1.secondsRemaining <= 300);

// Case 2: At 4 minutes 59 seconds (299s elapsed)
const case2 = evaluateCancellationWindow(orderTime, baseTime + 299 * 1000);
console.log('Case 2 (At 4m 59s):', case2);
assert.strictEqual(case2.canCancel, true);
assert.strictEqual(case2.secondsRemaining, 1);

// Case 3: At exactly 5 minutes (300s elapsed)
const case3 = evaluateCancellationWindow(orderTime, baseTime + 300 * 1000);
console.log('Case 3 (At exactly 5m 00s):', case3);
assert.strictEqual(case3.canCancel, false);
assert.strictEqual(case3.secondsRemaining, 0);

// Case 4: At 5 minutes 1 second (301s elapsed)
const case4 = evaluateCancellationWindow(orderTime, baseTime + 301 * 1000);
console.log('Case 4 (At 5m 01s):', case4);
assert.strictEqual(case4.canCancel, false);
assert.strictEqual(case4.secondsRemaining, 0);

console.log('\nAll 5-minute cancellation window test cases passed successfully!');

