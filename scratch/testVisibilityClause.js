require('dotenv').config();
const prisma = require('../src/config/prisma');

async function testQuery() {
  try {
    const now = new Date();
    const visibleCafes = await prisma.cafes.findMany({
      where: {
        status: { in: ['APPROVED', 'ACTIVE'] },
        users: {
          partner_subscriptions: {
            some: {
              status: 'ACTIVE',
              current_period_end: { gt: now }
            }
          }
        }
      },
      select: {
        id: true,
        name: true,
        status: true,
        users: {
          select: {
            name: true,
            email: true,
            partner_subscriptions: {
              select: {
                status: true,
                current_period_end: true
              }
            }
          }
        }
      }
    });

    console.log('Customer Visible Cafes count:', visibleCafes.length);
    console.log(JSON.stringify(visibleCafes, null, 2));
  } catch (err) {
    console.error('Error testing query:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testQuery();
