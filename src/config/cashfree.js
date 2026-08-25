const { Cashfree, CFEnvironment } = require('cashfree-pg');

const environment = process.env.CASHFREE_ENVIRONMENT === 'SANDBOX' ? CFEnvironment.SANDBOX : CFEnvironment.PRODUCTION;
const cashfreeInstance = new Cashfree(
    environment,
    process.env.CASHFREE_APP_ID,
    process.env.CASHFREE_SECRET_KEY
);

module.exports = cashfreeInstance;
