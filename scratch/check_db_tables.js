const path = require('path');
const prisma = require('../src/config/prisma');

async function test() {
  try {
    const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
    console.log('TABLES IN DB:', tables.map(t => t.table_name));
    const hasEmailNotifs = tables.some(t => t.table_name === 'email_notifications');
    console.log('Does email_notifications table exist?:', hasEmailNotifs);
  } catch (err) {
    console.error('Database connection error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
