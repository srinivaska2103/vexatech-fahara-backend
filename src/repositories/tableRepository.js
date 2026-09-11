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

const getUpcomingBookingsForTable = async (tableId) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return await prisma.booking_tables.findMany({
    where: {
      table_id: tableId,
      bookings: {
        booking_date: { gte: now },
        booking_status: { in: ['PENDING', 'CONFIRMED', 'ACCEPTED', 'IN_PROGRESS'] }
      }
    },
    include: {
      bookings: true
    }
  });
};

const checkTablesAvailability = async (cafeId, tableIds = [], bookingDate, startTime, endTime, excludeBookingId = null) => {
  if (!tableIds || tableIds.length === 0) return true;

  const whereClause = {
    table_id: { in: tableIds },
    bookings: {
      cafe_id: cafeId,
      booking_date: bookingDate,
      booking_status: { in: ['PENDING', 'CONFIRMED', 'ACCEPTED', 'IN_PROGRESS'] },
      AND: [
        { start_time: { lt: endTime } },
        { end_time: { gt: startTime } }
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
