require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require(require('path').join(__dirname, '../src/config/prisma'));

async function main() {
  const order = await prisma.food_orders.findUnique({
    where: { id: '47f29f99-9273-41a1-bf56-e7b71ef47e4e' },
    select: {
      id: true,
      order_number: true,
      order_status: true,
      customer_id: true,
      cafe_id: true,
      total_amount: true,
      customer_name: true
    }
  });
  console.log("TARGET ORDER:", order);
}

main().catch(console.error).finally(() => prisma.$disconnect());

