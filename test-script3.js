const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/fahara' });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function test() {
  const businessHours = {
    monday: { open: '09:00', close: '17:00', closed: false }
  };
  
  let normalizedHours = Object.entries(businessHours).map(([day, data]) => ({
    dayOfWeek: day.toUpperCase(),
    openTime: data.open,
    closeTime: data.close,
    isClosed: data.closed
  }));

  const data = normalizedHours.map(hour => {
    let open_time = null;
    let close_time = null;
    const openTimeVal = hour.openTime;
    const closeTimeVal = hour.closeTime;

    if (openTimeVal) open_time = new Date(openTimeVal.includes('T') ? openTimeVal : `1970-01-01T${openTimeVal}Z`);
    if (closeTimeVal) close_time = new Date(closeTimeVal.includes('T') ? closeTimeVal : `1970-01-01T${closeTimeVal}Z`);
    
    return {
      user_id: '97bf90b9-3a57-40f0-92ca-13f670eed2d8', // The user ID from the previous screenshot
      day_of_week: hour.dayOfWeek,
      open_time,
      close_time,
      is_closed: hour.isClosed
    };
  });

  try {
    console.log('Trying to insert data:', data);
    await prisma.event_business_hours.deleteMany({ where: { user_id: '97bf90b9-3a57-40f0-92ca-13f670eed2d8' } });
    await prisma.event_business_hours.createMany({ data });
    console.log('Success!');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
