const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function testDelete() {
  try {
    const booking_number = 'FAH-20260726-0506E8';
    console.log('Finding booking', booking_number);
    const booking = await prisma.bookings.findUnique({ where: { booking_number } });
    if (!booking) {
      console.log('Booking not found!');
      process.exit(0);
    }
    console.log('Found booking UUID:', booking.id);
    
    console.log('Attempting transaction delete...');
    await prisma.$transaction([
      prisma.payments.deleteMany({ where: { booking_id: booking.id } }),
      prisma.notifications.deleteMany({ where: { booking_id: booking.id } }),
      prisma.reviews.deleteMany({ where: { booking_id: booking.id } }),
      prisma.bookings.delete({ where: { id: booking.id } })
    ]);
    console.log('SUCCESSFULLY DELETED!');
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
testDelete();
