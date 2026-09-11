require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const booking = await prisma.bookings.findUnique({
    where: { id: '619f0eba-0c45-4a57-94e7-6b3d16ccbaf7' },
    include: {
      booking_items: true,
      cafes: true
    }
  });
  console.log('=== BOOKING DATA ===');
  console.log(JSON.stringify(booking, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
