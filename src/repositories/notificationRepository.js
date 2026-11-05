const prisma = require('../config/prisma');
const { emitNotificationToUser } = require('../config/socket');

const saveNotification = async (data) => {
  // Idempotency: Prevent duplicate notifications for same user + type + entity created within the last 60 seconds
  if (data?.user_id && data?.notification_type) {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const existing = await prisma.notifications.findFirst({
      where: {
        user_id: data.user_id,
        booking_id: data.booking_id || null,
        order_id: data.order_id || null,
        notification_type: data.notification_type,
        created_at: { gte: oneMinuteAgo }
      }
    });
    if (existing) {
      console.log(`[saveNotification] Skipping duplicate notification for user ${data.user_id}, booking ${data.booking_id}, order ${data.order_id}, type ${data.notification_type}`);
      return existing;
    }
  }

  const notification = await prisma.notifications.create({
    data: {
      user_id: data.user_id,
      booking_id: data.booking_id || null,
      order_id: data.order_id || null,
      cafe_id: data.cafe_id || null,
      category: data.category || 'BOOKING',
      priority: data.priority || 'MEDIUM',
      title: data.title || '',
      message: data.message || '',
      notification_type: data.notification_type || 'INFO',
      channel: data.channel || 'IN_APP',
      status: data.status || 'SENT',
      metadata: data.metadata || null,
      sent_at: data.sent_at || new Date(),
    },
    include: {
      bookings: {
        select: {
          id: true,
          booking_number: true,
          booking_date: true,
          total: true,
          users: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        }
      },
      food_orders: {
        select: {
          id: true,
          order_number: true,
          order_type: true,
          order_status: true,
          customer_name: true,
          customer_phone: true,
          total_amount: true
        }
      }
    }
  });

  if (data?.user_id) {
    emitNotificationToUser(data.user_id, notification);
  }

  return notification;
};

const getNotifications = async (userId, filters = {}) => {
  const where = { user_id: userId };

  // Status Filter
  if (filters.status && filters.status !== 'all') {
    const s = filters.status.toUpperCase();
    if (s === 'UNREAD') {
      where.AND = [
        ...(where.AND || []),
        { read_at: null },
        { status: { not: 'READ' } }
      ];
    } else if (s === 'READ') {
      where.OR = [
        { read_at: { not: null } },
        { status: 'READ' }
      ];
    }
  }

  // Priority Filter
  if (filters.priority && filters.priority !== 'all') {
    where.priority = filters.priority.toUpperCase();
  }

  // Category / Type Filter
  if (filters.category && filters.category !== 'all') {
    where.category = filters.category.toUpperCase();
  } else if (filters.type && filters.type !== 'all') {
    const t = filters.type.toUpperCase();
    if (['FOOD_ORDER', 'BOOKING', 'PAYMENT', 'REVIEW', 'DELIVERY', 'CUSTOMER', 'SUBSCRIPTION', 'SYSTEM'].includes(t)) {
      where.OR = [
        { category: t },
        { notification_type: { contains: t } }
      ];
    } else {
      where.notification_type = t;
    }
  }

  // Search Filter (Across title, message, booking_number, order_number)
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim();
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { message: { contains: q, mode: 'insensitive' } },
          { bookings: { booking_number: { contains: q, mode: 'insensitive' } } },
          { bookings: { users: { name: { contains: q, mode: 'insensitive' } } } },
          { food_orders: { order_number: { contains: q, mode: 'insensitive' } } },
          { food_orders: { customer_name: { contains: q, mode: 'insensitive' } } }
        ]
      }
    ];
  }

  return await prisma.notifications.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      bookings: {
        select: {
          id: true,
          booking_number: true,
          booking_date: true,
          total: true,
          users: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        }
      },
      food_orders: {
        select: {
          id: true,
          order_number: true,
          order_type: true,
          order_status: true,
          customer_name: true,
          total_amount: true
        }
      }
    }
  });
};

const getNotificationStats = async (userId) => {
  const [total, unread, foodOrders, bookings, payments, reviews] = await Promise.all([
    prisma.notifications.count({ where: { user_id: userId } }),
    prisma.notifications.count({
      where: {
        user_id: userId,
        read_at: null,
        status: { not: 'READ' }
      }
    }),
    prisma.notifications.count({
      where: {
        user_id: userId,
        OR: [
          { category: 'FOOD_ORDER' },
          { order_id: { not: null } },
          { notification_type: { contains: 'ORDER' } }
        ]
      }
    }),
    prisma.notifications.count({
      where: {
        user_id: userId,
        OR: [
          { category: 'BOOKING' },
          { booking_id: { not: null } },
          { notification_type: { contains: 'BOOKING' } }
        ]
      }
    }),
    prisma.notifications.count({
      where: {
        user_id: userId,
        OR: [
          { category: 'PAYMENT' },
          { notification_type: { contains: 'PAYMENT' } },
          { notification_type: { contains: 'REFUND' } },
          { notification_type: { contains: 'PAYOUT' } }
        ]
      }
    }),
    prisma.notifications.count({
      where: {
        user_id: userId,
        OR: [
          { category: 'REVIEW' },
          { notification_type: { contains: 'REVIEW' } }
        ]
      }
    })
  ]);

  return {
    total,
    unread,
    foodOrders,
    bookings,
    payments,
    reviews
  };
};

const getNotificationById = async (userId, id) => {
  return await prisma.notifications.findFirst({
    where: { id, user_id: userId },
    include: {
      bookings: {
        select: {
          id: true,
          booking_number: true,
          booking_date: true,
          total: true,
          users: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        }
      },
      food_orders: {
        select: {
          id: true,
          order_number: true,
          order_type: true,
          order_status: true,
          customer_name: true,
          customer_phone: true,
          total_amount: true
        }
      }
    }
  });
};

const markAsRead = async (userId, id) => {
  return await prisma.notifications.update({
    where: { id, user_id: userId },
    data: { read_at: new Date(), status: 'READ' }
  });
};

const markAllAsRead = async (userId) => {
  return await prisma.notifications.updateMany({
    where: { user_id: userId, read_at: null },
    data: { read_at: new Date(), status: 'READ' }
  });
};

const deleteNotification = async (userId, id) => {
  return await prisma.notifications.delete({
    where: { id, user_id: userId }
  });
};

const getAdminNotifications = async (filters = {}) => {
  const where = {};
  if (filters.status && filters.status !== 'all') {
    where.status = filters.status === 'unread' ? { not: 'READ' } : 'READ';
  }
  if (filters.type && filters.type !== 'all') {
    where.notification_type = filters.type;
  }
  
  return await prisma.notifications.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      users: { select: { name: true, email: true, role_id: true } }
    }
  });
};

const markAdminNotificationsAsRead = async () => {
  return await prisma.notifications.updateMany({
    where: { read_at: null },
    data: { read_at: new Date(), status: 'READ' }
  });
};

module.exports = {
  saveNotification,
  getNotifications,
  getNotificationStats,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getAdminNotifications,
  markAdminNotificationsAsRead
};
