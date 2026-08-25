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

/**
 * Runs immediately on startup to catch any missed bookings and settlements,
 * then repeats booking auto-complete every 15 mins and settlement verification every 3 hours.
 */
const startBookingStatusCron = () => {
  const { checkVendorSettlements } = require('../services/transferService');

  // Run immediately when server starts
  runAutoComplete();
  checkVendorSettlements();

  // Schedule auto-complete every 15 minutes
  cron.schedule('*/15 * * * *', runAutoComplete);

  // Schedule vendor settlement verification with Razorpay every 3 hours
  cron.schedule('0 */3 * * *', checkVendorSettlements);

  console.log('[Cron] Booking status auto-complete (every 15m) and Vendor Settlement verification with Razorpay (every 3h: 0 */3 * * *) scheduled.');
};

module.exports = { startBookingStatusCron };
