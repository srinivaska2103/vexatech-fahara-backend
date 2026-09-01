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

const { execSync } = require('child_process');

// Run automatic DB initialization if enabled or missing tables
if (process.env.AUTO_MIGRATE_DB !== 'false') {
  try {
    console.log('[DB Init] Syncing database schema with Prisma...');
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('[DB Init] Database schema synced successfully.');
  } catch (err) {
    console.error('[DB Init] Error syncing database schema:', err.message);
  }
}

const http = require('http');
const { initSocket } = require('./config/socket');

const server = http.createServer(app);

initSocket(server);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} with WebSockets enabled`);
  // Start scheduled jobs
  startBookingStatusCron();
});

