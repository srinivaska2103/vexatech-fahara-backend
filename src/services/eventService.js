const eventServiceRepository = require('../repositories/eventServiceRepository');
const eventProfileRepository = require('../repositories/eventProfileRepository');

const prisma = require('../config/prisma');

const createEventService = async (userId, serviceData) => {
  // Ensure the user has an event profile provisioned
  await eventProfileRepository.getOrCreateProfileByUserId(userId);

  const data = { ...serviceData };
  const rawInclusions = data.inclusions;
  
  let cleanInclusionsList = [];
  if (Array.isArray(rawInclusions)) {
    cleanInclusionsList = rawInclusions.map((inc, idx) => {
      if (typeof inc === 'string') {
        return {
          id: `inc_${Date.now()}_${idx}`,
          name: inc.trim(),
          category: inc.trim(),
          description: null,
          pricing_type: 'PER_GUEST',
          min_guests: 10,
          max_guests: 200,
          basic_price: 0,
          basic_desc: '',
          standard_price: 0,
          standard_desc: '',
          premium_price: 0,
          premium_desc: '',
          quantity: 1,
          unit: 'Item',
          unit_price: 0,
          is_active: true
        };
      }
      const incName = inc.name || inc.title || inc.item_name || `Item ${idx + 1}`;
      return {
        id: inc.id || `inc_${Date.now()}_${idx}`,
        name: String(incName).trim(),
        category: inc.category ? String(inc.category).trim() : String(incName).trim(),
        description: inc.description ? String(inc.description).trim() : null,
        pricing_type: inc.pricing_type || 'PER_GUEST',
        min_guests: inc.min_guests !== undefined && inc.min_guests !== null ? Number(inc.min_guests) : null,
        max_guests: inc.max_guests !== undefined && inc.max_guests !== null ? Number(inc.max_guests) : null,
        basic_price: inc.basic_price !== undefined ? Number(inc.basic_price) : (inc.unit_price ? Number(inc.unit_price) : 0),
        basic_desc: inc.basic_desc ? String(inc.basic_desc).trim() : (inc.description ? String(inc.description).trim() : ''),
        standard_price: inc.standard_price !== undefined ? Number(inc.standard_price) : (inc.unit_price ? Number(inc.unit_price) : 0),
        standard_desc: inc.standard_desc ? String(inc.standard_desc).trim() : '',
        premium_price: inc.premium_price !== undefined ? Number(inc.premium_price) : (inc.unit_price ? Number(inc.unit_price) : 0),
        premium_desc: inc.premium_desc ? String(inc.premium_desc).trim() : '',
        quantity: inc.quantity ? Number(inc.quantity) : 1,
        unit: inc.unit ? String(inc.unit).trim() : 'Item',
        unit_price: inc.unit_price !== undefined ? Number(inc.unit_price) : (inc.basic_price ? Number(inc.basic_price) : 0),
        is_active: inc.is_active !== undefined ? inc.is_active : true
      };
    });
  }

  const durationVal = data.duration_hours || data.duration_value || null;
  const durationUnit = data.duration_unit || 'Hours';

  const prismaServiceData = {
    user_id: userId,
    category: data.category || 'General Decoration',
    service_name: data.service_name || data.name || 'Custom Service',
    description: data.description || null,
    price: data.price !== undefined && data.price !== null ? Number(data.price) : 0,
    duration_hours: durationVal ? Number(durationVal) : null,
    duration_unit: durationUnit,
    gallery: data.gallery || null,
    inclusions: cleanInclusionsList,
    status: data.status || 'ACTIVE',
    ...(cleanInclusionsList.length > 0 ? {
      event_service_inclusions: {
        create: cleanInclusionsList.map(inc => ({
          name: inc.name,
          description: inc.description || inc.basic_desc || null,
          quantity: inc.quantity || 1,
          unit: inc.unit || 'Item',
          unit_price: inc.basic_price !== undefined ? inc.basic_price : (inc.unit_price || 0)
        }))
      }
    } : {})
  };

  return await eventServiceRepository.createEventService(prismaServiceData);
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

  const data = { ...updateData };
  let cleanInclusionsList = [];
  if (data.inclusions !== undefined) {
    const rawInclusions = Array.isArray(data.inclusions) ? data.inclusions : [];
    cleanInclusionsList = rawInclusions.map((inc, idx) => {
      if (typeof inc === 'string') {
        return {
          id: `inc_${Date.now()}_${idx}`,
          name: inc.trim(),
          category: inc.trim(),
          description: null,
          pricing_type: 'PER_GUEST',
          min_guests: 10,
          max_guests: 200,
          basic_price: 0,
          basic_desc: '',
          standard_price: 0,
          standard_desc: '',
          premium_price: 0,
          premium_desc: '',
          quantity: 1,
          unit: 'Item',
          unit_price: 0,
          is_active: true
        };
      }
      const incName = inc.name || inc.title || inc.item_name || `Item ${idx + 1}`;
      return {
        id: inc.id || `inc_${Date.now()}_${idx}`,
        name: String(incName).trim(),
        category: inc.category ? String(inc.category).trim() : String(incName).trim(),
        description: inc.description ? String(inc.description).trim() : null,
        pricing_type: inc.pricing_type || 'PER_GUEST',
        min_guests: inc.min_guests !== undefined && inc.min_guests !== null ? Number(inc.min_guests) : null,
        max_guests: inc.max_guests !== undefined && inc.max_guests !== null ? Number(inc.max_guests) : null,
        basic_price: inc.basic_price !== undefined ? Number(inc.basic_price) : (inc.unit_price ? Number(inc.unit_price) : 0),
        basic_desc: inc.basic_desc ? String(inc.basic_desc).trim() : (inc.description ? String(inc.description).trim() : ''),
        standard_price: inc.standard_price !== undefined ? Number(inc.standard_price) : (inc.unit_price ? Number(inc.unit_price) : 0),
        standard_desc: inc.standard_desc ? String(inc.standard_desc).trim() : '',
        premium_price: inc.premium_price !== undefined ? Number(inc.premium_price) : (inc.unit_price ? Number(inc.unit_price) : 0),
        premium_desc: inc.premium_desc ? String(inc.premium_desc).trim() : '',
        quantity: inc.quantity ? Number(inc.quantity) : 1,
        unit: inc.unit ? String(inc.unit).trim() : 'Item',
        unit_price: inc.unit_price !== undefined ? Number(inc.unit_price) : (inc.basic_price ? Number(inc.basic_price) : 0),
        is_active: inc.is_active !== undefined ? inc.is_active : true
      };
    });

    await prisma.event_service_inclusions.deleteMany({ where: { service_id: serviceId } });
  }

  const durationVal = data.duration_hours !== undefined ? data.duration_hours : service.duration_hours;
  const durationUnit = data.duration_unit !== undefined ? data.duration_unit : service.duration_unit;

  const prismaUpdateData = {
    category: data.category !== undefined ? data.category : service.category,
    service_name: data.service_name !== undefined ? data.service_name : service.service_name,
    description: data.description !== undefined ? data.description : service.description,
    price: data.price !== undefined && data.price !== null ? Number(data.price) : service.price,
    duration_hours: durationVal ? Number(durationVal) : null,
    duration_unit: durationUnit,
    gallery: data.gallery !== undefined ? data.gallery : service.gallery,
    status: data.status !== undefined ? data.status : service.status,
    ...(data.inclusions !== undefined ? {
      inclusions: cleanInclusionsList,
      event_service_inclusions: {
        create: cleanInclusionsList.map(inc => ({
          name: inc.name,
          description: inc.description || inc.basic_desc || null,
          quantity: inc.quantity || 1,
          unit: inc.unit || 'Item',
          unit_price: inc.basic_price !== undefined ? inc.basic_price : (inc.unit_price || 0)
        }))
      }
    } : {})
  };

  return await eventServiceRepository.updateEventService(serviceId, prismaUpdateData);
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
