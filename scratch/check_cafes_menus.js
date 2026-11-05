require('dotenv').config();
const prisma = require('../src/config/prisma');

async function test() {
  const cafes = await prisma.cafes.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      city: true,
      menu_items: {
        where: { is_available: true },
        select: { id: true, name: true }
      },
      menu_categories: {
        select: { id: true, name: true }
      }
    }
  });

  console.log('CAFES & MENU STATUS:');
  cafes.forEach(c => {
    console.log({
      id: c.id,
      name: c.name,
      category: c.category,
      city: c.city,
      itemsCount: c.menu_items.length,
      categoriesCount: c.menu_categories.length,
      hasFoodMenu: c.menu_items.length > 0
    });
  });
}

test().catch(console.error).finally(() => prisma.$disconnect());
