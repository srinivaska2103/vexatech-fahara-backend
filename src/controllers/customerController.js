const customerService = require('../services/customerService');

const getCustomersByOwner = async (req, res, next) => {
  try {
    const customers = await customerService.getCustomersByOwner(req.user.id, req.user.roles?.name);
    res.status(200).json({ success: true, data: customers });
  } catch (error) {
    next(error);
  }
};

const getCustomerById = async (req, res, next) => {
  try {
    const customer = await customerService.getCustomerById(req.params.id, req.user.id, req.user.roles?.name);
    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
};

const getCustomerBookings = async (req, res, next) => {
  try {
    const bookings = await customerService.getCustomerBookings(req.params.id, req.user.id, req.user.roles?.name);
    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    next(error);
  }
};

const getCustomerPayments = async (req, res, next) => {
  try {
    const payments = await customerService.getCustomerPayments(req.params.id, req.user.id, req.user.roles?.name);
    res.status(200).json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

const getCustomerReviews = async (req, res, next) => {
  try {
    const reviews = await customerService.getCustomerReviews(req.params.id, req.user.id, req.user.roles?.name);
    res.status(200).json({ success: true, data: reviews });
  } catch (error) {
    next(error);
  }
};

const getCustomerAnalytics = async (req, res, next) => {
  try {
    const analytics = await customerService.getCustomerAnalytics(req.user.id, req.user.roles?.name);
    res.status(200).json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
};

const addCustomerNote = async (req, res, next) => {
  try {
    const { note } = req.body;
    const result = await customerService.addCustomerNote(req.params.id, req.user.id, note);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updateCustomerNote = async (req, res, next) => {
  try {
    const { note } = req.body;
    const result = await customerService.updateCustomerNote(req.params.noteId, note);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const deleteCustomerNote = async (req, res, next) => {
  try {
    await customerService.deleteCustomerNote(req.params.noteId);
    res.status(200).json({ success: true, message: 'Note deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCustomersByOwner,
  getCustomerById,
  getCustomerBookings,
  getCustomerPayments,
  getCustomerReviews,
  getCustomerAnalytics,
  addCustomerNote,
  updateCustomerNote,
  deleteCustomerNote,
};
