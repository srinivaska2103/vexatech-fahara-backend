const offerRepository = require('../repositories/offerRepository');
const cafeRepository = require('../repositories/cafeRepository');
const prisma = require('../config/prisma');

/**
 * Resolve and authorize cafe for current vendor session
 */
const resolveAuthorizedCafe = async (userId, userRole, requestedCafeId = null) => {
  if (userRole === 'ADMIN' && requestedCafeId) {
    const cafe = await cafeRepository.findCafeById(requestedCafeId);
    if (!cafe) {
      const error = new Error('Cafe not found');
      error.statusCode = 404;
      throw error;
    }
    return cafe;
  }

  let cafe = null;
  if (requestedCafeId) {
    cafe = await cafeRepository.findCafeById(requestedCafeId);
    if (cafe && cafe.owner_id !== userId && userRole !== 'ADMIN') {
      const error = new Error('Unauthorized to access this cafe offers');
      error.statusCode = 403;
      throw error;
    }
  }

  if (!cafe) {
    const userCafes = await cafeRepository.findAllCafes({ owner_id: userId, limit: 1 });
    cafe = userCafes && userCafes.length > 0 ? userCafes[0] : null;
  }

  if (!cafe) {
    const error = new Error('No registered restaurant profile found for this partner account');
    error.statusCode = 404;
    throw error;
  }

  return cafe;
};

/**
 * Discount calculation engine with conflict resolution rules:
 * Rule 1: ITEM offer takes precedence over CATEGORY offer.
 * Rule 2: CATEGORY offer takes precedence over RESTAURANT offer.
 * Rule 3: If multiple offers exist at the same tier, the one offering highest customer savings applies.
 */
const calculateDiscountForItem = (item, activeOffers) => {
  const originalPrice = Number(item.price);
  if (!originalPrice || originalPrice <= 0) {
    return {
      originalPrice,
      discountAmount: 0,
      discountedPrice: originalPrice,
      hasDiscount: false,
      appliedOffer: null
    };
  }

  // 1. Identify applicable active offers for this item
  const matchingOffers = [];

  for (const offer of activeOffers) {
    let isApplicable = false;

    if (offer.offer_type === 'ITEM') {
      isApplicable = offer.menu_offer_items?.some((oi) => oi.item_id === item.id);
    } else if (offer.offer_type === 'CATEGORY') {
      isApplicable = offer.menu_offer_categories?.some((oc) => oc.category_id === item.category_id);
    } else if (offer.offer_type === 'RESTAURANT') {
      isApplicable = true;
    }

    if (isApplicable) {
      const val = Number(offer.discount_value);
      let calcDiscount = 0;

      if (offer.discount_type === 'PERCENTAGE') {
        calcDiscount = (originalPrice * val) / 100;
        if (offer.max_discount_amount && Number(offer.max_discount_amount) > 0) {
          calcDiscount = Math.min(calcDiscount, Number(offer.max_discount_amount));
        }
      } else {
        // FIXED_AMOUNT
        calcDiscount = Math.min(val, originalPrice);
      }

      // Priority rank: ITEM (3) > CATEGORY (2) > RESTAURANT (1)
      const tierRank = offer.offer_type === 'ITEM' ? 3 : offer.offer_type === 'CATEGORY' ? 2 : 1;

      matchingOffers.push({
        offer,
        discountAmount: Math.round(calcDiscount * 100) / 100,
        tierRank
      });
    }
  }

  if (matchingOffers.length === 0) {
    return {
      originalPrice,
      discountAmount: 0,
      discountedPrice: originalPrice,
      hasDiscount: false,
      appliedOffer: null
    };
  }

  // Sort by highest priority tier, then highest discount savings
  matchingOffers.sort((a, b) => {
    if (b.tierRank !== a.tierRank) return b.tierRank - a.tierRank;
    return b.discountAmount - a.discountAmount;
  });

  const best = matchingOffers[0];
  const finalDiscount = Math.min(best.discountAmount, originalPrice);
  const discountedPrice = Math.max(0, Math.round((originalPrice - finalDiscount) * 100) / 100);

  return {
    originalPrice,
    discountAmount: finalDiscount,
    discountedPrice,
    hasDiscount: finalDiscount > 0,
    appliedOffer: {
      id: best.offer.id,
      title: best.offer.title,
      offerType: best.offer.offer_type,
      discountType: best.offer.discount_type,
      discountValue: Number(best.offer.discount_value),
      maxDiscountAmount: best.offer.max_discount_amount ? Number(best.offer.max_discount_amount) : null
    }
  };
};

// ==================== SERVICE HANDLERS ====================

const getOffers = async (userId, userRole, query = {}) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, query.cafeId);
  return await offerRepository.findOffersByCafe(cafe.id, query);
};

const getOfferStats = async (userId, userRole, cafeId = null) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, cafeId);
  const allOffers = await offerRepository.findOffersByCafe(cafe.id);

  const stats = {
    totalOffers: allOffers.length,
    activeOffers: 0,
    scheduledOffers: 0,
    expiredOffers: 0,
    inactiveOffers: 0
  };

  allOffers.forEach((o) => {
    if (o.computed_status === 'ACTIVE') stats.activeOffers++;
    else if (o.computed_status === 'SCHEDULED') stats.scheduledOffers++;
    else if (o.computed_status === 'EXPIRED') stats.expiredOffers++;
    else if (o.computed_status === 'INACTIVE') stats.inactiveOffers++;
  });

  return stats;
};

const getOfferById = async (userId, userRole, id) => {
  const offer = await offerRepository.findOfferById(id);
  if (!offer) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }

  // Authorize cafe ownership
  if (userRole !== 'ADMIN') {
    const userCafes = await cafeRepository.findAllCafes({ owner_id: userId });
    const userCafeIds = (userCafes || []).map((c) => c.id);
    if (!userCafeIds.includes(offer.cafe_id)) {
      const error = new Error('Unauthorized to view this offer');
      error.statusCode = 403;
      throw error;
    }
  }

  return offer;
};

const createOffer = async (userId, userRole, data) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, data.cafeId);

  // Validate dates
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    const error = new Error('Valid start date and end date are required');
    error.statusCode = 400;
    throw error;
  }

  if (end <= start) {
    const error = new Error('End date and time must be after the start date and time');
    error.statusCode = 400;
    throw error;
  }

  // Validate discount value
  const val = Number(data.discountValue);
  if (isNaN(val) || val <= 0) {
    const error = new Error('Discount value must be greater than zero');
    error.statusCode = 400;
    throw error;
  }

  if (data.discountType === 'PERCENTAGE' && val > 100) {
    const error = new Error('Percentage discount cannot exceed 100%');
    error.statusCode = 400;
    throw error;
  }

  // Validate item and category associations belong to this cafe
  let itemIds = Array.isArray(data.itemIds) ? data.itemIds : [];
  let categoryIds = Array.isArray(data.categoryIds) ? data.categoryIds : [];

  if (data.offerType === 'ITEM') {
    if (itemIds.length === 0) {
      const error = new Error('Please select at least one menu item for an item-wise offer');
      error.statusCode = 400;
      throw error;
    }
    const cafeItems = await prisma.menu_items.findMany({
      where: { id: { in: itemIds }, cafe_id: cafe.id },
      select: { id: true, price: true }
    });
    if (cafeItems.length !== itemIds.length) {
      const error = new Error('One or more selected items do not belong to this cafe');
      error.statusCode = 400;
      throw error;
    }
    // Fixed discount sanity check
    if (data.discountType === 'FIXED_AMOUNT') {
      const maxPrice = Math.max(...cafeItems.map((i) => Number(i.price)));
      if (val > maxPrice) {
        const error = new Error(`Fixed discount ₹${val} cannot exceed item price (highest ₹${maxPrice})`);
        error.statusCode = 400;
        throw error;
      }
    }
    categoryIds = [];
  } else if (data.offerType === 'CATEGORY') {
    if (categoryIds.length === 0) {
      const error = new Error('Please select at least one category for a category-wise offer');
      error.statusCode = 400;
      throw error;
    }
    const cafeCats = await prisma.menu_categories.findMany({
      where: { id: { in: categoryIds }, cafe_id: cafe.id },
      select: { id: true }
    });
    if (cafeCats.length !== categoryIds.length) {
      const error = new Error('One or more selected categories do not belong to this cafe');
      error.statusCode = 400;
      throw error;
    }
    itemIds = [];
  } else if (data.offerType === 'RESTAURANT') {
    itemIds = [];
    categoryIds = [];
  }

  const offerData = {
    cafe_id: cafe.id,
    title: data.title.trim(),
    description: data.description ? data.description.trim() : null,
    offer_type: data.offerType,
    discount_type: data.discountType,
    discount_value: val,
    max_discount_amount: data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null,
    applicable_to: data.offerType === 'RESTAURANT' ? 'ALL' : data.offerType,
    start_date: start,
    end_date: end,
    is_active: data.isActive !== undefined ? Boolean(data.isActive) : true
  };

  return await offerRepository.createOffer(offerData, itemIds, categoryIds);
};

const updateOffer = async (userId, userRole, id, data) => {
  const existing = await offerRepository.findOfferById(id);
  if (!existing) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }

  const cafe = await resolveAuthorizedCafe(userId, userRole, existing.cafe_id);

  let start = existing.start_date;
  let end = existing.end_date;

  if (data.startDate) start = new Date(data.startDate);
  if (data.endDate) end = new Date(data.endDate);

  if (end <= start) {
    const error = new Error('End date must be after start date');
    error.statusCode = 400;
    throw error;
  }

  const val = data.discountValue !== undefined ? Number(data.discountValue) : Number(existing.discount_value);
  const discountType = data.discountType || existing.discount_type;

  if (discountType === 'PERCENTAGE' && val > 100) {
    const error = new Error('Percentage discount cannot exceed 100%');
    error.statusCode = 400;
    throw error;
  }

  let itemIds = null;
  let categoryIds = null;

  if (data.offerType === 'ITEM' || (!data.offerType && existing.offer_type === 'ITEM')) {
    if (data.itemIds) {
      itemIds = data.itemIds;
      const cafeItems = await prisma.menu_items.findMany({
        where: { id: { in: itemIds }, cafe_id: cafe.id },
        select: { id: true }
      });
      if (cafeItems.length !== itemIds.length) {
        const error = new Error('One or more selected items do not belong to this cafe');
        error.statusCode = 400;
        throw error;
      }
    }
  } else if (data.offerType === 'CATEGORY' || (!data.offerType && existing.offer_type === 'CATEGORY')) {
    if (data.categoryIds) {
      categoryIds = data.categoryIds;
      const cafeCats = await prisma.menu_categories.findMany({
        where: { id: { in: categoryIds }, cafe_id: cafe.id },
        select: { id: true }
      });
      if (cafeCats.length !== categoryIds.length) {
        const error = new Error('One or more selected categories do not belong to this cafe');
        error.statusCode = 400;
        throw error;
      }
    }
  }

  const offerData = {
    title: data.title ? data.title.trim() : existing.title,
    description: data.description !== undefined ? (data.description ? data.description.trim() : null) : existing.description,
    offer_type: data.offerType || existing.offer_type,
    discount_type: discountType,
    discount_value: val,
    max_discount_amount: data.maxDiscountAmount !== undefined ? (data.maxDiscountAmount ? Number(data.maxDiscountAmount) : null) : existing.max_discount_amount,
    applicable_to: (data.offerType || existing.offer_type) === 'RESTAURANT' ? 'ALL' : (data.offerType || existing.offer_type),
    start_date: start,
    end_date: end,
    is_active: data.isActive !== undefined ? Boolean(data.isActive) : existing.is_active
  };

  return await offerRepository.updateOffer(id, offerData, itemIds, categoryIds);
};

const deleteOffer = async (userId, userRole, id) => {
  const existing = await offerRepository.findOfferById(id);
  if (!existing) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }
  await resolveAuthorizedCafe(userId, userRole, existing.cafe_id);
  return await offerRepository.deleteOffer(id);
};

const updateOfferStatus = async (userId, userRole, id, isActive) => {
  const existing = await offerRepository.findOfferById(id);
  if (!existing) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }
  await resolveAuthorizedCafe(userId, userRole, existing.cafe_id);
  return await offerRepository.updateOfferStatus(id, isActive);
};

const getPublicOffers = async (limit = 20) => {
  return await offerRepository.findPublicActiveOffers(limit);
};

const getPublicCafeOffers = async (cafeId) => {
  const activeOffers = await offerRepository.getActiveOffersForCafe(cafeId);
  return activeOffers.map((o) => ({
    ...o,
    computed_status: 'ACTIVE'
  }));
};

module.exports = {
  getOffers,
  getOfferStats,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
  updateOfferStatus,
  calculateDiscountForItem,
  getPublicOffers,
  getPublicCafeOffers
};

