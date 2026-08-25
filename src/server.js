require('dotenv').config();
const app = require('./app');
const { startBookingStatusCron } = require('./utils/bookingStatusCron');

const PORT = process.env.PORT || 5000;

// ── Global error safety nets ─────────────────────────────────────────────────
// Prevent unhandled promise rejections (e.g. DB blips) from crashing the server
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UnhandledRejection] Unhandled Promise Rejection at:', promise, 'Reason:', reason);
  // Do NOT exit – keep the server alive and let the per-request error handler deal with it
});

// Prevent synchronous uncaught exceptions from crashing the server
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException] Uncaught Exception:', err.message);
  console.error(err.stack);
  // For truly fatal errors we exit and let the process manager (pm2 / nodemon) restart
  // But for non-fatal ones (e.g. a single bad request) we stay alive
});
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Start scheduled jobs
  startBookingStatusCron();
});
