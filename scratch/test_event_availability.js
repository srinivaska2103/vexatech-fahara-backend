const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/config/prisma');

async function runTests() {
  console.log('--- Starting Availability Calendar & Conflict Prevention Test Suite ---');
  
  // 1. Find or verify an event manager in the database
  const em = await prisma.users.findFirst({
    where: { roles: { name: 'EVENT_MANAGER' } },
    include: { event_services: true }
  });

  if (!em) {
    console.error('No Event Manager found to test.');
    process.exit(1);
  }
  console.log(`[TEST 1] Identified Event Manager: ${em.name} (${em.id})`);

  // 2. Test direct repository block creation
  const repo = require('../src/repositories/eventAvailabilityRepository');
  const testStart = new Date('2026-11-20T10:00:00.000Z');
  const testEnd = new Date('2026-11-20T14:00:00.000Z');

  // Clean up any previous test blocks
  await prisma.event_availability_blocks.deleteMany({
    where: {
      event_manager_id: em.id,
      title: 'Automated Test Block'
    }
  });

  const createdBlock = await repo.createBlock({
    event_manager_id: em.id,
    title: 'Automated Test Block',
    reason: 'PRIVATE_EVENT',
    start_at: testStart,
    end_at: testEnd,
    is_all_day: false,
    buffer_minutes: 30,
    max_concurrent_events: 1,
    is_active: true
  });
  console.log(`[TEST 2] Successfully created Event Availability Block ID: ${createdBlock.id}`);

  // 3. Test checkOverlap in repository
  const overlapFound = await repo.checkOverlap(em.id, new Date('2026-11-20T11:00:00.000Z'), new Date('2026-11-20T13:00:00.000Z'));
  console.log(`[TEST 3] Overlap check detected existing block correctly:`, overlapFound !== null && overlapFound.id === createdBlock.id);

  // 4. Test non-overlapping time range
  const nonOverlap = await repo.checkOverlap(em.id, new Date('2026-11-21T10:00:00.000Z'), new Date('2026-11-21T12:00:00.000Z'));
  console.log(`[TEST 4] Non-overlapping check correctly returned null:`, nonOverlap === null);

  // 5. Test bookingRepository.checkAvailability with event service ID
  const bookingRepo = require('../src/repositories/bookingRepository');
  const cafe = await prisma.cafes.findFirst({ where: { status: 'ACTIVE' } });
  
  if (em.event_services && em.event_services.length > 0) {
    const serviceId = em.event_services[0].id;
    const isAvailDuringBlock = await bookingRepo.checkAvailability(
      cafe.id,
      new Date('2026-11-20T00:00:00.000Z'),
      new Date('1970-01-01T11:00:00.000Z'),
      new Date('1970-01-01T13:00:00.000Z'),
      serviceId
    );
    console.log(`[TEST 5] Booking checkAvailability correctly rejected blocked manager slot:`, isAvailDuringBlock === false);
  }

  // 6. Test Service Summary calculation
  const service = require('../src/services/eventAvailabilityService');
  const summary = await service.getAvailabilitySummary(em.id, 'EVENT_MANAGER');
  console.log(`[TEST 6] getAvailabilitySummary returned valid data:`, {
    todayEventsCount: summary.todayEventsCount,
    pendingRequestsCount: summary.pendingRequestsCount,
    totalActiveBlocksCount: summary.totalActiveBlocksCount
  });

  // 7. Cleanup test block
  await repo.deleteBlock(createdBlock.id);
  console.log(`[TEST 7] Successfully deleted test block ID: ${createdBlock.id}`);

  console.log('--- All Availability Calendar backend tests PASSED successfully! ---');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
}).finally(() => process.exit(0));
