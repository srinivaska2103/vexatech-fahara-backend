const prisma = require('../config/prisma');
const checkAvailability = async (cafeId, bookingDate, startTime, endTime) => {
  // startTime and endTime should be Date objects formatted properly
  const overlappingBooking = await prisma.bookings.findFirst({
    where: {
      cafe_id: cafeId,
      booking_date: bookingDate,
      booking_status: {
        in: ['PENDING', 'CONFIRMED'],
      },
      AND: [
        {
          start_time: {
            lt: endTime,
          },
        },
        {
          end_time: {
            gt: startTime,
          },
        },
      ],
    },
  });

  return overlappingBooking === null;
};

const createBooking = async (data) => {
  return await prisma.bookings.create({
    data,
  });
};

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const getBookingById = async (id) => {
  if (!id || typeof id !== 'string') return null;

  const isBookingNumber = id.startsWith('FAH-');
  const isUuid = UUID_REGEX.test(id);

  if (!isBookingNumber && !isUuid) {
    return null;
  }

  const booking = await prisma.bookings.findUnique({
    where: isBookingNumber ? { booking_number: id } : { id },
    include: {
      cafes: {
        include: {
          users: { select: { name: true, email: true, phone: true } }
        }
      },
      users: {
        select: { name: true, email: true, phone: true }
      }
    }
  });

  if (!booking) return null;

  if (booking.cafes) {
    const cafeRepository = require('./cafeRepository');
    booking.cafes = cafeRepository.sanitizeCafe(booking.cafes);
  }

  // Manually fetch package and event service if they exist (since relations might not be defined in Prisma schema)
  if (booking.package_id) {
    booking.packages = await prisma.cafe_packages.findUnique({
      where: { id: booking.package_id }
    });
  }

  if (booking.event_service_id) {
    booking.event_services = await prisma.event_services.findUnique({
      where: { id: booking.event_service_id },
      include: {
        users: { 
          select: { 
            name: true,
            email: true,
            phone: true,
            event_management_profiles: {
              select: { 
                company_name: true,
                business_email: true,
                business_phone: true,
                alternate_phone: true
              }
            }
          } 
        } // Event Company
      }
    });
  }

  // Manually fetch payments and refunds for real refund data
  try {
    const payments = await prisma.payments.findMany({
      where: { booking_id: booking.id },
      include: {
        payment_refunds: true
      },
      orderBy: { created_at: 'desc' }
    });
    booking.payments = payments || [];
  } catch (err) {
    booking.payments = [];
  }

  return booking;
};

const getBookingsByCustomer = async (customerId) => {
  const bookings = await prisma.bookings.findMany({
    where: { customer_id: customerId },
    include: {
      cafes: { select: { name: true } },
    },
    orderBy: { created_at: 'desc' }
  });

  // Attach packages
  for (const b of bookings) {
    if (b.package_id) {
      b.packages = await prisma.cafe_packages.findUnique({ where: { id: b.package_id } });
    }
  }

  return bookings;
};

const getBookingsByCafeOwner = async (ownerId, userRole = 'CAFE_OWNER') => {
  let whereClause = {
    cafes: {
      owner_id: ownerId
    }
  };

  if (userRole === 'EVENT_MANAGER') {
    const eventServices = await prisma.event_services.findMany({
      where: { user_id: ownerId },
      select: { id: true }
    });
    const eventServiceIds = eventServices.map(es => es.id);
    whereClause = {
      event_service_id: { in: eventServiceIds }
    };
  }

  const bookings = await prisma.bookings.findMany({
    where: whereClause,
    include: {
      cafes: { select: { name: true } },
      users: { select: { name: true, email: true, phone: true } }
    },
    orderBy: { created_at: 'desc' }
  });


  // Attach packages and event services with user & event management profile details
  for (const b of bookings) {
    if (b.package_id) {
      b.packages = await prisma.cafe_packages.findUnique({ where: { id: b.package_id } });
    }
    if (b.event_service_id) {
      b.event_services = await prisma.event_services.findUnique({ 
        where: { id: b.event_service_id },
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              event_management_profiles: {
                select: {
                  company_name: true,
                  business_email: true,
                  business_phone: true,
                  alternate_phone: true
                }
              }
            }
          }
        }
      });
    }
  }

  return bookings;
};

const updateBookingStatus = async (id, status) => {
  return await prisma.bookings.update({
    where: { id },
    data: { booking_status: status },
  });
};

const updateBookingPaymentStatus = async (id, status) => {
  return await prisma.bookings.update({
    where: { id },
    data: { payment_status: status },
  });
};

const deleteBooking = async (id) => {
  return await prisma.$transaction([
    prisma.payments.deleteMany({ where: { booking_id: id } }),
    prisma.notifications.deleteMany({ where: { booking_id: id } }),
    prisma.reviews.deleteMany({ where: { booking_id: id } }),
    prisma.bookings.delete({ where: { id } })
  ]);
};

const getAllAdminBookings = async (query = {}) => {
  const where = {};
  
  if (query.status) {
    where.booking_status = query.status;
  }
  
  if (query.paymentStatus) {
    where.payment_status = query.paymentStatus;
  }
  
  if (query.startDate && query.endDate) {
    where.created_at = {
      gte: new Date(query.startDate),
      lte: new Date(query.endDate)
    };
  }

  const bookings = await prisma.bookings.findMany({
    where,
    include: {
      cafes: { select: { name: true, users: { select: { name: true } } } },
      users: { select: { name: true, email: true, phone: true } },
      payments: { select: { status: true, amount: true } }
    },
    orderBy: { created_at: 'desc' }
  });

  // Attach packages
  for (const b of bookings) {
    if (b.package_id) {
      b.packages = await prisma.cafe_packages.findUnique({ where: { id: b.package_id } });
    }
    if (b.event_service_id) {
      b.event_services = await prisma.event_services.findUnique({ 
        where: { id: b.event_service_id },
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              event_management_profiles: {
                select: {
                  company_name: true,
                  business_email: true,
                  business_phone: true,
                  alternate_phone: true
                }
              }
            }
          }
        }
      });
    }
  }

  return bookings;
};

module.exports = {
  checkAvailability,
  createBooking,
  getBookingById,
  getBookingsByCustomer,
  getBookingsByCafeOwner,
  getAllAdminBookings,
  updateBookingStatus,
  updateBookingPaymentStatus,
  deleteBooking,
};
