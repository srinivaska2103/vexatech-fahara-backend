require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function main() {
  try {
    const booking = await prisma.bookings.findUnique({
      where: { id: 'f5fa7511-762a-4a82-858e-f0bca9c76c1d' },
      include: { cafes: { include: { cafe_packages: true } }, event_services: true, users: true }
    });
    console.log('BOOKING RECORD:', JSON.stringify(booking, null, 2));
  } catch (err) {
    console.error('Error fetching booking:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
