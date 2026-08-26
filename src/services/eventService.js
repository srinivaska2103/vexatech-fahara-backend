const eventServiceRepository = require('../repositories/eventServiceRepository');
const eventProfileRepository = require('../repositories/eventProfileRepository');

const createEventService = async (userId, serviceData) => {
  // Ensure the user has an event profile provisioned
  await eventProfileRepository.getOrCreateProfileByUserId(userId);

  return await eventServiceRepository.createEventService({
    ...serviceData,
    user_id: userId,
  });
};

const getAllEventServices = async (query = {}, currentUser = null) => {
  return await eventServiceRepository.findAllEventServices(query, currentUser);
};

const getEventServiceById = async (id) => {
  const service = await eventServiceRepository.findEventServiceById(id);
  if (!service) {
    const error = new Error('Event service not found');
    error.statusCode = 404;
    throw error;
  }
  return service;
};

const updateEventService = async (userId, serviceId, updateData) => {
  const service = await getEventServiceById(serviceId);
  const profile = await eventProfileRepository.getProfileByUserId(userId);

  if (!profile || service.user_id !== userId) {
    const error = new Error('Unauthorized to update this service');
    error.statusCode = 403;
    throw error;
  }

  return await eventServiceRepository.updateEventService(serviceId, updateData);
};

const deleteEventService = async (userId, serviceId) => {
  const service = await getEventServiceById(serviceId);
  const profile = await eventProfileRepository.getProfileByUserId(userId);

  if (!profile || service.user_id !== userId) {
    const error = new Error('Unauthorized to delete this service');
    error.statusCode = 403;
    throw error;
  }

  return await eventServiceRepository.deleteEventService(serviceId);
};

module.exports = {
  createEventService,
  getAllEventServices,
  getEventServiceById,
  updateEventService,
  deleteEventService,
};
