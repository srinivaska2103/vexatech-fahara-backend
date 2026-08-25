require('dotenv').config();
const { getBookingById } = require('./src/repositories/bookingRepository');
const prisma = require('./src/config/prisma');

async function main() {
  const res1 = await getBookingById('calendar');
  console.log('Result for "calendar":', res1);

  const res2 = await getBookingById('invalid-uuid-string');
  console.log('Result for "invalid-uuid-string":', res2);
}

main().finally(() => prisma.$disconnect());
