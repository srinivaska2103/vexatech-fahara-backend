require('dotenv').config();
const path = require('path');
const prisma = require(path.join(__dirname, '../src/config/prisma'));

async function removeAllUsers() {
  try {
    console.log('Fetching user count...');
    const count = await prisma.users.count();
    console.log(`Found ${count} users in the database.`);

    console.log('Deleting dependent records...');
    if (prisma.reviews) await prisma.reviews.deleteMany({}).catch((e) => console.log('Reviews clean warning:', e.message));
    if (prisma.payments) await prisma.payments.deleteMany({}).catch((e) => console.log('Payments clean warning:', e.message));
    if (prisma.notifications) await prisma.notifications.deleteMany({}).catch((e) => console.log('Notifications clean warning:', e.message));
    if (prisma.bookings) await prisma.bookings.deleteMany({}).catch((e) => console.log('Bookings clean warning:', e.message));
    if (prisma.cafe_packages) await prisma.cafe_packages.deleteMany({}).catch((e) => console.log('Packages clean warning:', e.message));
    if (prisma.cafes) await prisma.cafes.deleteMany({}).catch((e) => console.log('Cafes clean warning:', e.message));
    if (prisma.event_services) await prisma.event_services.deleteMany({}).catch((e) => console.log('Event services clean warning:', e.message));
    if (prisma.event_management_profiles) await prisma.event_management_profiles.deleteMany({}).catch((e) => console.log('Event profiles clean warning:', e.message));
    if (prisma.otps) await prisma.otps.deleteMany({}).catch((e) => console.log('OTPs clean warning:', e.message));

    console.log('Deleting all users...');
    const result = await prisma.users.deleteMany({});
    console.log(`Successfully deleted ${result.count} users from the database.`);
  } catch (error) {
    console.error('Error deleting users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeAllUsers();
