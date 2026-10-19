const prisma = require('../config/prisma');

/**
 * Repository for managing event manager availability blocks
 */

const getBlocksByManagerAndRange = async (eventManagerId, fromDate, toDate) => {
  return await prisma.event_availability_blocks.findMany({
    where: {
      event_manager_id: eventManagerId,
      is_active: true,
      start_at: {
        lte: toDate
      },
      end_at: {
        gte: fromDate
      }
    },
    include: {
      event_services: {
        select: {
          id: true,
          service_name: true,
          category: true,
          price: true
        }
      },
      cafes: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true
        }
      }
    },
    orderBy: {
      start_at: 'asc'
    }
  });
};

const getBlockById = async (blockId) => {
  return await prisma.event_availability_blocks.findUnique({
    where: { id: blockId },
    include: {
      users: { select: { id: true, name: true, email: true } },
      event_services: true,
      cafes: true
    }
  });
};

const createBlock = async (data) => {
  return await prisma.event_availability_blocks.create({
    data,
    include: {
      event_services: {
        select: { id: true, service_name: true, category: true }
      },
      cafes: {
        select: { id: true, name: true, city: true }
      }
    }
  });
};

const updateBlock = async (blockId, data) => {
  return await prisma.event_availability_blocks.update({
    where: { id: blockId },
    data: {
      ...data,
      updated_at: new Date()
    },
    include: {
      event_services: {
        select: { id: true, service_name: true, category: true }
      },
      cafes: {
        select: { id: true, name: true, city: true }
      }
    }
  });
};

const deleteBlock = async (blockId) => {
  return await prisma.event_availability_blocks.delete({
    where: { id: blockId }
  });
};

/**
 * Checks if a requested interval overlaps with any active availability block for this manager
 * (Optionally filtered by specific serviceId)
 */
const checkOverlap = async (eventManagerId, startTime, endTime, excludeBlockId = null, serviceId = null) => {
  if (!startTime || !endTime) return null;

  const startDt = startTime instanceof Date ? startTime : new Date(startTime);
  const endDt = endTime instanceof Date ? endTime : new Date(endTime);

  if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
    return null;
  }

  const where = {
    event_manager_id: eventManagerId,
    is_active: true,
    start_at: {
      lt: endDt
    },
    end_at: {
      gt: startDt
    }
  };

  if (excludeBlockId) {
    where.id = { not: excludeBlockId };
  }

  if (serviceId) {
    // Overlap applies if block is global (service_id is null) or specific to this service
    where.OR = [
      { service_id: null },
      { service_id: serviceId }
    ];
  }

  return await prisma.event_availability_blocks.findFirst({
    where,
    include: {
      event_services: true,
      cafes: true
    }
  });
};

/**
 * Finds all existing bookings for this event manager that conflict with a given time range
 */
const findConflictingBookings = async (eventManagerId, startTime, endTime, serviceId = null) => {
  const sDate = new Date(startTime);
  const eDate = new Date(endTime);

  const startDay = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
  const endDay = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());

  // Get all event service IDs owned by this event manager
  let serviceWhere = { user_id: eventManagerId };
  if (serviceId) {
    serviceWhere.id = serviceId;
  }
  const services = await prisma.event_services.findMany({
    where: serviceWhere,
    select: { id: true }
  });

  const serviceIds = services.map(s => s.id);
  if (serviceIds.length === 0) {
    return [];
  }

  const bookings = await prisma.bookings.findMany({
    where: {
      event_service_id: { in: serviceIds },
      booking_status: { in: ['PENDING', 'CONFIRMED', 'ACCEPTED'] },
      booking_date: {
        gte: startDay,
        lte: endDay
      }
    },
    select: {
      id: true,
      booking_number: true,
      booking_date: true,
      start_time: true,
      end_time: true,
      total_persons: true,
      users: {
        select: {
          id: true,
          name: true,
          phone: true
        }
      },
      cafes: {
        select: {
          id: true,
          name: true
        }
      },
      event_services: {
        select: {
          id: true,
          service_name: true
        }
      }
    }
  });

  // Filter overlapping by full datetime
  return bookings.filter(b => {
    const bDate = new Date(b.booking_date);
    const bStart = new Date(b.start_time);
    const bEnd = new Date(b.end_time);

    const bFullStart = new Date(
      bDate.getFullYear(),
      bDate.getMonth(),
      bDate.getDate(),
      bStart.getUTCHours(),
      bStart.getUTCMinutes(),
      bStart.getUTCSeconds()
    );
    const bFullEnd = new Date(
      bDate.getFullYear(),
      bDate.getMonth(),
      bDate.getDate(),
      bEnd.getUTCHours(),
      bEnd.getUTCMinutes(),
      bEnd.getUTCSeconds()
    );

    return bFullStart < endTime && bFullEnd > startTime;
  });
};

module.exports = {
  getBlocksByManagerAndRange,
  getBlockById,
  createBlock,
  updateBlock,
  deleteBlock,
  checkOverlap,
  findConflictingBookings
};
