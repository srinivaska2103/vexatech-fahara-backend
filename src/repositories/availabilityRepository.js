const prisma = require('../config/prisma');

/**
 * Repository for managing cafe availability blocks
 */

const getBlocksByCafeAndRange = async (cafeId, fromDate, toDate) => {
  return await prisma.cafe_availability_blocks.findMany({
    where: {
      cafe_id: cafeId,
      is_active: true,
      start_at: {
        lte: toDate
      },
      end_at: {
        gte: fromDate
      }
    },
    orderBy: {
      start_at: 'asc'
    }
  });
};

const getBlockById = async (blockId) => {
  return await prisma.cafe_availability_blocks.findUnique({
    where: { id: blockId },
    include: { cafes: true }
  });
};

const createBlock = async (data) => {
  return await prisma.cafe_availability_blocks.create({
    data
  });
};

const updateBlock = async (blockId, data) => {
  return await prisma.cafe_availability_blocks.update({
    where: { id: blockId },
    data: {
      ...data,
      updated_at: new Date()
    }
  });
};

const deleteBlock = async (blockId) => {
  return await prisma.cafe_availability_blocks.delete({
    where: { id: blockId }
  });
};

/**
 * Checks if a requested interval overlaps with any active availability block
 * Returns true if there is an active overlapping block (meaning it's blocked)
 */
const checkOverlap = async (cafeId, startTime, endTime, excludeBlockId = null) => {
  if (!startTime || !endTime) return null;

  const startDt = startTime instanceof Date ? startTime : new Date(startTime);
  const endDt = endTime instanceof Date ? endTime : new Date(endTime);

  if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
    return null;
  }

  const where = {
    cafe_id: cafeId,
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

  const existingBlock = await prisma.cafe_availability_blocks.findFirst({
    where
  });

  return existingBlock;
};

/**
 * Finds all existing bookings that conflict with a given time range
 */
const findConflictingBookings = async (cafeId, startTime, endTime) => {
  const sDate = new Date(startTime);
  const eDate = new Date(endTime);

  // Extract date boundaries in UTC / ISO
  const startDay = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
  const endDay = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate());

  const bookings = await prisma.bookings.findMany({
    where: {
      cafe_id: cafeId,
      booking_status: { in: ['PENDING', 'CONFIRMED', 'ACCEPTED'] },
      booking_date: {
        gte: startDay,
        lte: endDay
      }
    },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true
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
  getBlocksByCafeAndRange,
  getBlockById,
  createBlock,
  updateBlock,
  deleteBlock,
  checkOverlap,
  findConflictingBookings
};
