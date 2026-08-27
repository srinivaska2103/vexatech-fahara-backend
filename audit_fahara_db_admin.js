require('dotenv').config();
const prisma = require('./src/config/prisma');

async function checkDbAdmin() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  
  const user = await prisma.users.findFirst({
    where: { email: 'vexatech.connect@gmail.com' },
    include: { roles: true }
  });
  console.log('--- ADMIN USER RECORD IN FAHARA DB ---');
  console.log(JSON.stringify(user, null, 2));

  const allAdmins = await prisma.users.findMany({
    where: { roles: { name: 'ADMIN' } },
    include: { roles: true }
  });
  console.log('--- ALL USERS WITH ROLE ADMIN --- Count:', allAdmins.length);
  console.log(JSON.stringify(allAdmins.map(u => ({ id: u.id, name: u.name, email: u.email, status: u.status, email_verified: u.email_verified, role: u.roles?.name })), null, 2));
}

checkDbAdmin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
