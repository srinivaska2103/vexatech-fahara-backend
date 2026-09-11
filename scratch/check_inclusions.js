require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function checkBookingInclusions() {
  try {
    const booking = await prisma.bookings.findUnique({
      where: { id: '499de2e4-ae2a-43ac-b26b-eb255dc3df34' }
    });
    console.log('BOOKING RECORD:', JSON.stringify(booking, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkBookingInclusions();
