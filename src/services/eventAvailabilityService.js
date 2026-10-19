const eventAvailabilityRepository = require('../repositories/eventAvailabilityRepository');
const cafeRepository = require('../repositories/cafeRepository');
const prisma = require('../config/prisma');

/**
 * Service to manage Event Manager Availability Calendar & Blocks
 */

/**
 * Verify event manager identity and return user profile
 */
const verifyEventManager = async (userIdOrUser, userRole) => {
  // If the user object is already provided from req.user
  if (typeof userIdOrUser === 'object' && userIdOrUser !== null) {
    const roleName = userIdOrUser.roles?.name || userIdOrUser.role || userRole;
    if (roleName === 'ADMIN' || roleName === 'EVENT_MANAGER' || userRole === 'EVENT_MANAGER') {
      return userIdOrUser;
    }
  }

  const userId = typeof userIdOrUser === 'string' ? userIdOrUser : userIdOrUser?.id;

  if (userRole === 'ADMIN') {
    return { id: userId, role: 'ADMIN' };
  }

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role_id: true,
      roles: { select: { name: true } },
      event_management_profiles: { select: { id: true, company_name: true, is_active: true } }
    }
  });

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const roleName = user.roles?.name || userRole;
  if (roleName !== 'EVENT_MANAGER' && userRole !== 'EVENT_MANAGER') {
    const err = new Error('Unauthorized: Only event managers can perform this operation');
    err.statusCode = 403;
    throw err;
  }

  return user;
};

/**
 * Get availability blocks, bookings, and venues for an Event Manager within a date range
 */
const getAvailability = async (eventManagerId, fromDate, toDate, requestingUser) => {
  // Validate manager exists
  const manager = await prisma.users.findUnique({
    where: { id: eventManagerId },
    include: {
      event_management_profiles: true,
      event_services: {
        where: { status: { not: 'DELETED' } },
        select: {
          id: true,
          service_name: true,
          category: true,
          price: true,
          duration_hours: true,
          duration_unit: true,
          status: true
        }
      },
      event_business_hours: true
    }
  });

  if (!manager) {
    const err = new Error('Event manager not found');
    err.statusCode = 404;
    throw err;
  }

  const reqRole = requestingUser?.roles?.name || requestingUser?.role;
  const isOwnerOrAdmin = requestingUser && (reqRole === 'ADMIN' || String(eventManagerId) === String(requestingUser.id));

  const from = fromDate ? new Date(fromDate) : new Date();
  const to = toDate ? new Date(toDate) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  const blocks = await eventAvailabilityRepository.getBlocksByManagerAndRange(eventManagerId, from, to);

  // If customer querying, scrub internal notes and private details
  const sanitizedBlocks = blocks.map(b => {
    if (isOwnerOrAdmin) {
      return b;
    }
    return {
      id: b.id,
      event_manager_id: b.event_manager_id,
      service_id: b.service_id,
      venue_id: b.venue_id,
      title: b.title || (b.reason === 'PRIVATE_EVENT' ? 'Private Event Reserved' : (b.is_all_day ? 'Unavailable for the Day' : 'Blocked Slot')),
      reason: b.reason,
      start_at: b.start_at,
      end_at: b.end_at,
      is_all_day: b.is_all_day,
      buffer_minutes: b.buffer_minutes,
      max_concurrent_events: b.max_concurrent_events,
      is_active: b.is_active
    };
  });

  // Fetch bookings if manager or admin
  let bookings = [];
  if (isOwnerOrAdmin) {
    const startDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const endDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59);

    const serviceIds = manager.event_services.map(s => s.id);
    if (serviceIds.length > 0) {
      bookings = await prisma.bookings.findMany({
        where: {
          event_service_id: { in: serviceIds },
          booking_status: { in: ['PENDING', 'CONFIRMED', 'ACCEPTED', 'COMPLETED', 'CANCELLED'] },
          booking_date: {
            gte: startDay,
            lte: endDay
          }
        },
        include: {
          users: { select: { id: true, name: true, phone: true, email: true } },
          cafes: { select: { id: true, name: true, city: true, address: true } },
          event_services: { select: { id: true, service_name: true, category: true, duration_hours: true } }
        },
        orderBy: [
          { booking_date: 'asc' },
          { start_time: 'asc' }
        ]
      });
    }
  }

  // Get coordinated venues (cafes where this event manager has bookings or partner cafes)
  let venues = [];
  if (isOwnerOrAdmin) {
    venues = await prisma.cafes.findMany({
      where: {
        status: 'ACTIVE'
      },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        provides_event_services: true,
        allow_third_party_decoration: true,
        event_booking: true,
        event_facilities: true
      },
      orderBy: { name: 'asc' },
      take: 50
    });
  }

  return {
    manager: {
      id: manager.id,
      name: manager.name,
      company_name: manager.event_management_profiles?.company_name || manager.business_name || manager.name,
      is_active: manager.event_management_profiles?.is_active ?? true
    },
    businessHours: manager.event_business_hours || [],
    services: manager.event_services || [],
    venues,
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
      customer_phone: b.users?.phone,
      customer_email: b.users?.email,
      venue_name: b.cafes?.name,
      venue_id: b.cafe_id,
      service_name: b.event_services?.service_name,
      service_id: b.event_service_id,
      special_request: b.event_special_request || b.special_request
    }))
  };
};

/**
 * Get summary of today's events, pending requests, blocked slots, and upcoming assignments
 */
const getAvailabilitySummary = async (userId, userRole) => {
  await verifyEventManager(userId, userRole);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Get services for this event manager
  const services = await prisma.event_services.findMany({
    where: { user_id: userId, status: { not: 'DELETED' } },
    select: { id: true }
  });
  const serviceIds = services.map(s => s.id);

  // Today's bookings
  const todayBookings = serviceIds.length > 0 ? await prisma.bookings.findMany({
    where: {
      event_service_id: { in: serviceIds },
      booking_status: { in: ['PENDING', 'CONFIRMED', 'ACCEPTED'] },
      booking_date: {
        gte: startOfToday,
        lte: endOfToday
      }
    },
    include: {
      users: { select: { name: true, phone: true } },
      cafes: { select: { name: true } },
      event_services: { select: { service_name: true } }
    },
    orderBy: { start_time: 'asc' }
  }) : [];

  // Pending booking requests
  const pendingRequests = serviceIds.length > 0 ? await prisma.bookings.findMany({
    where: {
      event_service_id: { in: serviceIds },
      booking_status: 'PENDING'
    },
    include: {
      users: { select: { name: true, phone: true } },
      cafes: { select: { name: true } },
      event_services: { select: { service_name: true } }
    },
    orderBy: { booking_date: 'asc' }
  }) : [];

  // Today's active blocks
  const todayBlocks = await prisma.event_availability_blocks.findMany({
    where: {
      event_manager_id: userId,
      is_active: true,
      start_at: { lte: endOfToday },
      end_at: { gte: startOfToday }
    },
    include: {
      event_services: { select: { service_name: true } },
      cafes: { select: { name: true } }
    },
    orderBy: { start_at: 'asc' }
  });

  // Upcoming blocks (next 30 days)
  const upcomingBlocks = await prisma.event_availability_blocks.findMany({
    where: {
      event_manager_id: userId,
      is_active: true,
      start_at: { gt: endOfToday, lte: next30Days }
    },
    include: {
      event_services: { select: { service_name: true } },
      cafes: { select: { name: true } }
    },
    orderBy: { start_at: 'asc' },
    take: 15
  });

  // Upcoming confirmed events / assignments
  const upcomingEvents = serviceIds.length > 0 ? await prisma.bookings.findMany({
    where: {
      event_service_id: { in: serviceIds },
      booking_status: { in: ['CONFIRMED', 'ACCEPTED'] },
      booking_date: { gt: endOfToday, lte: next30Days }
    },
    include: {
      users: { select: { name: true, phone: true } },
      cafes: { select: { name: true } },
      event_services: { select: { service_name: true } }
    },
    orderBy: { booking_date: 'asc' },
    take: 15
  }) : [];

  const totalActiveBlocksCount = await prisma.event_availability_blocks.count({
    where: {
      event_manager_id: userId,
      is_active: true,
      end_at: { gte: startOfToday }
    }
  });

  return {
    todayEventsCount: todayBookings.length,
    todayBookings,
    pendingRequestsCount: pendingRequests.length,
    pendingRequests,
    todayBlocksCount: todayBlocks.length,
    todayBlocks,
    upcomingBlocksCount: upcomingBlocks.length,
    upcomingBlocks,
    upcomingEventsCount: upcomingEvents.length,
    upcomingEvents,
    totalActiveBlocksCount
  };
};

/**
 * Create a new availability block for the authenticated event manager
 */
const createAvailabilityBlock = async (userIdOrUser, blockData, userRole) => {
  const verifiedUser = await verifyEventManager(userIdOrUser, userRole);
  const userId = verifiedUser.id;

  const {
    title,
    reason,
    startAt,
    endAt,
    isAllDay = false,
    serviceId = null,
    venueId = null,
    notes = null,
    recurrence = 'NONE',
    bufferMinutes = 0,
    maxConcurrentEvents = 1,
    allowOverlap = false
  } = blockData;

  const start = new Date(startAt);
  const end = new Date(endAt);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    const err = new Error('Invalid start or end date format');
    err.statusCode = 400;
    throw err;
  }

  if (end <= start) {
    const err = new Error('End time must be after start time');
    err.statusCode = 400;
    throw err;
  }

  // Validate service ownership if serviceId provided
  if (serviceId) {
    const service = await prisma.event_services.findFirst({
      where: { id: serviceId, user_id: userId }
    });
    if (!service) {
      const err = new Error('Event service not found or does not belong to you');
      err.statusCode = 400;
      throw err;
    }
  }

  // Validate venue existence if venueId provided
  if (venueId) {
    const cafe = await cafeRepository.findCafeById(venueId);
    if (!cafe) {
      const err = new Error('Selected venue or cafe not found');
      err.statusCode = 400;
      throw err;
    }
  }

  // Run overlap check and conflicting bookings search concurrently to minimize network round-trips
  const [overlappingBlock, conflictingBookings] = await Promise.all([
    eventAvailabilityRepository.checkOverlap(userId, start, end, null, serviceId),
    eventAvailabilityRepository.findConflictingBookings(userId, start, end, serviceId)
  ]);

  if (overlappingBlock && !allowOverlap) {
    const err = new Error(`Cannot add block: this slot overlaps with an existing block "${overlappingBlock.title}"`);
    err.statusCode = 409;
    err.overlappingBlock = overlappingBlock;
    throw err;
  }

  const created = await eventAvailabilityRepository.createBlock({
    event_manager_id: userId,
    service_id: serviceId || null,
    venue_id: venueId || null,
    title: title.trim(),
    reason: (reason || 'UNAVAILABLE').toUpperCase(),
    start_at: start,
    end_at: end,
    is_all_day: Boolean(isAllDay),
    notes: notes || null,
    recurrence: recurrence || 'NONE',
    buffer_minutes: Math.max(0, parseInt(bufferMinutes, 10) || 0),
    max_concurrent_events: Math.max(1, parseInt(maxConcurrentEvents, 10) || 1),
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
      venue_name: b.cafes?.name,
      service_name: b.event_services?.service_name,
      total_persons: b.total_persons
    }))
  };
};

/**
 * Update an existing availability block
 */
const updateAvailabilityBlock = async (userId, blockId, updateData, userRole) => {
  await verifyEventManager(userId, userRole);

  const existing = await eventAvailabilityRepository.getBlockById(blockId);
  if (!existing || (userRole !== 'ADMIN' && String(existing.event_manager_id) !== String(userId))) {
    const err = new Error('Availability block not found or access denied');
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

  const serviceId = updateData.serviceId !== undefined ? updateData.serviceId : existing.service_id;
  if (serviceId) {
    const service = await prisma.event_services.findFirst({
      where: { id: serviceId, user_id: existing.event_manager_id }
    });
    if (!service) {
      const err = new Error('Event service not found or does not belong to you');
      err.statusCode = 400;
      throw err;
    }
  }

  const venueId = updateData.venueId !== undefined ? updateData.venueId : existing.venue_id;
  if (venueId) {
    const cafe = await cafeRepository.findCafeById(venueId);
    if (!cafe) {
      const err = new Error('Selected venue or cafe not found');
      err.statusCode = 400;
      throw err;
    }
  }

  // Check overlap excluding this block
  const overlappingBlock = await eventAvailabilityRepository.checkOverlap(
    existing.event_manager_id,
    start,
    end,
    blockId,
    serviceId
  );
  if (overlappingBlock && !updateData.allowOverlap) {
    const err = new Error(`Cannot update block: new interval overlaps with existing block "${overlappingBlock.title}"`);
    err.statusCode = 409;
    err.overlappingBlock = overlappingBlock;
    throw err;
  }

  const conflictingBookings = await eventAvailabilityRepository.findConflictingBookings(
    existing.event_manager_id,
    start,
    end,
    serviceId
  );

  const updated = await eventAvailabilityRepository.updateBlock(blockId, {
    title: updateData.title !== undefined ? updateData.title.trim() : existing.title,
    reason: updateData.reason !== undefined ? updateData.reason.toUpperCase() : existing.reason,
    service_id: updateData.serviceId !== undefined ? updateData.serviceId : existing.service_id,
    venue_id: updateData.venueId !== undefined ? updateData.venueId : existing.venue_id,
    start_at: start,
    end_at: end,
    is_all_day: updateData.isAllDay !== undefined ? Boolean(updateData.isAllDay) : existing.is_all_day,
    notes: updateData.notes !== undefined ? updateData.notes : existing.notes,
    recurrence: updateData.recurrence !== undefined ? updateData.recurrence : existing.recurrence,
    buffer_minutes: updateData.bufferMinutes !== undefined ? Math.max(0, parseInt(updateData.bufferMinutes, 10) || 0) : existing.buffer_minutes,
    max_concurrent_events: updateData.maxConcurrentEvents !== undefined ? Math.max(1, parseInt(updateData.maxConcurrentEvents, 10) || 1) : existing.max_concurrent_events,
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
const deleteAvailabilityBlock = async (userId, blockId, userRole) => {
  await verifyEventManager(userId, userRole);

  const existing = await eventAvailabilityRepository.getBlockById(blockId);
  if (!existing || (userRole !== 'ADMIN' && String(existing.event_manager_id) !== String(userId))) {
    const err = new Error('Availability block not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  await eventAvailabilityRepository.deleteBlock(blockId);

  return { message: 'Availability block successfully deleted' };
};

/**
 * Get calendar bookings for the authenticated event manager
 */
const getCalendarBookings = async (userId, fromDate, toDate, userRole) => {
  await verifyEventManager(userId, userRole);

  const from = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = toDate ? new Date(toDate) : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  const startDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59);

  const services = await prisma.event_services.findMany({
    where: { user_id: userId, status: { not: 'DELETED' } },
    select: { id: true }
  });
  const serviceIds = services.map(s => s.id);

  if (serviceIds.length === 0) {
    return [];
  }

  const bookings = await prisma.bookings.findMany({
    where: {
      event_service_id: { in: serviceIds },
      booking_date: {
        gte: startDay,
        lte: endDay
      }
    },
    include: {
      users: { select: { id: true, name: true, phone: true, email: true } },
      cafes: { select: { id: true, name: true, city: true, address: true } },
      event_services: { select: { id: true, service_name: true, category: true, duration_hours: true } }
    },
    orderBy: [
      { booking_date: 'asc' },
      { start_time: 'asc' }
    ]
  });

  return bookings.map(b => ({
    id: b.id,
    booking_number: b.booking_number,
    booking_date: b.booking_date,
    start_time: b.start_time,
    end_time: b.end_time,
    hours: b.hours,
    total_persons: b.total_persons,
    booking_status: b.booking_status,
    payment_status: b.payment_status,
    customer_name: b.users?.name,
    customer_phone: b.users?.phone,
    customer_email: b.users?.email,
    venue_name: b.cafes?.name,
    venue_id: b.cafe_id,
    service_name: b.event_services?.service_name,
    service_id: b.event_service_id,
    special_request: b.event_special_request || b.special_request
  }));
};

module.exports = {
  verifyEventManager,
  getAvailability,
  getAvailabilitySummary,
  createAvailabilityBlock,
  updateAvailabilityBlock,
  deleteAvailabilityBlock,
  getCalendarBookings
};
