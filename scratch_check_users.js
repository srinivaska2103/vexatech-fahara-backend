require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const users = await prisma.users.findMany({
    include: { roles: true }
  });
  console.log('--- ALL USERS IN DATABASE ---');
  console.log(users.map(u => ({ id: u.id, email: u.email, role: u.roles?.name, status: u.status })));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
