const prisma = require('../config/prisma');
const getActiveTokens = async (userId) => {
  const devices = await prisma.user_devices.findMany({
    where: {
      user_id: userId,
      is_active: true,
    },
    select: {
      fcm_token: true,
    },
  });

  return devices.map(d => d.fcm_token);
};

module.exports = {
  getActiveTokens,
};
