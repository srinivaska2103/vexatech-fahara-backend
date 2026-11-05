require('dotenv').config();
const prisma = require('../src/config/prisma');

async function test() {
  const items = await prisma.menu_items.findMany({
    select: { id: true, name: true, cafe_id: true, cafes: { select: { name: true } } }
  });
  console.log('ALL MENU ITEMS IN DB:');
  items.forEach(i => console.log(i.name, '-> Cafe:', i.cafes?.name, '(CafeId:', i.cafe_id, ')'));
}

test().catch(console.error).finally(() => prisma.$disconnect());

