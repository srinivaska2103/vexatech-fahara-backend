require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const notifications = await prisma.notifications.findMany();
  console.log(notifications);
}

main().catch(console.error).finally(() => prisma.$disconnect());
