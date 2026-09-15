const prisma = require('../config/prisma');

const getTablesByCafe = async (cafeId) => {
  return await prisma.cafe_tables.findMany({
    where: { cafe_id: cafeId },
    include: {
      combinations_as_primary: {
        include: {
          combined_table: {
            select: {
              id: true,
              table_number: true,
              capacity: true,
              status: true,
              location: true
            }
          }
        }
      },
      combinations_as_combined: {
        include: {
          primary_table: {
            select: {
              id: true,
              table_number: true,
              capacity: true,
              status: true,
              location: true
            }
          }
        }
      }
    },
    orderBy: { table_number: 'asc' }
  });
};

const getTableById = async (tableId) => {
  return await prisma.cafe_tables.findUnique({
    where: { id: tableId },
    include: {
      combinations_as_primary: {
        include: {
          combined_table: true
        }
      },
      combinations_as_combined: {
        include: {
          primary_table: true
        }
      },
      booking_tables: {
        include: {
          bookings: true
        }
      }
    }
  });
};

const getTableByNumber = async (cafeId, tableNumber) => {
  return await prisma.cafe_tables.findFirst({
    where: {
      cafe_id: cafeId,
      table_number: {
        equals: tableNumber,
        mode: 'insensitive'
      }
    }
  });
};

const createTable = async (data) => {
  return await prisma.cafe_tables.create({
    data
  });
};

const updateTable = async (tableId, data) => {
  return await prisma.cafe_tables.update({
    where: { id: tableId },
    data
  });
};

const deleteTable = async (tableId) => {
  return await prisma.cafe_tables.delete({
    where: { id: tableId }
  });
};

const updateTableStatus = async (tableId, status) => {
  return await prisma.cafe_tables.update({
    where: { id: tableId },
    data: {
      status,
      updated_at: new Date()
    }
  });
};

const getActiveCapacity = async (cafeId, excludeTableId = null) => {
  const whereClause = {
    cafe_id: cafeId,
    status: 'ACTIVE'
  };

  if (excludeTableId) {
    whereClause.id = { not: excludeTableId };
  }

  const result = await prisma.cafe_tables.aggregate({
    where: whereClause,
    _sum: {
      capacity: true
    }
  });

  return result._sum.capacity || 0;
};

const setTableCombinations = async (cafeId, tableId, combinedTableIds = []) => {
  return await prisma.$transaction(async (tx) => {
    // Delete existing combinations where tableId is primary
    await tx.cafe_table_combinations.deleteMany({
      where: {
        cafe_id: cafeId,
        table_id: tableId
      }
    });

    if (!combinedTableIds || combinedTableIds.length === 0) {
      return [];
    }

    // Filter out self combination and invalid IDs
    const validCombinedIds = Array.from(new Set(combinedTableIds)).filter(id => id !== tableId);

    const records = validCombinedIds.map(combinedId => ({
      cafe_id: cafeId,
      table_id: tableId,
      combined_table_id: combinedId
    }));

    await tx.cafe_table_combinations.createMany({
      data: records
    });

    return records;
  });
};

const getTableBookingsCount = async (tableId) => {
  return await prisma.booking_tables.count({
    where: { table_id: tableId }
  });
};

const parseBookingDate = (dateVal) => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) {
    const yyyy = dateVal.getFullYear();
    const mm = String(dateVal.getMonth() + 1).padStart(2, '0');
    const dd = String(dateVal.getDate()).padStart(2, '0');
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }
  const str = String(dateVal).split('T')[0];
  return new Date(`${str}T00:00:00.000Z`);
};

const parseTimeToPrismaDate = (timeStr) => {
  if (!timeStr) return new Date('1970-01-01T00:00:00.000Z');
  if (timeStr instanceof Date) {
    const h = String(timeStr.getUTCHours()).padStart(2, '0');
    const m = String(timeStr.getUTCMinutes()).padStart(2, '0');
    const s = String(timeStr.getUTCSeconds()).padStart(2, '0');
    return new Date(`1970-01-01T${h}:${m}:${s}.000Z`);
  }
  const str = String(timeStr).trim();
  if (str.includes('T')) {
    const d = new Date(str);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    return new Date(`1970-01-01T${h}:${m}:${s}.000Z`);
  }
  const parts = str.split(':');
  const h = String(parts[0] || '0').padStart(2, '0');
  const m = String(parts[1] || '0').padStart(2, '0');
  const s = String((parts[2] || '0').split('.')[0]).padStart(2, '0');
  return new Date(`1970-01-01T${h}:${m}:${s}.000Z`);
};

const getUpcomingBookingsForTable = async (tableId) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return await prisma.booking_tables.findMany({
    where: {
      table_id: tableId,
      bookings: {
        booking_date: { gte: now },
        booking_status: { notIn: ['CANCELLED', 'REJECTED', 'REFUNDED', 'DELETED'] }
      }
    },
    include: {
      bookings: true
    }
  });
};

const checkTablesAvailability = async (cafeId, tableIds = [], bookingDate, startTime, endTime, excludeBookingId = null) => {
  if (!tableIds || tableIds.length === 0) return true;

  const bDate = parseBookingDate(bookingDate);
  const sTime = parseTimeToPrismaDate(startTime);
  const eTime = parseTimeToPrismaDate(endTime);

  const whereClause = {
    table_id: { in: tableIds },
    bookings: {
      cafe_id: cafeId,
      booking_date: bDate,
      booking_status: { notIn: ['CANCELLED', 'REJECTED', 'REFUNDED', 'DELETED'] },
      AND: [
        { start_time: { lt: eTime } },
        { end_time: { gt: sTime } }
      ]
    }
  };

  if (excludeBookingId) {
    whereClause.bookings.id = { not: excludeBookingId };
  }

  const conflicting = await prisma.booking_tables.findFirst({
    where: whereClause
  });

  return conflicting === null;
};

const assignTablesToBooking = async (bookingId, tableIds = []) => {
  if (!tableIds || tableIds.length === 0) return [];

  const records = tableIds.map(tableId => ({
    booking_id: bookingId,
    table_id: tableId
  }));

  return await prisma.booking_tables.createMany({
    data: records,
    skipDuplicates: true
  });
};

module.exports = {
  getTablesByCafe,
  getTableById,
  getTableByNumber,
  createTable,
  updateTable,
  deleteTable,
  updateTableStatus,
  getActiveCapacity,
  setTableCombinations,
  getTableBookingsCount,
  getUpcomingBookingsForTable,
  checkTablesAvailability,
  assignTablesToBooking,
};
