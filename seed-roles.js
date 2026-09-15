require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const roles = await prisma.roles.findMany();
  console.log('Current roles:', roles);
  
  const requiredRoles = ['ADMIN', 'CAFE_OWNER', 'WALKING_CAFE_OWNER', 'EVENT_MANAGER', 'CUSTOMER'];
  
  for (const roleName of requiredRoles) {
    if (!roles.find(r => r.name === roleName)) {
      console.log(`Creating ${roleName} role...`);
      await prisma.roles.create({ data: { name: roleName } });
      console.log(`${roleName} role created.`);
    } else {
      console.log(`${roleName} role already exists.`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
