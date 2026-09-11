const prisma = require('../src/config/prisma');

async function main() {
  const cafes = await prisma.cafes.findMany({
    select: { id: true, name: true, status: true }
  });
  console.log('CAFES IN DB:', cafes);
  await prisma.$disconnect();
}

main().catch(console.error);
