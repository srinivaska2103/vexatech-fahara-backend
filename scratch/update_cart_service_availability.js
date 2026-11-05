const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/cartService.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add restaurantAvailabilityService & fulfilmentRepository imports
if (!content.includes('restaurantAvailabilityService')) {
  content = `const restaurantAvailabilityService = require('./restaurantAvailabilityService');\nconst fulfilmentRepository = require('../repositories/fulfilmentRepository');\n` + content;
}

// 2. Validate in addItemToCart
const addTarget = `  async addItemToCart(customerId, { cafeId, menuItemId, quantity = 1, forceReplace = false }) {
    if (!cafeId || !menuItemId) {
      const error = new Error('cafeId and menuItemId are required');
      error.statusCode = 400;
      throw error;
    }`;

const addReplacement = `  async addItemToCart(customerId, { cafeId, menuItemId, quantity = 1, forceReplace = false }) {
    if (!cafeId || !menuItemId) {
      const error = new Error('cafeId and menuItemId are required');
      error.statusCode = 400;
      throw error;
    }

    // 0. Server-side Restaurant Business Hours & Ordering Availability Check
    const fulfilmentSettings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);
    const availability = restaurantAvailabilityService.evaluateOrderingAvailability(fulfilmentSettings);
    if (!availability.canPlaceOrder) {
      const error = new Error(availability.message || 'Restaurant is currently closed for online ordering.');
      error.statusCode = 400;
      error.availability = availability;
      throw error;
    }`;

if (content.includes(addTarget)) {
  content = content.replace(addTarget, addReplacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully added availability check to cartService.addItemToCart');
} else {
  console.error('Target not found in cartService.js');
}

