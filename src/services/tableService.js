const tableRepository = require('../repositories/tableRepository');
const cafeRepository = require('../repositories/cafeRepository');

const verifyCafeOwner = async (cafeId, ownerId, userRole) => {
  const cafe = await cafeRepository.findCafeById(cafeId);
  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }

  if (userRole !== 'ADMIN' && cafe.owner_id !== ownerId) {
    const error = new Error('Unauthorized to manage tables for this cafe');
    error.statusCode = 403;
    throw error;
  }

  return cafe;
};

const getTablesByCafe = async (cafeId, ownerId, userRole) => {
  const cafe = await cafeRepository.findCafeById(cafeId);
  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }
  const tables = await tableRepository.getTablesByCafe(cafeId);

  const totalCafeCapacity = cafe.maximum_persons || 0;
  const assignedCapacity = tables
    .filter(t => t.status === 'ACTIVE')
    .reduce((sum, t) => sum + (t.capacity || 0), 0);

  const remainingCapacity = Math.max(0, totalCafeCapacity - assignedCapacity);

  // Check active booking status for tables
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const formattedTables = await Promise.all(tables.map(async (table) => {
    const primaryCombinations = (table.combinations_as_primary || []).map(c => c.combined_table);
    const inverseCombinations = (table.combinations_as_combined || []).map(c => c.primary_table);

    // Merge unique combined tables
    const combinedTablesMap = new Map();
    [...primaryCombinations, ...inverseCombinations].forEach(ct => {
      if (ct && ct.id !== table.id) {
        combinedTablesMap.set(ct.id, ct);
      }
    });

    const combined_with = Array.from(combinedTablesMap.values());

    // Check if table has active reserved bookings today / upcoming
    const upcomingBookings = await tableRepository.getUpcomingBookingsForTable(table.id);
    const isReserved = upcomingBookings.length > 0;

    return {
      ...table,
      combined_with,
      combined_table_ids: Array.from(combinedTablesMap.keys()),
      current_reservation_status: isReserved ? 'RESERVED' : 'AVAILABLE',
      upcoming_bookings_count: upcomingBookings.length,
      upcoming_bookings: upcomingBookings.map(b => ({
        booking_id: b.bookings?.id,
        booking_number: b.bookings?.booking_number,
        booking_date: b.bookings?.booking_date,
        start_time: b.bookings?.start_time,
        end_time: b.bookings?.end_time,
        guests: b.bookings?.total_persons,
        booking_status: b.bookings?.booking_status
      }))
    };
  }));

  return {
    cafe: {
      id: cafe.id,
      name: cafe.name,
      total_capacity: totalCafeCapacity
    },
    capacity_summary: {
      total_cafe_capacity: totalCafeCapacity,
      assigned_table_capacity: assignedCapacity,
      unassigned_capacity: remainingCapacity,
      is_over_capacity: assignedCapacity > totalCafeCapacity
    },
    tables: formattedTables
  };
};

const getNextTableNumber = async (cafeId, ownerId, userRole) => {
  await verifyCafeOwner(cafeId, ownerId, userRole);
  const tables = await tableRepository.getTablesByCafe(cafeId);

  const existingNumbers = tables.map(t => t.table_number.toUpperCase());
  let count = 1;
  while (existingNumbers.includes(`T${count}`)) {
    count++;
  }

  return { suggested_number: `T${count}` };
};

const createTable = async (cafeId, ownerId, userRole, data) => {
  const cafe = await verifyCafeOwner(cafeId, ownerId, userRole);

  const {
    table_number,
    capacity = 2,
    table_type = '2 Seater',
    location = 'Indoor',
    status = 'ACTIVE',
    is_combinable = false,
    description = '',
    position_x = 0,
    position_y = 0,
    rotation = 0,
    combined_table_ids = []
  } = data;

  const cleanNumber = String(table_number || '').trim();
  if (!cleanNumber) {
    const error = new Error('Table number is required');
    error.statusCode = 400;
    throw error;
  }

  // 1. Uniqueness check for table_number
  const existingTable = await tableRepository.getTableByNumber(cafeId, cleanNumber);
  if (existingTable) {
    const error = new Error(`Table number '${cleanNumber}' already exists for this cafe.`);
    error.statusCode = 400;
    throw error;
  }

  // 2. Capacity validation if status is ACTIVE
  const parsedCapacity = parseInt(capacity, 10);
  if (isNaN(parsedCapacity) || parsedCapacity < 1) {
    const error = new Error('Seats capacity must be a positive integer.');
    error.statusCode = 400;
    throw error;
  }

  if (status === 'ACTIVE') {
    const currentActiveCapacity = await tableRepository.getActiveCapacity(cafeId);
    const totalCafeCapacity = cafe.maximum_persons || 0;
    const newAssignedCapacity = currentActiveCapacity + parsedCapacity;

    if (newAssignedCapacity > totalCafeCapacity) {
      const error = new Error(`Table capacity exceeds your cafe capacity. (Total: ${totalCafeCapacity}, Current Active: ${currentActiveCapacity}, Adding: ${parsedCapacity})`);
      error.statusCode = 400;
      throw error;
    }
  }

  // 3. Create Table
  const newTable = await tableRepository.createTable({
    cafe_id: cafeId,
    table_number: cleanNumber,
    capacity: parsedCapacity,
    table_type,
    location,
    status,
    is_combinable: Boolean(is_combinable),
    description,
    position_x: parseFloat(position_x) || 0,
    position_y: parseFloat(position_y) || 0,
    rotation: parseInt(rotation, 10) || 0
  });

  // 4. Save combinations if combinable
  if (is_combinable && Array.isArray(combined_table_ids) && combined_table_ids.length > 0) {
    await tableRepository.setTableCombinations(cafeId, newTable.id, combined_table_ids);
  }

  return await tableRepository.getTableById(newTable.id);
};

const updateTable = async (cafeId, tableId, ownerId, userRole, data) => {
  const cafe = await verifyCafeOwner(cafeId, ownerId, userRole);
  const existingTable = await tableRepository.getTableById(tableId);

  if (!existingTable || existingTable.cafe_id !== cafeId) {
    const error = new Error('Table not found');
    error.statusCode = 404;
    throw error;
  }

  const {
    table_number,
    capacity,
    table_type,
    location,
    status,
    is_combinable,
    description,
    position_x,
    position_y,
    rotation,
    combined_table_ids
  } = data;

  const updatePayload = {};

  // 1. Table Number Uniqueness
  if (table_number !== undefined && String(table_number).trim() !== existingTable.table_number) {
    const cleanNumber = String(table_number).trim();
    const duplicate = await tableRepository.getTableByNumber(cafeId, cleanNumber);
    if (duplicate && duplicate.id !== tableId) {
      const error = new Error(`Table number '${cleanNumber}' is already in use.`);
      error.statusCode = 400;
      throw error;
    }
    updatePayload.table_number = cleanNumber;
  }

  const targetStatus = status !== undefined ? status : existingTable.status;
  const targetCapacity = capacity !== undefined ? parseInt(capacity, 10) : existingTable.capacity;

  if (isNaN(targetCapacity) || targetCapacity < 1) {
    const error = new Error('Seats capacity must be a positive integer.');
    error.statusCode = 400;
    throw error;
  }

  // 2. Safety Check: If deactivating/maintenance or reducing capacity, check upcoming bookings
  if (targetStatus !== 'ACTIVE' || targetCapacity < existingTable.capacity) {
    const upcomingBookings = await tableRepository.getUpcomingBookingsForTable(tableId);
    if (upcomingBookings.length > 0) {
      if (targetStatus !== 'ACTIVE') {
        const error = new Error(`Cannot set table ${existingTable.table_number} to ${targetStatus}: It has ${upcomingBookings.length} upcoming active booking(s).`);
        error.statusCode = 400;
        throw error;
      }

      const maxPersonsInUpcoming = Math.max(...upcomingBookings.map(b => b.bookings?.total_persons || 0));
      if (targetCapacity < maxPersonsInUpcoming) {
        const error = new Error(`Cannot reduce table capacity to ${targetCapacity}: An upcoming booking requires at least ${maxPersonsInUpcoming} seats.`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // 3. Capacity Validation if Table will be ACTIVE
  if (targetStatus === 'ACTIVE') {
    const activeCapacityExceptThis = await tableRepository.getActiveCapacity(cafeId, tableId);
    const totalCafeCapacity = cafe.maximum_persons || 0;
    const newAssignedCapacity = activeCapacityExceptThis + targetCapacity;

    if (newAssignedCapacity > totalCafeCapacity) {
      const error = new Error(`Table capacity exceeds your cafe capacity. (Total: ${totalCafeCapacity}, Active assigned: ${activeCapacityExceptThis + targetCapacity})`);
      error.statusCode = 400;
      throw error;
    }
  }

  if (capacity !== undefined) updatePayload.capacity = targetCapacity;
  if (table_type !== undefined) updatePayload.table_type = table_type;
  if (location !== undefined) updatePayload.location = location;
  if (status !== undefined) updatePayload.status = status;
  if (is_combinable !== undefined) updatePayload.is_combinable = Boolean(is_combinable);
  if (description !== undefined) updatePayload.description = description;
  if (position_x !== undefined) updatePayload.position_x = parseFloat(position_x) || 0;
  if (position_y !== undefined) updatePayload.position_y = parseFloat(position_y) || 0;
  if (rotation !== undefined) updatePayload.rotation = parseInt(rotation, 10) || 0;
  updatePayload.updated_at = new Date();

  await tableRepository.updateTable(tableId, updatePayload);

  if (combined_table_ids !== undefined) {
    await tableRepository.setTableCombinations(cafeId, tableId, combined_table_ids);
  }

  return await tableRepository.getTableById(tableId);
};

const updateTableStatus = async (cafeId, tableId, ownerId, userRole, status) => {
  const validStatuses = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
  const upperStatus = String(status || '').toUpperCase();

  if (!validStatuses.includes(upperStatus)) {
    const error = new Error(`Invalid table status '${status}'. Must be ACTIVE, INACTIVE, or MAINTENANCE.`);
    error.statusCode = 400;
    throw error;
  }

  return await updateTable(cafeId, tableId, ownerId, userRole, { status: upperStatus });
};

const deleteTable = async (cafeId, tableId, ownerId, userRole) => {
  const cafe = await verifyCafeOwner(cafeId, ownerId, userRole);
  const existingTable = await tableRepository.getTableById(tableId);

  if (!existingTable || existingTable.cafe_id !== cafeId) {
    const error = new Error('Table not found');
    error.statusCode = 404;
    throw error;
  }

  // Check if table has any bookings (historical or upcoming)
  const bookingsCount = await tableRepository.getTableBookingsCount(tableId);
  if (bookingsCount > 0) {
    const error = new Error(`Table '${existingTable.table_number}' has ${bookingsCount} historical/upcoming booking record(s). Please deactivate the table instead of permanently deleting it.`);
    error.statusCode = 400;
    throw error;
  }

  await tableRepository.deleteTable(tableId);
  return { success: true, message: `Table ${existingTable.table_number} deleted successfully.` };
};

const setTableCombinations = async (cafeId, tableId, ownerId, userRole, combinedTableIds = []) => {
  await verifyCafeOwner(cafeId, ownerId, userRole);
  const table = await tableRepository.getTableById(tableId);

  if (!table || table.cafe_id !== cafeId) {
    const error = new Error('Table not found');
    error.statusCode = 404;
    throw error;
  }

  await tableRepository.setTableCombinations(cafeId, tableId, combinedTableIds);
  return await tableRepository.getTableById(tableId);
};

const getRealtimeTableAvailability = async (cafeId, bookingDate, startTime, endTime) => {
  const bDate = new Date(bookingDate);
  const sTime = new Date(`1970-01-01T${startTime}Z`);
  const eTime = new Date(`1970-01-01T${endTime}Z`);

  const tables = await tableRepository.getTablesByCafe(cafeId);

  const availabilityResults = await Promise.all(tables.map(async (table) => {
    let isAvailable = false;
    let availabilityStatus = table.status; // 'ACTIVE', 'INACTIVE', 'MAINTENANCE'

    if (table.status === 'ACTIVE') {
      const isFree = await tableRepository.checkTablesAvailability(cafeId, [table.id], bDate, sTime, eTime);
      isAvailable = isFree;
      availabilityStatus = isFree ? 'AVAILABLE' : 'RESERVED';
    } else {
      isAvailable = false;
      availabilityStatus = table.status;
    }

    return {
      id: table.id,
      table_number: table.table_number,
      capacity: table.capacity,
      table_type: table.table_type,
      location: table.location,
      status: table.status,
      availability_status: availabilityStatus,
      is_available: isAvailable
    };
  }));

  return availabilityResults;
};

const findSuitableTablesForBooking = async (cafeId, totalPersons, bookingDate, startTime, endTime) => {
  const bDate = new Date(bookingDate);
  const sTime = new Date(`1970-01-01T${startTime}Z`);
  const eTime = new Date(`1970-01-01T${endTime}Z`);

  const tables = await tableRepository.getTablesByCafe(cafeId);
  const activeTables = tables.filter(t => t.status === 'ACTIVE');

  // Priority 1: Exact / smallest single suitable table
  const suitableSingleTables = activeTables
    .filter(t => t.capacity >= totalPersons)
    .sort((a, b) => a.capacity - b.capacity);

  for (const table of suitableSingleTables) {
    const isFree = await tableRepository.checkTablesAvailability(cafeId, [table.id], bDate, sTime, eTime);
    if (isFree) {
      return {
        assigned_tables: [table],
        table_ids: [table.id],
        is_combination: false
      };
    }
  }

  // Priority 2: Configured table combinations
  const combinableTables = activeTables.filter(t => t.is_combinable);

  for (const primaryTable of combinableTables) {
    const combinations = (primaryTable.combinations_as_primary || []).map(c => c.combined_table);
    for (const partnerTable of combinations) {
      if (partnerTable && partnerTable.status === 'ACTIVE') {
        const combinedCapacity = primaryTable.capacity + partnerTable.capacity;
        if (combinedCapacity >= totalPersons) {
          const comboIds = [primaryTable.id, partnerTable.id];
          const isComboFree = await tableRepository.checkTablesAvailability(cafeId, comboIds, bDate, sTime, eTime);
          if (isComboFree) {
            return {
              assigned_tables: [primaryTable, partnerTable],
              table_ids: comboIds,
              is_combination: true
            };
          }
        }
      }
    }
  }

  return null; // No suitable available table configuration found
};

module.exports = {
  getTablesByCafe,
  getNextTableNumber,
  createTable,
  updateTable,
  updateTableStatus,
  deleteTable,
  setTableCombinations,
  getRealtimeTableAvailability,
  findSuitableTablesForBooking,
};
