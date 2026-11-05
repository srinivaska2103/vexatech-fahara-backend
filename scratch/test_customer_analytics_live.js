const customerService = require('../src/services/customerService');
const analyticsService = require('../src/services/analyticsService');
const prisma = require('../src/config/prisma');

async function testQueries() {
  const cafe = await prisma.cafes.findFirst({ select: { id: true, owner_id: true } });
  if (!cafe) {
    console.log('No cafes in DB to test against');
    return;
  }
  console.log('Testing with cafeId:', cafe.id, 'ownerId:', cafe.owner_id);

  const customers = await customerService.getCustomersByOwner(cafe.owner_id, 'RESTAURANT_OWNER');
  console.log('Customers count:', customers.length);
  if (customers.length > 0) {
    console.log('Sample customer:', {
      name: customers[0].name,
      phone: customers[0].phone,
      source: customers[0].customer_source,
      total_food_orders: customers[0].total_food_orders,
      total_bookings: customers[0].total_bookings,
      total_spend: customers[0].total_spend
    });
  }

  const analytics = await analyticsService.getCafeAnalytics(cafe.owner_id, cafe.id, '7days', null, null, 'RESTAURANT_OWNER');
  console.log('Analytics KPI:');
  console.log(analytics.kpi);
  console.log('Timeline length:', analytics.timeline.length);
}

testQueries()
  .then(() => prisma.$disconnect())
  .catch(err => {
    console.error(err);
    prisma.$disconnect();
  });

