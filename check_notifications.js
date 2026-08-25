const prisma = require('./src/config/prisma');

async function main() {
  const n = await prisma.notifications.findMany({
    where: { user_id: '97bf90b9-3a57-40f0-92ca-13f670eed2d8' }
  });
  console.log("Notifications:", n);
  
  const bookings = await prisma.bookings.findMany({
    where: { event_services: { user_id: '97bf90b9-3a57-40f0-92ca-13f670eed2d8' } }
  });
  console.log("Bookings:", bookings.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
