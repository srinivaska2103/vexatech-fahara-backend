const prisma = require('../config/prisma');
const createEventService = async (serviceData) => {
  return await prisma.event_services.create({
    data: serviceData,
  });
};

const findAllEventServices = async (query = {}, currentUser = null) => {
  const where = {};

  const userRole = currentUser?.roles?.name || currentUser?.role;

  if (query.user_id || query.userId) {
    where.user_id = query.user_id || query.userId;
  } else if (currentUser && (userRole === 'EVENT_MANAGER' || userRole === 'VENDOR')) {
    where.user_id = currentUser.id;
  }

  if (query.category && query.category !== 'ALL') {
    where.category = { contains: query.category, mode: 'insensitive' };
  }

  if (query.is_public === 'true' || (query.isPublic === 'true' && !where.user_id)) {
    where.users = {
      event_management_profiles: {
        bank_verification_status: 'VERIFIED'
      }
    };
  }

  return await prisma.event_services.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      users: {
        select: { 
          name: true,
          email: true,
          phone: true,
          event_management_profiles: {
            select: { company_name: true }
          },
          event_business_hours: true
        },
      },
    },
  });
};

const findEventServiceById = async (id) => {
  return await prisma.event_services.findUnique({
    where: { id },
    include: {
      users: {
        select: { 
          name: true,
          email: true,
          phone: true,
          event_management_profiles: {
            select: { company_name: true }
          },
          event_business_hours: true
        },
      },
    },
  });
};

const updateEventService = async (id, updateData) => {
  return await prisma.event_services.update({
    where: { id },
    data: updateData,
  });
};

const deleteEventService = async (id) => {
  return await prisma.event_services.delete({
    where: { id },
  });
};

module.exports = {
  createEventService,
  findAllEventServices,
  findEventServiceById,
  updateEventService,
  deleteEventService,
};
