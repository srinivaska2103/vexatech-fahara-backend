require('dotenv').config();
const prisma = require('../src/config/prisma');

async function test() {
  const latestOrder = await prisma.food_orders.findFirst({
    orderBy: { created_at: 'desc' },
    include: {
      cafes: { include: { users: true } },
      users: true
    }
  });
  console.log('Latest Order in DB:');
  console.log({
    id: latestOrder?.id,
    order_number: latestOrder?.order_number,
    status: latestOrder?.order_status,
    payment_status: latestOrder?.payment_status,
    customer_id: latestOrder?.customer_id,
    customer_email_in_user: latestOrder?.users?.email,
    cafe_id: latestOrder?.cafe_id,
    owner_email_in_cafe_user: latestOrder?.cafes?.users?.email,
    created_at: latestOrder?.created_at
  });
}

test().catch(console.error).finally(() => prisma.$disconnect());
