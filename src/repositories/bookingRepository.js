const prisma = require('../config/prisma');
const checkAvailability = async (cafeId, bookingDate, startTime, endTime, eventServiceId = null) => {
  if (!bookingDate || !startTime || !endTime) return true;

  const validBDate = bookingDate instanceof Date ? bookingDate : new Date(bookingDate);
  const validSTime = startTime instanceof Date ? startTime : new Date(startTime);
  const validETime = endTime instanceof Date ? endTime : new Date(endTime);

  if (isNaN(validBDate.getTime()) || isNaN(validSTime.getTime()) || isNaN(validETime.getTime())) {
    return true;
  }

  // 1. Check overlapping active bookings for the cafe
  const overlappingBooking = await prisma.bookings.findFirst({
    where: {
      cafe_id: cafeId,
      booking_date: validBDate,
      booking_status: {
        in: ['PENDING', 'CONFIRMED', 'ACCEPTED'],
      },
      AND: [
        {
          start_time: {
            lt: validETime,
          },
        },
        {
          end_time: {
            gt: validSTime,
          },
        },
      ],
    },
  });

  if (overlappingBooking !== null) {
    return false;
  }

  // 2. Check active availability blocks for the cafe
  let reqDate = bookingDate instanceof Date ? bookingDate : new Date(bookingDate);
  if (isNaN(reqDate.getTime())) {
    reqDate = new Date();
  }

  const sHours = startTime instanceof Date ? (isNaN(startTime.getTime()) ? 12 : startTime.getUTCHours()) : parseInt(String(startTime).split(':')[0] || 12, 10);
  const sMins = startTime instanceof Date ? (isNaN(startTime.getTime()) ? 0 : startTime.getUTCMinutes()) : parseInt(String(startTime).split(':')[1] || 0, 10);
  const eHours = endTime instanceof Date ? (isNaN(endTime.getTime()) ? 13 : endTime.getUTCHours()) : parseInt(String(endTime).split(':')[0] || 13, 10);
  const eMins = endTime instanceof Date ? (isNaN(endTime.getTime()) ? 0 : endTime.getUTCMinutes()) : parseInt(String(endTime).split(':')[1] || 0, 10);

  const reqStart = new Date(Date.UTC(reqDate.getUTCFullYear(), reqDate.getUTCMonth(), reqDate.getUTCDate(), sHours, sMins, 0));
  const reqEnd = new Date(Date.UTC(reqDate.getUTCFullYear(), reqDate.getUTCMonth(), reqDate.getUTCDate(), eHours, eMins, 0));

  if (!isNaN(reqStart.getTime()) && !isNaN(reqEnd.getTime())) {
    const activeCafeBlock = await prisma.cafe_availability_blocks.findFirst({
      where: {
        cafe_id: cafeId,
        is_active: true,
        start_at: {
          lt: reqEnd
        },
        end_at: {
          gt: reqStart
        }
      }
    });

    if (activeCafeBlock !== null) {
      return false;
    }
  }

  // 3. If an eventServiceId is provided, also check Event Manager active blocks
  if (eventServiceId && !isNaN(reqStart.getTime()) && !isNaN(reqEnd.getTime())) {
    const service = await prisma.event_services.findUnique({
      where: { id: eventServiceId },
      select: { user_id: true }
    });

    if (service && service.user_id) {
      const activeEmBlock = await prisma.event_availability_blocks.findFirst({
        where: {
          event_manager_id: service.user_id,
          is_active: true,
          start_at: {
            lt: reqEnd
          },
          end_at: {
            gt: reqStart
          },
          OR: [
            { service_id: null },
            { service_id: eventServiceId }
          ]
        }
      });

      if (activeEmBlock !== null) {
        return false;
      }
    }
  }

  return true;
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
      },
      booking_tables: {
        include: {
          cafe_tables: true
        }
      },
      booking_items: true
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
      cafes: {
        select: {
          id: true,
          name: true,
          city: true,
          address: true,
          cover_image: true,
          gallery: true,
          category: true,
        },
      },
      event_services: {
        select: {
          id: true,
          service_name: true,
          gallery: true,
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  // Collect package IDs and batch fetch
  const packageIds = [...new Set(bookings.map(b => b.package_id).filter(Boolean))];
  if (packageIds.length > 0) {
    const packages = await prisma.cafe_packages.findMany({
      where: { id: { in: packageIds } }
    });
    const packageMap = new Map(packages.map(p => [p.id, p]));
    for (const b of bookings) {
      if (b.package_id) {
        b.packages = packageMap.get(b.package_id) || null;
      }
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
      users: { select: { name: true, email: true, phone: true } },
      booking_items: true,
      booking_tables: {
        include: {
          cafe_tables: true
        }
      }
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
