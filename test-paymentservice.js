require('dotenv').config();
const paymentService = require('./src/services/paymentService');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function run() {
  try {
    const bookingId = 'c6a81346-d000-4035-a687-27eaf66d4dbf';
    const booking = await prisma.bookings.findUnique({ where: { id: bookingId } });
    if (!booking) {
      console.log('Booking not found');
      return;
    }
    
    console.log('Testing createOrder for booking:', bookingId, 'userId:', booking.customer_id);
    const result = await paymentService.createOrder(booking.customer_id, bookingId);
    console.log('Success:', result);
  } catch (error) {
    console.error('Test Failed!');
    if (error.statusCode) console.error('Status Code:', error.statusCode);
    console.error('Error Message:', error.message);
    if (error.response?.data) console.error('Axios Data:', error.response.data);
  } finally {
    await prisma.$disconnect();
    pool.end();
  }
}

run();
