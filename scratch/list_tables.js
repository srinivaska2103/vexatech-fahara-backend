require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/config/prisma');

async function main() {
  const tables = await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('Tables:', tables.map(t => t.table_name));
}

main().catch(console.error).finally(() => process.exit());
