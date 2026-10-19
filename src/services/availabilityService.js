const availabilityRepository = require('../repositories/availabilityRepository');
const cafeRepository = require('../repositories/cafeRepository');
const prisma = require('../config/prisma');

/**
 * Service to manage cafe vendor availability calendar & blocks
 */

/**
 * Verify if logged in user owns the cafe or is admin
 */
const verifyCafeOwnership = async (cafeId, userId, userRole) => {
  const cafe = await cafeRepository.findCafeById(cafeId);
  if (!cafe) {
    const err = new Error('Cafe not found');
    err.statusCode = 404;
    throw err;
  }

  if (userRole === 'ADMIN') {
    return cafe;
  }

  if (String(cafe.owner_id) !== String(userId)) {
    const err = new Error('Unauthorized: You do not have permission to manage availability for this cafe');
    err.statusCode = 403;
    throw err;
  }

  return cafe;
};

/**
 * Get availability blocks and bookings for a cafe within a date range
 */
const getAvailability = async (cafeId, fromDate, toDate, user) => {
  // Any customer or vendor can query availability, but vendors see full details
  const cafe = await cafeRepository.findCafeById(cafeId);
  if (!cafe) {
    const err = new Error('Cafe not found');
    err.statusCode = 404;
    throw err;
  }

  const isOwnerOrAdmin = user && (user.role === 'ADMIN' || String(cafe.owner_id) === String(user.id));

  const from = fromDate ? new Date(fromDate) : new Date();
  const to = toDate ? new Date(toDate) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days ahead

  const blocks = await availabilityRepository.getBlocksByCafeAndRange(cafeId, from, to);

  // If customer querying, scrub internal notes and private reasons unless needed
  const sanitizedBlocks = blocks.map(b => {
    if (isOwnerOrAdmin) {
      return b;
    }
    return {
      id: b.id,
      cafe_id: b.cafe_id,
      title: b.title || (b.reason === 'PRIVATE_EVENT' ? 'Private Event / Reserved' : (b.is_all_day ? 'Closed for the Day' : 'Unavailable Slot')),
      reason: b.reason,
      start_at: b.start_at,
      end_at: b.end_at,
      is_all_day: b.is_all_day,
      is_active: b.is_active
    };
  });

  // Also fetch bookings if vendor or admin
  let bookings = [];
  if (isOwnerOrAdmin) {
    const startDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const endDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59);

    bookings = await prisma.bookings.findMany({
      where: {
        cafe_id: cafeId,
        booking_status: { in: ['PENDING', 'CONFIRMED', 'ACCEPTED'] },
        booking_date: {
          gte: startDay,
          lte: endDay
        }
      },
      include: {
        users: { select: { id: true, name: true, phone: true } },
        booking_tables: { include: { cafe_tables: true } }
      },
      orderBy: [
        { booking_date: 'asc' },
        { start_time: 'asc' }
      ]
    });
  }

  // Include cafe business hours
  const businessHours = cafe.cafe_business_hours || [];

  return {
    cafe: {
      id: cafe.id,
      name: cafe.name,
      owner_id: cafe.owner_id
    },
    businessHours,
    blocks: sanitizedBlocks,
    bookings: bookings.map(b => ({
      id: b.id,
      booking_number: b.booking_number,
      booking_date: b.booking_date,
      start_time: b.start_time,
      end_time: b.end_time,
      hours: b.hours,
      total_persons: b.total_persons,
      booking_status: b.booking_status,
      customer_name: b.users?.name,
      tables: b.booking_tables?.map(bt => bt.cafe_tables?.table_number).filter(Boolean)
    }))
  };
};

/**
 * Get summary of today's availability, blocked slots, and upcoming blocks
 */
const getAvailabilitySummary = async (cafeId, user) => {
  await verifyCafeOwnership(cafeId, user.id, user.role);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Today's bookings
  const todayBookings = await prisma.bookings.findMany({
    where: {
      cafe_id: cafeId,
      booking_status: { in: ['PENDING', 'CONFIRMED', 'ACCEPTED'] },
      booking_date: {
        gte: startOfToday,
        lte: endOfToday
      }
    },
    include: {
      users: { select: { name: true, phone: true } }
    },
    orderBy: { start_time: 'asc' }
  });

  // Today's active blocks
  const todayBlocks = await prisma.cafe_availability_blocks.findMany({
    where: {
      cafe_id: cafeId,
      is_active: true,
      start_at: { lte: endOfToday },
      end_at: { gte: startOfToday }
    },
    orderBy: { start_at: 'asc' }
  });

  // Upcoming blocks (next 30 days)
  const upcomingBlocks = await prisma.cafe_availability_blocks.findMany({
    where: {
      cafe_id: cafeId,
      is_active: true,
      start_at: { gt: endOfToday, lte: next30Days }
    },
    orderBy: { start_at: 'asc' },
    take: 10
  });

  // Total active blocks (currently active or upcoming)
  const totalActiveBlocksCount = await prisma.cafe_availability_blocks.count({
    where: {
      cafe_id: cafeId,
      is_active: true,
      end_at: { gte: startOfToday }
    }
  });

  return {
    todayBookingsCount: todayBookings.length,
    todayBookings,
    todayBlocksCount: todayBlocks.length,
    todayBlocks,
    upcomingBlocksCount: upcomingBlocks.length,
    upcomingBlocks,
    totalActiveBlocksCount
  };
};

/**
 * Create a new availability block
 */
const createAvailabilityBlock = async (cafeId, blockData, user) => {
  await verifyCafeOwnership(cafeId, user.id, user.role);

  const { title, reason, startAt, endAt, isAllDay, notes, recurrence, allowOverlap = false } = blockData;

  const start = new Date(startAt);
  const end = new Date(endAt);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    const err = new Error('Invalid start or end date');
    err.statusCode = 400;
    throw err;
  }

  if (end <= start) {
    const err = new Error('End time must be after start time');
    err.statusCode = 400;
    throw err;
  }

  // Prevent overlapping with existing blocks unless explicitly allowed
  const overlappingBlock = await availabilityRepository.checkOverlap(cafeId, start, end);
  if (overlappingBlock && !allowOverlap) {
    const err = new Error(`Cannot add block: this slot overlaps with an existing block "${overlappingBlock.title}"`);
    err.statusCode = 409;
    err.overlappingBlock = overlappingBlock;
    throw err;
  }

  // Check for conflicts with existing customer bookings
  const conflictingBookings = await availabilityRepository.findConflictingBookings(cafeId, start, end);

  // Create block
  const created = await availabilityRepository.createBlock({
    cafe_id: cafeId,
    title: title.trim(),
    reason: (reason || 'OTHER').toUpperCase(),
    start_at: start,
    end_at: end,
    is_all_day: Boolean(isAllDay),
    notes: notes || null,
    recurrence: recurrence || 'NONE',
    is_active: true
  });

  return {
    block: created,
    hasConflictingBookings: conflictingBookings.length > 0,
    conflictingBookingsCount: conflictingBookings.length,
    conflictingBookings: conflictingBookings.map(b => ({
      id: b.id,
      booking_number: b.booking_number,
      customer_name: b.users?.name,
      customer_phone: b.users?.phone,
      booking_date: b.booking_date,
      start_time: b.start_time,
      end_time: b.end_time,
      total_persons: b.total_persons
    }))
  };
};

/**
 * Update an existing availability block
 */
const updateAvailabilityBlock = async (cafeId, blockId, updateData, user) => {
  await verifyCafeOwnership(cafeId, user.id, user.role);

  const existing = await availabilityRepository.getBlockById(blockId);
  if (!existing || String(existing.cafe_id) !== String(cafeId)) {
    const err = new Error('Availability block not found for this cafe');
    err.statusCode = 404;
    throw err;
  }

  const start = updateData.startAt ? new Date(updateData.startAt) : existing.start_at;
  const end = updateData.endAt ? new Date(updateData.endAt) : existing.end_at;

  if (end <= start) {
    const err = new Error('End time must be after start time');
    err.statusCode = 400;
    throw err;
  }

  // Check overlap excluding this block unless explicitly allowed
  const overlappingBlock = await availabilityRepository.checkOverlap(cafeId, start, end, blockId);
  if (overlappingBlock && !updateData.allowOverlap) {
    const err = new Error(`Cannot update block: new interval overlaps with existing block "${overlappingBlock.title}"`);
    err.statusCode = 409;
    err.overlappingBlock = overlappingBlock;
    throw err;
  }

  const conflictingBookings = await availabilityRepository.findConflictingBookings(cafeId, start, end);

  const updated = await availabilityRepository.updateBlock(blockId, {
    title: updateData.title !== undefined ? updateData.title.trim() : existing.title,
    reason: updateData.reason !== undefined ? updateData.reason.toUpperCase() : existing.reason,
    start_at: start,
    end_at: end,
    is_all_day: updateData.isAllDay !== undefined ? Boolean(updateData.isAllDay) : existing.is_all_day,
    notes: updateData.notes !== undefined ? updateData.notes : existing.notes,
    recurrence: updateData.recurrence !== undefined ? updateData.recurrence : existing.recurrence,
    is_active: updateData.isActive !== undefined ? Boolean(updateData.isActive) : existing.is_active
  });

  return {
    block: updated,
    hasConflictingBookings: conflictingBookings.length > 0,
    conflictingBookingsCount: conflictingBookings.length,
    conflictingBookings
  };
};

/**
 * Delete an availability block
 */
const deleteAvailabilityBlock = async (cafeId, blockId, user) => {
  await verifyCafeOwnership(cafeId, user.id, user.role);

  const existing = await availabilityRepository.getBlockById(blockId);
  if (!existing || String(existing.cafe_id) !== String(cafeId)) {
    const err = new Error('Availability block not found for this cafe');
    err.statusCode = 404;
    throw err;
  }

  await availabilityRepository.deleteBlock(blockId);

  return { message: 'Availability block successfully deleted' };
};

module.exports = {
  verifyCafeOwnership,
  getAvailability,
  getAvailabilitySummary,
  createAvailabilityBlock,
  updateAvailabilityBlock,
  deleteAvailabilityBlock
};
