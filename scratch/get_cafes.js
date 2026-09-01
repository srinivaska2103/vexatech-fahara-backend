require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function main() {
  try {
    const cafes = await prisma.cafes.findMany({
      select: { id: true, name: true, price_per_hour: true }
    });
    console.log('Available Cafes in Database:', JSON.stringify(cafes, null, 2));
  } catch (err) {
    console.error('Error fetching cafes:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
