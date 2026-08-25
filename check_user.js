const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.users.findUnique({
    where: { email: 'infotrixsolutions82@gmail.com' },
  });
  console.log(user);
  await prisma.$disconnect();
}

main();
