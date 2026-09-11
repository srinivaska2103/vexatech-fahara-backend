const tableService = require('../services/tableService');

const getTablesByCafe = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const roleName = req.user?.roles?.name || req.user?.role;
    const result = await tableService.getTablesByCafe(cafeId, req.user?.id, roleName);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getNextTableNumber = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const roleName = req.user.roles?.name || req.user.role;
    const result = await tableService.getNextTableNumber(cafeId, req.user.id, roleName);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const createTable = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const roleName = req.user.roles?.name || req.user.role;
    const result = await tableService.createTable(cafeId, req.user.id, roleName, req.body);
    res.status(201).json({ success: true, data: result, message: 'Table created successfully' });
  } catch (error) {
    next(error);
  }
};

const updateTable = async (req, res, next) => {
  try {
    const { cafeId, tableId } = req.params;
    const roleName = req.user.roles?.name || req.user.role;
    const result = await tableService.updateTable(cafeId, tableId, req.user.id, roleName, req.body);
    res.status(200).json({ success: true, data: result, message: 'Table updated successfully' });
  } catch (error) {
    next(error);
  }
};

const updateTableStatus = async (req, res, next) => {
  try {
    const { cafeId, tableId } = req.params;
    const { status } = req.body;
    const roleName = req.user.roles?.name || req.user.role;
    const result = await tableService.updateTableStatus(cafeId, tableId, req.user.id, roleName, status);
    res.status(200).json({ success: true, data: result, message: `Table status updated to ${status}` });
  } catch (error) {
    next(error);
  }
};

const deleteTable = async (req, res, next) => {
  try {
    const { cafeId, tableId } = req.params;
    const roleName = req.user.roles?.name || req.user.role;
    const result = await tableService.deleteTable(cafeId, tableId, req.user.id, roleName);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const setTableCombinations = async (req, res, next) => {
  try {
    const { cafeId, tableId } = req.params;
    const { combined_table_ids } = req.body;
    const roleName = req.user.roles?.name || req.user.role;
    const result = await tableService.setTableCombinations(cafeId, tableId, req.user.id, roleName, combined_table_ids);
    res.status(200).json({ success: true, data: result, message: 'Table combinations updated successfully' });
  } catch (error) {
    next(error);
  }
};

const getRealtimeTableAvailability = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const { booking_date, start_time, end_time } = req.query;

    if (!booking_date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'booking_date, start_time, and end_time parameters are required'
      });
    }

    const result = await tableService.getRealtimeTableAvailability(cafeId, booking_date, start_time, end_time);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
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
};
