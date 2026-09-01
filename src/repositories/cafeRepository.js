const prisma = require('../config/prisma');
const createCafe = async (cafeData) => {
  return await prisma.cafes.create({
    data: cafeData,
  });
};

const sanitizeCafe = (cafe) => {
  if (!cafe || typeof cafe !== 'object') return cafe;
  const {
    razorpay_account_id,
    razorpay_linked_account_id,
    razorpay_account_status,
    payment_account_provider,
    payment_account_id,
    bank_account_last4,
    bank_account_holder,
    bank_ifsc,
    bank_verified_at,
    bank_verification_reference,
    ...cleanCafe
  } = cafe;
  return cleanCafe;
};

const stitchMediaToCafes = async (cafes) => {
  if (!cafes) return cafes;
  
  const isArray = Array.isArray(cafes);
  const cafesList = isArray ? cafes : [cafes];
  
  // Extract all package IDs
  const packageIds = [];
  cafesList.forEach(cafe => {
    if (cafe && cafe.cafe_packages) {
      cafe.cafe_packages.forEach(pkg => packageIds.push(pkg.id));
    }
  });

  // Fetch media for all these packages if packageIds exist
  let mediaMap = {};
  if (packageIds.length > 0) {
    const mediaList = await prisma.media.findMany({
      where: {
        owner_type: 'package',
        owner_id: { in: packageIds }
      }
    });

    mediaList.forEach(media => {
      mediaMap[media.owner_id] = media.file_url;
    });
  }

  // Attach cover_image to packages, compute reviews, and sanitize sensitive bank/payment fields
  const processedList = cafesList.map(rawCafe => {
    if (!rawCafe) return rawCafe;
    const cafe = { ...rawCafe };

    if (cafe.cafe_packages) {
      cafe.cafe_packages.forEach(pkg => {
        if (mediaMap[pkg.id]) {
          pkg.cover_image = mediaMap[pkg.id];
        }
        
        // Flatten inclusions back to root level for the frontend
        if (pkg.inclusions && typeof pkg.inclusions === 'object') {
          Object.assign(pkg, pkg.inclusions);
        }
      });
    }

    if (cafe.reviews && Array.isArray(cafe.reviews)) {
      cafe.total_reviews = cafe.reviews.length;
      if (cafe.total_reviews > 0) {
        const sum = cafe.reviews.reduce((acc, curr) => acc + (Number(curr.rating) || 0), 0);
        cafe.average_rating = (sum / cafe.total_reviews).toFixed(1);
      } else {
        cafe.average_rating = 0;
      }
    }

    return sanitizeCafe(cafe);
  });

  return isArray ? processedList : processedList[0];
};


const findAllCafes = async (query = {}) => {
  const where = {};
  
  if (query.owner_id) {
    where.owner_id = query.owner_id;
  } else {
    // For public customer UI searches, show active cafes
    where.status = { in: ['ACTIVE', 'APPROVED'] };
  }

  if (query.query) {
    where.name = { contains: query.query, mode: 'insensitive' };
  }
  
  if (query.status && !query.owner_id) {
    // if a specific status is requested by a non-owner, it's ignored or overriden above.
    // However, if we wanted to allow filtering by status, we can do it here. 
  } else if (query.status && query.owner_id) {
    where.status = query.status;
  }

  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 12;
  const skip = (page - 1) * limit;
  
  const cafes = await prisma.cafes.findMany({
    where,
    skip,
    take: limit,
    orderBy: { created_at: 'desc' },
    include: {
      users: {
        select: { name: true, email: true, phone: true },
      },
      cafe_packages: true,
      cafe_business_hours: true,
      reviews: true,
    },
  });
  return await stitchMediaToCafes(cafes);
};

const findCafeById = async (id) => {
  const cafe = await prisma.cafes.findUnique({
    where: { id },
    include: {
      users: {
        select: { name: true, email: true, phone: true },
      },
      cafe_packages: true,
      cafe_business_hours: true,
      reviews: true,
    },
  });
  return await stitchMediaToCafes(cafe);
};

const updateCafe = async (id, updateData) => {
  return await prisma.cafes.update({
    where: { id },
    data: updateData,
  });
};

const deleteCafe = async (id) => {
  return await prisma.cafes.delete({
    where: { id },
  });
};

const updateCafeBusinessHours = async (cafeId, businessHours) => {
  return await prisma.$transaction(async (tx) => {
    // Delete existing hours
    await tx.cafe_business_hours.deleteMany({
      where: { cafe_id: cafeId }
    });
    
    // Normalize businessHours to an array
    let hoursArray = [];
    if (Array.isArray(businessHours)) {
      hoursArray = businessHours;
    } else if (businessHours && typeof businessHours === 'object') {
      hoursArray = Object.entries(businessHours).map(([day, data]) => ({
        day_of_week: day,
        open_time: data.open || data.openTime || null,
        close_time: data.close || data.closeTime || null,
        is_closed: data.isOpen !== undefined ? !data.isOpen : (data.isClosed !== undefined ? data.isClosed : false)
      }));
    }

    // Create new hours if provided
    if (hoursArray.length > 0) {
      const data = hoursArray.map(hour => {
        let open_time = null;
        let close_time = null;
        const openTimeVal = hour.openTime || hour.open_time;
        const closeTimeVal = hour.closeTime || hour.close_time;

        if (openTimeVal) open_time = new Date(openTimeVal.includes('T') ? openTimeVal : `1970-01-01T${openTimeVal}Z`);
        if (closeTimeVal) close_time = new Date(closeTimeVal.includes('T') ? closeTimeVal : `1970-01-01T${closeTimeVal}Z`);
        
        return {
          cafe_id: cafeId,
          day_of_week: (hour.dayOfWeek || hour.day_of_week).toUpperCase(),
          open_time,
          close_time,
          is_closed: hour.isClosed !== undefined ? hour.isClosed : (hour.is_closed || false)
        };
      });
      await tx.cafe_business_hours.createMany({ data });
    }
    
    // Return updated hours
    return tx.cafe_business_hours.findMany({
      where: { cafe_id: cafeId }
    });
  });
};

const countCafesByOwner = async (ownerId) => {
  return await prisma.cafes.count({
    where: { owner_id: ownerId },
  });
};

module.exports = {
  createCafe,
  findAllCafes,
  findCafeById,
  updateCafe,
  deleteCafe,
  updateCafeBusinessHours,
  countCafesByOwner,
  sanitizeCafe,
};

