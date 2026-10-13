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

  // For public / customer queries, only return services if the event manager profile is active (is_active !== false)
  const isPublicViewer = !currentUser || (userRole !== 'EVENT_MANAGER' && userRole !== 'VENDOR' && userRole !== 'ADMIN');
  if (isPublicViewer && !query.include_inactive) {
    where.users = {
      ...(where.users || {}),
      event_management_profiles: {
        ...(where.users?.event_management_profiles || {}),
        is_active: true
      }
    };
  }

  where.status = { not: 'DELETED' };

  return await prisma.event_services.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      event_service_inclusions: true,
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
      event_service_inclusions: true,
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
  // 1. Safely unlink foreign key references on bookings
  try {
    await prisma.bookings.updateMany({
      where: { event_service_id: id },
      data: { event_service_id: null }
    });
  } catch (e) {
    // Ignore error if column not nullable
  }

  // 2. Safely unlink foreign key references on reviews
  try {
    await prisma.reviews.updateMany({
      where: { event_service_id: id },
      data: { event_service_id: null }
    });
  } catch (e) {
    // Ignore error if column not nullable
  }

  // 3. Remove child inclusions
  try {
    await prisma.event_service_inclusions.deleteMany({
      where: { service_id: id }
    });
  } catch (e) {
    // Ignore inclusion cleanup errors
  }

  // 4. Attempt hard delete, fallback to soft-delete if foreign key constraint exists
  try {
    return await prisma.event_services.delete({
      where: { id },
    });
  } catch (err) {
    return await prisma.event_services.update({
      where: { id },
      data: { status: 'DELETED' }
    });
  }
};

module.exports = {
  createEventService,
  findAllEventServices,
  findEventServiceById,
  updateEventService,
  deleteEventService,
};
