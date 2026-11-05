const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/foodOrderPaymentService.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add restaurantAvailabilityService & fulfilmentRepository
if (!content.includes('restaurantAvailabilityService')) {
  content = `const restaurantAvailabilityService = require('./restaurantAvailabilityService');\nconst fulfilmentRepository = require('../repositories/fulfilmentRepository');\n` + content;
}

// 2. Add validation before creating payment order
const paymentTarget = `    if (order.payment_status === 'PAID') {
      const err = new Error('This order is already paid');
      err.statusCode = 400;
      throw err;
    }`;

const paymentReplacement = `    if (order.payment_status === 'PAID') {
      const err = new Error('This order is already paid');
      err.statusCode = 400;
      throw err;
    }

    // Server-side restaurant availability verification during payment initiation
    const fulfilmentSettings = await fulfilmentRepository.getOrCreateFulfilmentSettings(order.cafe_id);
    const availability = restaurantAvailabilityService.evaluateOrderingAvailability(fulfilmentSettings);
    if (!availability.canPlaceOrder) {
      const err = new Error(availability.message || 'Restaurant has closed or paused accepting orders. Payment cannot be initiated.');
      err.statusCode = 400;
      err.availability = availability;
      throw err;
    }`;

if (content.includes(paymentTarget)) {
  content = content.replace(paymentTarget, paymentReplacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully added availability check to foodOrderPaymentService');
} else {
  console.error('paymentTarget not found in foodOrderPaymentService.js');
}



