const cron = require('node-cron');
const prisma = require('../config/prisma');

/**
 * Updates booking_status to 'COMPLETED' in the database
 * for bookings that:
 *  - have booking_status of CONFIRMED or PENDING
 *  - have payment_status of PAID or COMPLETED
 *  - have a booking_date and end_time that are in the past
 */
const runAutoComplete = async () => {
  try {
    const now = new Date();

    // Fetch potential bookings (booking_date <= today)
    const bookings = await prisma.bookings.findMany({
      where: {
        booking_status: { in: ['CONFIRMED', 'PENDING'] },
        payment_status: { in: ['PAID', 'COMPLETED'] },
        booking_date: { lte: now },
      },
      select: {
        id: true,
        booking_date: true,
        end_time: true,
      },
    });

    const bookingsToComplete = [];
    
    for (const booking of bookings) {
      if (!booking.booking_date || !booking.end_time) continue;
      
      // Combine booking_date and end_time
      const bookingEndDateTime = new Date(booking.booking_date);
      
      const hours = booking.end_time.getUTCHours();
      const minutes = booking.end_time.getUTCMinutes();
      const seconds = booking.end_time.getUTCSeconds();
      
      bookingEndDateTime.setUTCHours(hours, minutes, seconds, 0);

      // Check if current time has passed the booking end time
      if (now >= bookingEndDateTime) {
        bookingsToComplete.push(booking.id);
      }
    }

    if (bookingsToComplete.length > 0) {
      const result = await prisma.bookings.updateMany({
        where: {
          id: { in: bookingsToComplete },
        },
        data: {
          booking_status: 'COMPLETED',
        },
      });

      console.log(`[Cron] Auto-completed ${result.count} booking(s) whose date and time have passed.`);
    }
  } catch (err) {
    console.error('[Cron] Error auto-completing bookings:', err.message);
  }
};

let isAutoCompleteRunning = false;
let isSettlementRunning = false;

/**
 * Runs immediately on startup to catch any missed bookings and settlements,
 * then repeats booking auto-complete every 15 mins and settlement verification every 3 hours.
 */
const startBookingStatusCron = () => {
  const { checkVendorSettlements } = require('../services/transferService');

  // Run startup cron checks after 10 seconds so DB connection pool initializes cleanly first
  setTimeout(() => {
    runAutoComplete().catch(() => {});
    checkVendorSettlements().catch(() => {});
  }, 10000);

  // Schedule auto-complete every 15 minutes (non-overlapping)
  cron.schedule('*/15 * * * *', async () => {
    if (isAutoCompleteRunning) {
      console.warn('[Cron] Previous auto-complete run is still in progress, skipping tick.');
      return;
    }
    isAutoCompleteRunning = true;
    try {
      await runAutoComplete();
    } catch (err) {
      console.error('[Cron] Auto-complete error:', err);
    } finally {
      isAutoCompleteRunning = false;
    }
  });

  // Schedule vendor settlement verification with Razorpay every 3 hours (non-overlapping)
  cron.schedule('0 */3 * * *', async () => {
    if (isSettlementRunning) {
      console.warn('[Cron] Previous settlement verification is still in progress, skipping tick.');
      return;
    }
    isSettlementRunning = true;
    try {
      await checkVendorSettlements();
    } catch (err) {
      console.error('[Cron] Settlement verification error:', err);
    } finally {
      isSettlementRunning = false;
    }
  });

  console.log('[Cron] Booking status auto-complete (every 15m) and Vendor Settlement verification with Razorpay (every 3h: 0 */3 * * *) scheduled.');
};

module.exports = { startBookingStatusCron };
