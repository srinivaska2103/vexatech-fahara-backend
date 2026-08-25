const eventService = require('../services/eventService');

const createService = async (req, res, next) => {
  try {
    const result = await eventService.createEventService(req.user.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getServices = async (req, res, next) => {
  try {
    const result = await eventService.getAllEventServices(req.query, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getServiceById = async (req, res, next) => {
  try {
    const result = await eventService.getEventServiceById(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updateService = async (req, res, next) => {
  try {
    const result = await eventService.updateEventService(req.user.id, req.params.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const deleteService = async (req, res, next) => {
  try {
    await eventService.deleteEventService(req.user.id, req.params.id);
    res.status(200).json({ success: true, message: 'Event service deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
};
