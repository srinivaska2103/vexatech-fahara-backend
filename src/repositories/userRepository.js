const prisma = require('../config/prisma');
const findUserByEmail = async (email) => {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  return await prisma.users.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    include: { 
      roles: true,
      cafes: true,
      event_management_profiles: true,
    },
  });
};

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const findUserById = async (id) => {
  if (!id || typeof id !== 'string') return null;
  
  const isUuid = UUID_REGEX.test(id);
  if (!isUuid) {
    const userByEmail = await findUserByEmail(id);
    if (userByEmail) return userByEmail;
    return null;
  }

  return await prisma.users.findUnique({
    where: { id },
    include: { 
      roles: true,
      event_management_profiles: true,
      cafes: true,
      event_services: true,
      event_business_hours: true
    },
  });
};

const createUser = async (userData) => {
  return await prisma.users.create({
    data: userData,
  });
};

const updatePassword = async (id, password_hash) => {
  return await prisma.users.update({
    where: { id },
    data: { password_hash },
  });
};

const verifyUserEmail = async (id) => {
  return await prisma.users.update({
    where: { id },
    data: { email_verified: true, status: 'ACTIVE' },
  });
};

const findUsersByIds = async (ids) => {
  return await prisma.users.findMany({
    where: { id: { in: ids } },
  });
};

const findAllUsers = async (query = {}) => {
  const where = {};
  if (query.role) {
    where.roles = { name: query.role };
  }
  return await prisma.users.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: { roles: true, cafes: true, event_management_profiles: true }
  });
};

const updateUser = async (id, updateData) => {
  return await prisma.users.update({
    where: { id },
    data: updateData,
  });
};

const findUserByPhone = async (phone) => {
  if (!phone) return null;
  return await prisma.users.findFirst({
    where: { phone },
    include: { roles: true },
  });
};

module.exports = {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  createUser,
  updatePassword,
  verifyUserEmail,
  findUsersByIds,
  findAllUsers,
  updateUser
};
