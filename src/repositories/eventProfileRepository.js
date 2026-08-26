const prisma = require('../config/prisma');
const getProfileByUserId = async (userId) => {
  const profile = await prisma.event_management_profiles.findUnique({
    where: { user_id: userId },
    include: {
      users: {
        select: {
          event_business_hours: true
        }
      }
    }
  });

  if (profile && profile.users) {
    profile.event_business_hours = profile.users.event_business_hours;
    delete profile.users;
  }

  return profile;
};

const getOrCreateProfileByUserId = async (userId) => {
  let profile = await getProfileByUserId(userId);
  if (!profile) {
    const user = await prisma.users.findUnique({ where: { id: userId } });
    profile = await prisma.event_management_profiles.create({
      data: {
        user_id: userId,
        company_name: user?.business_name || user?.name || 'Event Management Company'
      }
    });
  }
  return profile;
};

const createProfile = async (profileData) => {
  return await prisma.event_management_profiles.create({
    data: profileData,
  });
};

const updateProfile = async (userId, updateData) => {
  return await prisma.event_management_profiles.update({
    where: { user_id: userId },
    data: updateData,
  });
};

const updateEventBusinessHours = async (userId, businessHours) => {
  return await prisma.$transaction(async (tx) => {
    await tx.event_business_hours.deleteMany({
      where: { user_id: userId }
    });
    
    let normalizedHours = businessHours;
    if (businessHours && !Array.isArray(businessHours) && typeof businessHours === 'object') {
      normalizedHours = Object.entries(businessHours).map(([day, data]) => ({
        dayOfWeek: day.toUpperCase(),
        openTime: data.open || data.openTime || data.open_time,
        closeTime: data.close || data.closeTime || data.close_time,
        isClosed: data.closed !== undefined ? data.closed : (data.isClosed !== undefined ? data.isClosed : data.is_closed)
      }));
    }

    if (normalizedHours && normalizedHours.length > 0) {
      const data = normalizedHours.map(hour => {
        let open_time = null;
        let close_time = null;
        const openTimeVal = hour.openTime || hour.open_time;
        const closeTimeVal = hour.closeTime || hour.close_time;

        if (openTimeVal) open_time = new Date(openTimeVal.includes('T') ? openTimeVal : `1970-01-01T${openTimeVal}Z`);
        if (closeTimeVal) close_time = new Date(closeTimeVal.includes('T') ? closeTimeVal : `1970-01-01T${closeTimeVal}Z`);
        
        return {
          user_id: userId,
          day_of_week: hour.dayOfWeek || hour.day_of_week,
          open_time,
          close_time,
          is_closed: hour.isClosed !== undefined ? hour.isClosed : (hour.is_closed || false)
        };
      });
      await tx.event_business_hours.createMany({ data });
    }
    
    return tx.event_business_hours.findMany({
      where: { user_id: userId }
    });
  });
};

module.exports = {
  getProfileByUserId,
  getOrCreateProfileByUserId,
  createProfile,
  updateProfile,
  updateEventBusinessHours
};
