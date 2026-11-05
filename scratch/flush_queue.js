require('dotenv').config();
const queue = require('../src/services/email/foodOrderEmailQueue');
const prisma = require('../src/config/prisma');

async function flush() {
  console.log('Processing all pending email jobs...');
  await queue.processNextBatch();
  console.log('Waiting 3s...');
  await new Promise(r => setTimeout(r, 3000));
  await queue.processNextBatch();

  const remaining = await prisma.email_notifications.findMany({
    orderBy: { created_at: 'desc' },
    take: 6
  });
  console.log('Queue status:');
  remaining.forEach(r => {
    console.log(`[${r.status}] ${r.notification_type} -> ${r.recipient_email} (Attempts: ${r.attempts}, Error: ${r.last_error})`);
  });
}

flush().catch(console.error).finally(() => prisma.$disconnect());

