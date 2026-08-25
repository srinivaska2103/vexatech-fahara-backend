require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const res = await prisma.$queryRaw`SELECT pg_get_constraintdef(c.oid) AS constraint_def FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'event_management_profiles' AND c.conname = 'event_management_profiles_verification_status_check'`;
  console.log(res);
}

main().finally(() => prisma.$disconnect());
