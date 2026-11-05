const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/controllers/fulfilmentController.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add restaurantAvailabilityService import at the top
const importLine = `const restaurantAvailabilityService = require('../services/restaurantAvailabilityService');\n`;
if (!content.includes('restaurantAvailabilityService')) {
  content = importLine + content;
}

// 2. Expand getFulfilmentSettings to also return live availability status
const getTarget = `      const settings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);
      return res.status(200).json({
        success: true,
        data: settings
      });`;

const getReplacement = `      const settings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);
      const availability = restaurantAvailabilityService.evaluateOrderingAvailability(settings);
      return res.status(200).json({
        success: true,
        data: {
          ...settings,
          currentAvailability: availability
        }
      });`;

content = content.replace(getTarget, getReplacement);

// 3. Expand updateFulfilmentSettings to handle business hours & availability fields
const updateDestructTarget = `        freeDeliveryThreshold,
        estimatedDeliveryTimeMinutes,
        deliveryOperatingHours
      } = req.body;`;

const updateDestructReplacement = `        freeDeliveryThreshold,
        estimatedDeliveryTimeMinutes,
        deliveryOperatingHours,
        isOrderingEnabled,
        autoEnableOrderingHours,
        allowOrdersOutsideHours,
        isTemporarilyPaused,
        pauseReason,
        pausedUntil,
        restaurantTimezone,
        weeklyBusinessHours,
        specialClosingDates
      } = req.body;`;

content = content.replace(updateDestructTarget, updateDestructReplacement);

// 4. Add payload assignments for the new fields
const payloadTarget = `      if (estimatedDeliveryTimeMinutes !== undefined) payload.estimated_delivery_time_minutes = Number(estimatedDeliveryTimeMinutes);
      if (deliveryOperatingHours !== undefined) payload.delivery_operating_hours = deliveryOperatingHours;`;

const payloadReplacement = `      if (estimatedDeliveryTimeMinutes !== undefined) payload.estimated_delivery_time_minutes = Number(estimatedDeliveryTimeMinutes);
      if (deliveryOperatingHours !== undefined) payload.delivery_operating_hours = deliveryOperatingHours;

      if (isOrderingEnabled !== undefined) payload.is_ordering_enabled = Boolean(isOrderingEnabled);
      if (autoEnableOrderingHours !== undefined) payload.auto_enable_ordering_hours = Boolean(autoEnableOrderingHours);
      if (allowOrdersOutsideHours !== undefined) payload.allow_orders_outside_hours = Boolean(allowOrdersOutsideHours);
      if (isTemporarilyPaused !== undefined) payload.is_temporarily_paused = Boolean(isTemporarilyPaused);
      if (pauseReason !== undefined) payload.pause_reason = pauseReason ? String(pauseReason).trim() : null;
      if (pausedUntil !== undefined) payload.paused_until = pausedUntil ? new Date(pausedUntil) : null;
      if (restaurantTimezone !== undefined) payload.restaurant_timezone = String(restaurantTimezone).trim();
      if (weeklyBusinessHours !== undefined) payload.weekly_business_hours = weeklyBusinessHours;
      if (specialClosingDates !== undefined) payload.special_closing_dates = specialClosingDates;`;

content = content.replace(payloadTarget, payloadReplacement);

// 5. Add public endpoint for customer-side availability query: getPublicCafeAvailability
const publicAvailabilityMethod = `
  // GET /api/v1/public/cafes/:cafeId/availability
  async getPublicCafeAvailability(req, res, next) {
    try {
      const { cafeId } = req.params;
      const settings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);
      const availability = restaurantAvailabilityService.evaluateOrderingAvailability(settings);

      return res.status(200).json({
        success: true,
        data: {
          cafeId,
          timezone: settings.restaurant_timezone || 'Asia/Kolkata',
          isOrderingEnabled: settings.is_ordering_enabled,
          isTemporarilyPaused: settings.is_temporarily_paused,
          pauseReason: settings.pause_reason,
          allowOrdersOutsideHours: settings.allow_orders_outside_hours,
          weeklyBusinessHours: settings.weekly_business_hours,
          specialClosingDates: settings.special_closing_dates,
          availability
        }
      });
    } catch (err) {
      next(err);
    }
  },
`;

if (!content.includes('getPublicCafeAvailability')) {
  content = content.replace('module.exports = fulfilmentController;', `${publicAvailabilityMethod}\nfulfilmentController.getPublicCafeAvailability = fulfilmentController.getPublicCafeAvailability || function(req, res, next) { return module.exports.getPublicCafeAvailability(req, res, next); };\nmodule.exports = fulfilmentController;`);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated fulfilmentController.js');

