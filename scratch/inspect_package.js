const prisma = require('../src/config/prisma');

async function main() {
  const pkg = await prisma.cafe_packages.findUnique({
    where: { id: '30bd6ee0-18c0-414c-b31c-f9aa1644eac7' }
  });
  console.log('PACKAGE IN DB:', JSON.stringify(pkg, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
