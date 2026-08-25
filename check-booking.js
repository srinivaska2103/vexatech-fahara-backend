require('dotenv').config();
const prisma = require('./src/config/prisma');

async function checkBooking() {
  const bookingId = '4893d33d-adc7-45be-a122-b0270ebc12fe';
  const booking = await prisma.bookings.findUnique({
    where: { id: bookingId }
  });
  console.log("Booking found:", booking ? "YES" : "NO");
  if (booking) {
    console.log("Booking Status:", booking.booking_status);
  }
}

checkBooking().catch(console.error).finally(() => prisma.$disconnect());
