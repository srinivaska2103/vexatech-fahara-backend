require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function updateBooking() {
  try {
    const updated = await prisma.bookings.update({
      where: { id: 'f9b58da7-5564-41ad-bc68-89eb21646491' },
      data: {
        cafe_amount: 1.00,
        food_amount: 3.00,
        subtotal: 4.00,
        fahara_service_charge: 0.12,
        transaction_fee: 0.12,
        gst: 0.02,
        total: 4.26
      }
    });
    console.log('UPDATED BOOKING f9b58da7-5564-41ad-bc68-89eb21646491:', JSON.stringify(updated, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

updateBooking();
