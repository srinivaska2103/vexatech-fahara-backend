const { checkAndProcessExpiredSubscriptions } = require('../services/subscriptionService');

const startSubscriptionExpirationCron = () => {
  console.log('[Cron] Initializing Subscription Expiration Checker...');

  // 1. Initial check at startup
  setTimeout(() => {
    checkAndProcessExpiredSubscriptions().catch((err) => {
      console.error('[SubscriptionExpirationCron Initial Run Error]:', err.message);
    });
  }, 10000);

  // 2. Periodic check every 1 hour
  setInterval(() => {
    console.log('[Cron] Running scheduled subscription expiration check...');
    checkAndProcessExpiredSubscriptions().catch((err) => {
      console.error('[SubscriptionExpirationCron Interval Error]:', err.message);
    });
  }, 60 * 60 * 1000);
};

module.exports = {
  startSubscriptionExpirationCron
};
