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

const getOwnerPayments = async (ownerId) => {
  return await prisma.payments.findMany({
    where: { 
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
    },
    orderBy: { paid_at: { sort: 'desc', nulls: 'last' } }
  });
};

const getOwnerSuccessfulPayments = async (ownerId) => {
  return await prisma.payments.findMany({
    where: { 
      OR: [
        { bookings: { cafes: { owner_id: ownerId } } },
        { bookings: { event_services: { user_id: ownerId } } }
      ],
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
      } 
    }
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
