const prisma = require('../config/prisma');
const createPaymentRecord = async (data) => {
  return await prisma.payments.create({
    data,
  });
};

const getPaymentByGatewayOrderId = async (orderId) => {
  return await prisma.payments.findFirst({
    where: { gateway_order_id: orderId },
  });
};

const getPaymentByBookingId = async (bookingId) => {
  return await prisma.payments.findFirst({
    where: { booking_id: bookingId },
    orderBy: { paid_at: { sort: 'desc', nulls: 'last' } }, // get the latest if multiple, ensuring successful payments come first
  });
};

const updatePaymentStatus = async (id, status, gatewayPaymentId = null, paidAt = null) => {
  const updateData = { status };
  if (gatewayPaymentId) updateData.gateway_payment_id = gatewayPaymentId;
  if (paidAt) updateData.paid_at = paidAt;

  return await prisma.payments.update({
    where: { id },
    data: updateData,
  });
};

const getOwnerPayments = async (ownerId, query = {}) => {
  // First check if owner owns cafes (restaurants or cafes)
  const ownedCafes = await prisma.cafes.findMany({
    where: { owner_id: ownerId },
    select: { id: true }
  });
  const ownedCafeIds = ownedCafes.map(c => c.id);

  // Fetch food orders belonging to this owner's cafes
  const foodOrders = ownedCafeIds.length > 0 ? await prisma.food_orders.findMany({
    where: { cafe_id: { in: ownedCafeIds } },
    select: {
      id: true,
      order_number: true,
      order_status: true,
      payment_status: true,
      customer_name: true,
      subtotal: true,
      discount_amount: true,
      total_amount: true,
      created_at: true,
      cafes: { select: { id: true, name: true } },
      payment_refunds: true
    }
  }) : [];

  const foodOrderNumbers = foodOrders.map(o => o.order_number);
  const foodOrderMap = {};
  foodOrders.forEach(o => { foodOrderMap[o.order_number] = o; });

  const whereConditions = [
    { bookings: { cafes: { owner_id: ownerId } } },
    { bookings: { event_services: { user_id: ownerId } } }
  ];

  if (foodOrderNumbers.length > 0) {
    whereConditions.push({
      AND: [
        { booking_id: null },
        {
          OR: [
            { gateway_order_id: { in: foodOrderNumbers } },
            { provider_order_id: { in: foodOrderNumbers } }
          ]
        }
      ]
    });
  }

  // Handle date filters if specified in query
  let dateCondition = undefined;
  const now = new Date();
  if (query.dateFilter === 'TODAY' || query.date_range === 'TODAY') {
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    dateCondition = { gte: startOfDay };
  } else if (query.dateFilter === '7_DAYS' || query.date_range === '7_DAYS') {
    const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateCondition = { gte: past7 };
  } else if (query.dateFilter === '30_DAYS' || query.date_range === '30_DAYS') {
    const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    dateCondition = { gte: past30 };
  } else if (query.dateFilter === 'THIS_MONTH' || query.date_range === 'THIS_MONTH') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    dateCondition = { gte: startOfMonth };
  }

  const payments = await prisma.payments.findMany({
    where: { 
      OR: whereConditions,
      ...(dateCondition ? {
        OR: [
          { paid_at: dateCondition },
          { created_at: dateCondition }
        ]
      } : {})
    },
    include: { 
      bookings: { 
        include: { 
          users: true, 
          cafes: true,
          event_services: { include: { users: true } }
        } 
      },
      payment_splits: true,
      payment_refunds: true
    },
    orderBy: { paid_at: { sort: 'desc', nulls: 'last' } }
  });

  // Attach food order metadata to payments with booking_id: null
  return payments.map(p => {
    if (!p.booking_id) {
      const fo = foodOrderMap[p.gateway_order_id] || foodOrderMap[p.provider_order_id];
      if (fo) {
        return {
          ...p,
          food_order: fo,
          _food_customer_name: fo.customer_name,
          _food_cafe_name: fo.cafes?.name
        };
      }
    }
    return p;
  });
};

const getOwnerSuccessfulPayments = async (ownerId) => {
  const ownedCafes = await prisma.cafes.findMany({
    where: { owner_id: ownerId },
    select: { id: true }
  });
  const ownedCafeIds = ownedCafes.map(c => c.id);

  const foodOrders = ownedCafeIds.length > 0 ? await prisma.food_orders.findMany({
    where: { cafe_id: { in: ownedCafeIds }, payment_status: 'PAID' },
    select: {
      id: true,
      order_number: true,
      customer_name: true,
      subtotal: true,
      total_amount: true,
      created_at: true,
      cafes: { select: { id: true, name: true } }
    }
  }) : [];

  const foodOrderNumbers = foodOrders.map(o => o.order_number);
  const foodOrderMap = {};
  foodOrders.forEach(o => { foodOrderMap[o.order_number] = o; });

  const whereConditions = [
    { bookings: { cafes: { owner_id: ownerId } } },
    { bookings: { event_services: { user_id: ownerId } } }
  ];

  if (foodOrderNumbers.length > 0) {
    whereConditions.push({
      AND: [
        { booking_id: null },
        {
          OR: [
            { gateway_order_id: { in: foodOrderNumbers } },
            { provider_order_id: { in: foodOrderNumbers } }
          ]
        }
      ]
    });
  }

  const payments = await prisma.payments.findMany({
    where: { 
      OR: whereConditions,
      status: 'SUCCESS'
    },
    include: { 
      bookings: { 
        select: { 
          subtotal: true,
          cafe_amount: true,
          event_service_amount: true,
          package_id: true,
          event_service_id: true,
          cafes: true,
          event_services: true
        } 
      },
      payment_splits: true,
      payment_refunds: true
    }
  });

  return payments.map(p => {
    if (!p.booking_id) {
      const fo = foodOrderMap[p.gateway_order_id] || foodOrderMap[p.provider_order_id];
      if (fo) {
        return {
          ...p,
          food_order: fo,
          _food_customer_name: fo.customer_name,
          _food_cafe_name: fo.cafes?.name
        };
      }
    }
    return p;
  });
};

const isUUID = (str) => typeof str === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);

const getOwnerPaymentById = async (ownerId, paymentId) => {
  if (!isUUID(paymentId)) return null;

  return await prisma.payments.findFirst({
    where: { 
      id: paymentId,
      OR: [
        { bookings: { cafes: { owner_id: ownerId } } },
        { bookings: { event_services: { user_id: ownerId } } }
      ]
    },
    include: { 
      bookings: { 
        include: { 
          users: true, 
          cafes: true,
          event_services: { include: { users: true } }
        } 
      } 
    }
  });
};

const getAllSuccessfulPayments = async () => {
  return await prisma.payments.findMany({
    where: { 
      OR: [
        { status: { in: ['SUCCESS', 'PAID', 'COMPLETED', 'SUCCESSFUL'] } },
        { bookings: { payment_status: { in: ['PAID', 'SUCCESS', 'COMPLETED'] } } }
      ]
    },
    include: { 
      bookings: { 
        include: { 
          users: true, 
          cafes: { include: { users: true } },
          event_services: { include: { users: true } }
        } 
      } 
    },
    orderBy: { paid_at: { sort: 'desc', nulls: 'last' } }
  });
};

const getAdminPaymentById = async (paymentId) => {
  if (!isUUID(paymentId)) return null;

  return await prisma.payments.findUnique({
    where: { id: paymentId },
    include: { 
      bookings: { 
        include: { 
          users: true, 
          cafes: { include: { users: true } },
          event_services: { include: { users: true } }
        } 
      } 
    }
  });
};

const getAllAdminTransactions = async (query = {}) => {
  const where = {};
  
  if (query.startDate && query.endDate) {
    where.paid_at = {
      gte: new Date(query.startDate),
      lte: new Date(query.endDate)
    };
  }

  return await prisma.payments.findMany({
    where,
    include: { 
      bookings: { 
        select: {
          id: true,
          event_service_id: true,
          package_id: true,
          cafe_amount: true,
          event_service_amount: true,
          food_amount: true,
          decoration_amount: true,
          extra_person_amount: true,
          subtotal: true,
          discount: true,
          gst: true,
          fahara_service_charge: true,
          transaction_fee: true,
          total: true,
          booking_date: true,
          booking_status: true,
          payment_status: true,
          booking_number: true,
          users: { select: { id: true, name: true, email: true, phone: true } },
          cafes: { 
            select: { 
              id: true, name: true,
              users: { select: { id: true, name: true, email: true } }
            } 
          },
          event_services: {
            select: {
              id: true,
              service_name: true,
              users: { select: { id: true, name: true, email: true } }
            }
          }
        }
      } 
    },
    orderBy: { paid_at: { sort: 'desc', nulls: 'last' } }
  });
};

module.exports = {
  createPaymentRecord,
  getPaymentByGatewayOrderId,
  getPaymentByBookingId,
  updatePaymentStatus,
  getOwnerPayments,
  getOwnerSuccessfulPayments,
  getOwnerPaymentById,
  getAllSuccessfulPayments,
  getAdminPaymentById,
  getAllAdminTransactions
};
