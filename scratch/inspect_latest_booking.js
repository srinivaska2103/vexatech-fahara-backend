require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function main() {
  try {
    const booking = await prisma.bookings.findFirst({
      orderBy: { created_at: 'desc' },
      include: { cafes: true }
    });
    console.log('Latest Booking DB Record:', JSON.stringify(booking, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
