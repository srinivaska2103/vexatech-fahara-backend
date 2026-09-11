require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function checkHours() {
  try {
    const cafe = await prisma.cafes.findUnique({
      where: { id: '79e55e5d-deb2-489a-9552-07fdad758af1' },
      include: { cafe_business_hours: true }
    });
    console.log('CAFE HOURS IN DB:', JSON.stringify(cafe.cafe_business_hours, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkHours();
