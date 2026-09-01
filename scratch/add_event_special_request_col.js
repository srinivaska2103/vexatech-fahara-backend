require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_special_request TEXT;`);
    console.log('Successfully added event_special_request column to bookings table!');
  } catch (err) {
    console.error('Error adding column:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
