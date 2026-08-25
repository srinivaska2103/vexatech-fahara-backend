const prisma = require('./src/config/prisma');

async function main() {
  const userId = '97bf90b9-3a57-40f0-92ca-13f670eed2d8';
  
  await prisma.notifications.create({
    data: {
      user_id: userId,
      title: 'Test Notification',
      message: 'If you see this, notifications are working.',
      notification_type: 'INFO',
      channel: 'IN_APP',
      status: 'SENT',
      sent_at: new Date()
    }
  });

  const count = await prisma.notifications.count({ where: { user_id: userId } });
  console.log('Total notifications for user:', count);
}

main().catch(console.error).finally(() => prisma.$disconnect());
