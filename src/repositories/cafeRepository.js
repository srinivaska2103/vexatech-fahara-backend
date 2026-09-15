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
        
        // Flatten legacy object-format inclusions back to root level for the frontend.
        // IMPORTANT: Do NOT flatten if inclusions is an ARRAY (new tier schema) — that would
        // spread numeric indices (0, 1, 2...) onto the package, corrupting it.
        if (pkg.inclusions && typeof pkg.inclusions === 'object' && !Array.isArray(pkg.inclusions)) {
          Object.assign(pkg, pkg.inclusions);
        }


        let incSum = 0;
        const isFood = pkg.food !== undefined ? Boolean(pkg.food) : Boolean(pkg.inclusions?.food);
        const isCake = pkg.cake !== undefined ? Boolean(pkg.cake) : Boolean(pkg.inclusions?.cake);
        const isDecor = pkg.decoration !== undefined ? Boolean(pkg.decoration) : Boolean(pkg.inclusions?.decoration);
        const isMusic = pkg.music !== undefined ? Boolean(pkg.music) : Boolean(pkg.inclusions?.music);
        const isOther = pkg.other !== undefined ? Boolean(pkg.other) : Boolean(pkg.inclusions?.other);

        if (isFood && Array.isArray(pkg.food_items)) pkg.food_items.forEach(i => incSum += Number(i.price) || 0);
        if (isCake && Array.isArray(pkg.cake_items)) pkg.cake_items.forEach(i => incSum += Number(i.price) || 0);
        if (isDecor && Array.isArray(pkg.decoration_items)) pkg.decoration_items.forEach(i => incSum += Number(i.price) || 0);
        if (isMusic && Array.isArray(pkg.music_items)) pkg.music_items.forEach(i => incSum += Number(i.price) || 0);
        if (isOther && Array.isArray(pkg.other_items)) pkg.other_items.forEach(i => incSum += Number(i.price) || 0);

        if (incSum > 0) {
          pkg.price = incSum;
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
  
  if (
    query.is_walking_cafe === 'true' || 
    query.is_walking_cafe === true || 
    query.cafe_type === 'WALKING_CAFE' || 
    (query.category && (
      String(query.category).toLowerCase().includes('walk') ||
      String(query.category).toLowerCase() === 'walking cafe' ||
      String(query.category).toLowerCase() === 'walking cafes'
    ))
  ) {
    where.OR = [
      { is_walking_cafe: true },
      { walk_in: true },
      { table_reservation: false },
      { category: { contains: 'Walking Cafe', mode: 'insensitive' } },
      { users: { user_type: 'WALKING_CAFE_OWNER' } }
    ];
  }

  if (
    query.category && 
    !String(query.category).toLowerCase().includes('walk') && 
    !String(query.category).toLowerCase().includes('discount') &&
    !String(query.category).toLowerCase().includes('offer') &&
    query.category !== 'All' &&
    query.category !== ''
  ) {
    where.category = { contains: query.category, mode: 'insensitive' };
  }

  if (query.status && !query.owner_id) {
    // if a specific status is requested by a non-owner, it's ignored or overriden above.
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
  let cafe = await prisma.cafes.findUnique({
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

  if (!cafe && id) {
    cafe = await prisma.cafes.findFirst({
      where: { user_id: id },
      include: {
        users: {
          select: { name: true, email: true, phone: true },
        },
        cafe_packages: true,
        cafe_business_hours: true,
        reviews: true,
      },
    });
  }

  return await stitchMediaToCafes(cafe);
};

const updateCafe = async (id, updateData) => {
  return await prisma.cafes.update({
    where: { id },
    data: updateData,
  });
};

const deleteCafe = async (id) => {
  return await prisma.$transaction(async (tx) => {
    // Delete dependent child records without ON DELETE CASCADE
    await tx.cafe_business_hours.deleteMany({ where: { cafe_id: id } });
    await tx.cafe_packages.deleteMany({ where: { cafe_id: id } });
    await tx.cafe_tables.deleteMany({ where: { cafe_id: id } });
    await tx.favorites.deleteMany({ where: { cafe_id: id } });
    await tx.reviews.deleteMany({ where: { cafe_id: id } });

    // Check if bookings exist
    const bookingCount = await tx.bookings.count({ where: { cafe_id: id } });
    if (bookingCount > 0) {
      // Soft-delete if bookings exist to preserve historical data
      return await tx.cafes.update({
        where: { id },
        data: { status: 'INACTIVE' }
      });
    }

    return await tx.cafes.delete({
      where: { id },
    });
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

