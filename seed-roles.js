require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const roles = await prisma.roles.findMany();
  console.log('Current roles:', roles);
  
  if (!roles.find(r => r.name === 'ADMIN')) {
    console.log('Creating ADMIN role...');
    await prisma.roles.create({ data: { name: 'ADMIN' } });
    console.log('ADMIN role created.');
  } else {
    console.log('ADMIN role already exists.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
