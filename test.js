require('dotenv').config();
const prisma = require('./src/config/prisma');
async function main() {
  const users = await prisma.users.findMany({ include: { roles: true } });
  console.log('Users:', users.length);
  const events = await prisma.event_services.findMany();
  console.log('Event Services:', events.length);
  const bookings = await prisma.bookings.findMany();
  console.log('Bookings:', bookings.length);
  
  const eventManager = users.find(u => u.roles?.name === 'EVENT_MANAGER');
  console.log('Found EVENT_MANAGER:', !!eventManager, eventManager?.id);
  
  if (eventManager) {
    const ownerId = eventManager.id;
    let whereClause = {};
    const eventServices = await prisma.event_services.findMany({
      where: { user_id: ownerId },
      select: { id: true }
    });
    console.log('Event Services for manager:', eventServices.length);
    const eventServiceIds = eventServices.map(es => es.id);
    whereClause = {
      event_service_id: { in: eventServiceIds }
    };
    
    const mgrBookings = await prisma.bookings.findMany({ where: whereClause });
    console.log('Bookings for EVENT_MANAGER:', mgrBookings.length);
    
    // Let's check if there are any bookings that have event_service_id != null
    const anyEventBookings = bookings.filter(b => b.event_service_id != null);
    console.log('Bookings with event_service_id in DB:', anyEventBookings.length);
    if (anyEventBookings.length > 0) {
      console.log('First event booking event_service_id:', anyEventBookings[0].event_service_id);
    }
  }
}
main().finally(() => prisma.$disconnect());
