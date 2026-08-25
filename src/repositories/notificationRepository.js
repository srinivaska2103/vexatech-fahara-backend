const prisma = require('../config/prisma');
const saveNotification = async (data) => {
  return await prisma.notifications.create({
    data,
  });
};

const getNotifications = async (userId, filters = {}) => {
  const where = { user_id: userId };
  if (filters.status && filters.status !== 'all') {
    where.status = filters.status === 'unread' ? { not: 'READ' } : 'READ'; // Simplified logic based on UI needs
  }
  if (filters.type && filters.type !== 'all') {
    where.notification_type = filters.type;
  }
  
  return await prisma.notifications.findMany({
    where,
    orderBy: { created_at: 'desc' }
  });
};

const getNotificationById = async (userId, id) => {
  return await prisma.notifications.findFirst({
    where: { id, user_id: userId }
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
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getAdminNotifications,
  markAdminNotificationsAsRead
};
