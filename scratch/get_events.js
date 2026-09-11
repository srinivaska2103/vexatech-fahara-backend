require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function main() {
  const packages = await prisma.cafe_packages.findMany();
  console.log(JSON.stringify(packages, null, 2));
  await prisma.$disconnect();
}
main();
