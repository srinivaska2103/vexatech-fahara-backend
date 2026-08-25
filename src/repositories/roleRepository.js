const prisma = require('../config/prisma');
const findRoleByName = async (name) => {
  return await prisma.roles.findUnique({
    where: { name },
  });
};

module.exports = {
  findRoleByName,
};
