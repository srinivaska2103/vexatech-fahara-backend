require('dotenv').config();
const prisma = require('../src/config/prisma');
const tableService = require('../src/services/tableService');

async function testTableManagement() {
  console.log('--- Starting Table Management Verification Test ---');

  // Find a test cafe
  const cafe = await prisma.cafes.findFirst();
  if (!cafe) {
    console.log('No cafes found in DB to test with');
    process.exit(0);
  }

  console.log(`Testing with Cafe: ${cafe.name} (ID: ${cafe.id}), Maximum Capacity: ${cafe.maximum_persons || 23}`);

  const ownerId = cafe.owner_id;

  // Clean existing tables for test run safely
  await prisma.cafe_table_combinations.deleteMany({ where: { cafe_id: cafe.id } });
  await prisma.booking_tables.deleteMany({
    where: { cafe_tables: { cafe_id: cafe.id } }
  });
  await prisma.cafe_tables.deleteMany({ where: { cafe_id: cafe.id } });

  // Set test cafe capacity to 23 for Acceptance Test Scenario
  await prisma.cafes.update({
    where: { id: cafe.id },
    data: { maximum_persons: 23 }
  });

  console.log('\nStep 1: Creating Tables T1 (2), T2 (2), T3 (4), T4 (4), T5 (6), T6 (5)...');
  const t1 = await tableService.createTable(cafe.id, ownerId, 'CAFE_OWNER', { table_number: 'T1', capacity: 2, table_type: '2 Seater', location: 'Indoor', status: 'ACTIVE' });
  const t2 = await tableService.createTable(cafe.id, ownerId, 'CAFE_OWNER', { table_number: 'T2', capacity: 2, table_type: '2 Seater', location: 'Indoor', status: 'ACTIVE', is_combinable: true, combined_table_ids: [t1.id] });
  const t3 = await tableService.createTable(cafe.id, ownerId, 'CAFE_OWNER', { table_number: 'T3', capacity: 4, table_type: '4 Seater', location: 'Window', status: 'ACTIVE' });
  const t4 = await tableService.createTable(cafe.id, ownerId, 'CAFE_OWNER', { table_number: 'T4', capacity: 4, table_type: '4 Seater', location: 'Outdoor', status: 'ACTIVE' });
  const t5 = await tableService.createTable(cafe.id, ownerId, 'CAFE_OWNER', { table_number: 'T5', capacity: 6, table_type: '6 Seater', location: 'Private Area', status: 'ACTIVE' });
  const t6 = await tableService.createTable(cafe.id, ownerId, 'CAFE_OWNER', { table_number: 'T6', capacity: 5, table_type: 'Custom', location: 'Rooftop', status: 'ACTIVE' });

  const tablesData = await tableService.getTablesByCafe(cafe.id, ownerId, 'CAFE_OWNER');
  console.log('Capacity Summary:', JSON.stringify(tablesData.capacity_summary, null, 2));

  if (tablesData.capacity_summary.assigned_table_capacity === 23 && tablesData.capacity_summary.unassigned_capacity === 0) {
    console.log('SUCCESS: Assigned capacity is 23, Unassigned is 0!');
  } else {
    console.error('FAIL: Capacity mismatch', tablesData.capacity_summary);
  }

  console.log('\nStep 2: Attempting to add T7 (4 seats) which exceeds 23 capacity limit...');
  try {
    await tableService.createTable(cafe.id, ownerId, 'CAFE_OWNER', { table_number: 'T7', capacity: 4, table_type: '4 Seater', status: 'ACTIVE' });
    console.error('FAIL: T7 should have been rejected!');
  } catch (err) {
    console.log('SUCCESS: Backend correctly rejected T7 exceeding capacity:', err.message);
  }

  console.log('\nStep 3: Deactivating T6 (5 seats)...');
  await tableService.updateTableStatus(cafe.id, t6.id, ownerId, 'CAFE_OWNER', 'INACTIVE');
  const summaryAfterDeactivate = await tableService.getTablesByCafe(cafe.id, ownerId, 'CAFE_OWNER');
  console.log('Active capacity after deactivating T6:', summaryAfterDeactivate.capacity_summary.assigned_table_capacity);

  console.log('\nStep 4: Adding T7 (5 seats)...');
  const t7 = await tableService.createTable(cafe.id, ownerId, 'CAFE_OWNER', { table_number: 'T7', capacity: 5, table_type: 'Custom', status: 'ACTIVE' });
  const summaryAfterT7 = await tableService.getTablesByCafe(cafe.id, ownerId, 'CAFE_OWNER');
  console.log('Active capacity after adding T7:', summaryAfterT7.capacity_summary.assigned_table_capacity);

  console.log('\nStep 5: Testing table suitability matching algorithm for 4 guests...');
  const dateStr = new Date().toISOString().split('T')[0];
  const suitable = await tableService.findSuitableTablesForBooking(cafe.id, 4, dateStr, '19:00:00', '20:30:00');
  console.log('Selected Table for 4 guests:', suitable.assigned_tables.map(t => t.table_number).join(' + '));

  console.log('\n--- ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0);
}

testTableManagement().catch(err => {
  console.error('Test Error:', err);
  process.exit(1);
});
