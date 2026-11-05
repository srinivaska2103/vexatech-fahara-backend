const path = require('path');
const prisma = require(path.join(__dirname, '../src/config/prisma.js'));

async function check() {
  try {
    const records = await prisma.email_notifications.findMany({
      orderBy: { created_at: 'desc' },
      take: 10
    });
    console.log('Total email_notifications records:', records.length);
    records.forEach(r => {
      console.log({
        id: r.id,
        event_key: r.event_key,
        recipient: r.recipient_email,
        status: r.status,
        attempts: r.attempts,
        error: r.last_error,
        created_at: r.created_at,
        sent_at: r.sent_at
      });
    });
  } catch (err) {
    console.error('Error querying email_notifications:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
