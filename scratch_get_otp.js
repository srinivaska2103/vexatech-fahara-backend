require('dotenv').config();
const prisma = require('./src/config/prisma');

async function main() {
  const records = await prisma.otp_verifications.findMany({
    where: { email: 'vexatech.connect@gmail.com' },
    orderBy: { created_at: 'desc' },
    take: 5
  });
  console.log('RECENT OTP RECORDS:');
  console.log(records);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
