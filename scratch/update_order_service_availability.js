const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/orderService.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add restaurantAvailabilityService import
if (!content.includes('restaurantAvailabilityService')) {
  content = `const restaurantAvailabilityService = require('./restaurantAvailabilityService');\n` + content;
}

// 2. Validate availability in checkout
const checkoutTarget = `    // Verify fulfilment settings for cafe
    const settings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);`;

const checkoutReplacement = `    // Verify fulfilment settings & Restaurant Business Hours for cafe
    const settings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);

    // Server-side restaurant availability verification
    const availability = restaurantAvailabilityService.evaluateOrderingAvailability(settings);
    if (!availability.canPlaceOrder) {
      const error = new Error(availability.message || 'Restaurant is currently closed for online ordering.');
      error.statusCode = 400;
      error.availability = availability;
      throw error;
    }`;

if (content.includes(checkoutTarget)) {
  content = content.replace(checkoutTarget, checkoutReplacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully added availability check to orderService.checkout');
} else {
  console.error('checkoutTarget not found in orderService.js');
}

