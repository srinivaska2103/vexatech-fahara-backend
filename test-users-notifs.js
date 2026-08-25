require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const notifs = await prisma.notifications.findMany({
    select: {
      user_id: true,
      users: {
        select: {
          id: true,
          email: true,
          role_id: true,
          roles: { select: { name: true } }
        }
      }
    },
    distinct: ['user_id']
  });
  console.log('Users with notifications:', JSON.stringify(notifs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
