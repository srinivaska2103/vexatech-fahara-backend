require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const users = await prisma.users.findMany({
    where: {
      id: { in: ['8568f746-6906-4e58-bbaa-4281d604eee0', '869a09d8-1b7f-4a89-b019-2ba65412412b'] }
    },
    select: { id: true, name: true, role_id: true, roles: { select: { role_name: true } } }
  });
  console.log('Users with notifications:', users);

  const eventManagers = await prisma.users.findMany({
    where: { roles: { role_name: 'EVENT_MANAGER' } },
    select: { id: true, name: true }
  });
  console.log('Event Managers:', eventManagers);
}

main().catch(console.error).finally(() => prisma.$disconnect());
