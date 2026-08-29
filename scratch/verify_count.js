require('dotenv').config();
const path = require('path');
const prisma = require(path.join(__dirname, '../src/config/prisma'));

async function verify() {
  const count = await prisma.users.count();
  console.log(`VERIFICATION RESULT: User count in database is now ${count}`);
  await prisma.$disconnect();
}

verify();
