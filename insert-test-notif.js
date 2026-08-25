require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const eventManagers = await prisma.users.findMany({
    where: { roles: { name: 'EVENT_MANAGER' } },
    select: { id: true, email: true }
  });

  console.log('Event Managers:', eventManagers);

  for (const em of eventManagers) {
    await prisma.notifications.create({
      data: {
        user_id: em.id,
        title: 'Welcome to Fahara Event Manager',
        message: 'This is a test notification to verify fetching works!',
        notification_type: 'SYSTEM',
        status: 'UNREAD',
      }
    });
    console.log(`Inserted notification for ${em.email}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
