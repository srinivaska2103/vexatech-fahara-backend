require('dotenv').config();
const prisma = require('../src/config/prisma');

async function inspectCafesStatus() {
  try {
    const cafes = await prisma.cafes.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        owner_id: true,
        users: {
          select: {
            name: true,
            email: true,
            partner_subscriptions: true
          }
        }
      }
    });
    console.log('All Cafes count:', cafes.length);
    console.log(JSON.stringify(cafes, null, 2));
  } catch (err) {
    console.error('Error inspecting cafes status:', err);
  } finally {
    await prisma.$disconnect();
  }
}

inspectCafesStatus();
