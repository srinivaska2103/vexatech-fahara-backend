const bookingService = require('../services/bookingService');

const createBooking = async (req, res, next) => {
  try {
    const result = await bookingService.createBooking(req.user.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getMyBookings = async (req, res, next) => {
  try {
    const result = await bookingService.getMyBookings(req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getCafeBookings = async (req, res, next) => {
  try {
    const roleName = req.user.roles?.name || req.user.role;
    const result = await bookingService.getCafeBookings(req.user.id, req.query, roleName);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getBookingById = async (req, res, next) => {
  try {
    const roleName = req.user.roles?.name || req.user.role;
    const result = await bookingService.getBookingById(req.params.id, req.user.id, roleName);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updateBookingStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const result = await bookingService.updateBookingStatus(req.params.id, req.user.id, status);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const cancelBooking = async (req, res, next) => {
  try {
    const roleName = req.user.roles?.name || req.user.role;
    const result = await bookingService.cancelBooking(req.params.id, req.user.id, roleName);
    res.status(200).json({ success: true, data: result, message: 'Booking cancelled successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteBooking = async (req, res, next) => {
  try {
    const roleName = req.user.roles?.name || req.user.role;
    await bookingService.deleteBooking(req.params.id, req.user.id, roleName);
    res.status(200).json({ success: true, message: 'Booking deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getAllAdminBookings = async (req, res, next) => {
  try {
    const result = await bookingService.getAllAdminBookings(req.query);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  getCafeBookings,
  getAllAdminBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  deleteBooking,
};
