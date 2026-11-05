require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require(require('path').join(__dirname, '../src/config/prisma'));

async function main() {
  const columns = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'notifications'
    ORDER BY ordinal_position;
  `);
  console.log("NOTIFICATIONS COLUMNS:", columns);
}

main().catch(console.error).finally(() => prisma.$disconnect());

