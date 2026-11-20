const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const banners = await prisma.banner.findMany({
    orderBy: { priority: 'asc' }
  });
  console.log('TOTAL BANNERS IN DB:', banners.length);
  for (const b of banners) {
    console.log(JSON.stringify({
      id: b.id,
      name: b.name,
      title: b.title,
      position: b.position,
      is_active: b.is_active,
      priority: b.priority,
      banner_layout: b.banner_layout
    }));
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
