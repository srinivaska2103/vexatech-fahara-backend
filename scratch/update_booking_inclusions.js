require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function main() {
  try {
    const updated = await prisma.bookings.update({
      where: { id: 'f5fa7511-762a-4a82-858e-f0bca9c76c1d' },
      data: {
        inclusions: ["Food & Catering: Basic (Cake)"]
      }
    });
    console.log('UPDATED BOOKING INCLUSIONS:', JSON.stringify(updated.inclusions, null, 2));
  } catch (err) {
    console.error('Error updating inclusions:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
