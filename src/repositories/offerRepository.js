const prisma = require('../config/prisma');

// Determine computed status: DRAFT, SCHEDULED, ACTIVE, EXPIRED, INACTIVE
const computeOfferStatus = (offer) => {
  if (!offer.is_active) return 'INACTIVE';
  const now = new Date();
  const start = new Date(offer.start_date);
  const end = new Date(offer.end_date);

  if (now < start) return 'SCHEDULED';
  if (now > end) return 'EXPIRED';
  return 'ACTIVE';
};

const findOffersByCafe = async (cafeId, filters = {}) => {
  const where = { cafe_id: cafeId };

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  if (filters.offerType && filters.offerType !== 'ALL') {
    where.offer_type = filters.offerType;
  }

  if (filters.offerCategory && filters.offerCategory !== 'ALL') {
    where.offer_category = filters.offerCategory;
  }

  const rawOffers = await prisma.menu_offers.findMany({
    where,
    include: {
      buy_item: {
        select: { id: true, name: true, price: true, image_url: true, food_type: true }
      },
      reward_item: {
        select: { id: true, name: true, price: true, image_url: true, food_type: true }
      },
      menu_offer_items: {
        include: {
          menu_items: {
            select: { id: true, name: true, price: true, image_url: true, food_type: true }
          }
        }
      },
      menu_offer_categories: {
        include: {
          menu_categories: {
            select: { id: true, name: true, image_url: true }
          }
        }
      }
    },
    orderBy: { created_at: 'desc' }
  });

  // Attach dynamic computed status and format
  const offersWithStatus = rawOffers.map((o) => {
    const computedStatus = computeOfferStatus(o);
    return {
      ...o,
      computed_status: computedStatus,
      is_effective_active: computedStatus === 'ACTIVE'
    };
  });

  if (filters.status && filters.status !== 'ALL') {
    return offersWithStatus.filter((o) => o.computed_status === filters.status);
  }

  return offersWithStatus;
};

const findOfferById = async (id, cafeId = null) => {
  const where = { id };
  if (cafeId) where.cafe_id = cafeId;

  const offer = await prisma.menu_offers.findFirst({
    where,
    include: {
      buy_item: {
        select: { id: true, name: true, price: true, image_url: true, food_type: true, is_available: true }
      },
      reward_item: {
        select: { id: true, name: true, price: true, image_url: true, food_type: true, is_available: true }
      },
      menu_offer_items: {
        include: {
          menu_items: {
            select: { id: true, name: true, price: true, image_url: true, food_type: true, is_available: true }
          }
        }
      },
      menu_offer_categories: {
        include: {
          menu_categories: {
            select: { id: true, name: true, image_url: true, is_active: true }
          }
        }
      },
      cafes: {
        select: { id: true, name: true, city: true }
      }
    }
  });

  if (!offer) return null;

  return {
    ...offer,
    computed_status: computeOfferStatus(offer)
  };
};

const createOffer = async (offerData, itemIds = [], categoryIds = []) => {
  return await prisma.$transaction(async (tx) => {
    const offer = await tx.menu_offers.create({
      data: offerData
    });

    // Deduplicate itemIds and categoryIds to avoid unique constraint violations
    const uniqueItemIds = Array.isArray(itemIds) ? Array.from(new Set(itemIds.filter(Boolean))) : [];
    const uniqueCatIds = Array.isArray(categoryIds) ? Array.from(new Set(categoryIds.filter(Boolean))) : [];

    if (uniqueItemIds.length > 0) {
      const itemRows = uniqueItemIds.map((itemId) => ({
        offer_id: offer.id,
        item_id: itemId
      }));
      await tx.menu_offer_items.createMany({ data: itemRows });
    }

    if (uniqueCatIds.length > 0) {
      const catRows = uniqueCatIds.map((catId) => ({
        offer_id: offer.id,
        category_id: catId
      }));
      await tx.menu_offer_categories.createMany({ data: catRows });
    }

    return tx.menu_offers.findUnique({
      where: { id: offer.id },
      include: {
        menu_offer_items: true,
        menu_offer_categories: true
      }
    });
  });
};

const updateOffer = async (id, offerData, itemIds = null, categoryIds = null) => {
  return await prisma.$transaction(async (tx) => {
    const updated = await tx.menu_offers.update({
      where: { id },
      data: offerData
    });

    if (itemIds !== null) {
      await tx.menu_offer_items.deleteMany({ where: { offer_id: id } });
      const uniqueItemIds = Array.isArray(itemIds) ? Array.from(new Set(itemIds.filter(Boolean))) : [];
      if (uniqueItemIds.length > 0) {
        await tx.menu_offer_items.createMany({
          data: uniqueItemIds.map((itemId) => ({ offer_id: id, item_id: itemId }))
        });
      }
    }

    if (categoryIds !== null) {
      await tx.menu_offer_categories.deleteMany({ where: { offer_id: id } });
      const uniqueCatIds = Array.isArray(categoryIds) ? Array.from(new Set(categoryIds.filter(Boolean))) : [];
      if (uniqueCatIds.length > 0) {
        await tx.menu_offer_categories.createMany({
          data: uniqueCatIds.map((catId) => ({ offer_id: id, category_id: catId }))
        });
      }
    }

    return tx.menu_offers.findUnique({
      where: { id },
      include: {
        menu_offer_items: true,
        menu_offer_categories: true
      }
    });
  });
};

const deleteOffer = async (id) => {
  return await prisma.menu_offers.delete({
    where: { id }
  });
};

const updateOfferStatus = async (id, isActive) => {
  return await prisma.menu_offers.update({
    where: { id },
    data: { is_active: Boolean(isActive) }
  });
};

// Fetch currently active offers for a cafe to apply pricing dynamically
const getActiveOffersForCafe = async (cafeId) => {
  const now = new Date();
  const offers = await prisma.menu_offers.findMany({
    where: {
      cafe_id: cafeId,
      is_active: true,
      start_date: { lte: now },
      end_date: { gte: now }
    },
    include: {
      buy_item: {
        select: { id: true, name: true, price: true, image_url: true, food_type: true, is_available: true }
      },
      reward_item: {
        select: { id: true, name: true, price: true, image_url: true, food_type: true, is_available: true }
      },
      menu_offer_items: true,
      menu_offer_categories: true
    },
    orderBy: { created_at: 'desc' }
  });

  return offers;
};

// Public discoverable active offers across cafes
const findPublicActiveOffers = async (limit = 30, offerCategory = null) => {
  const now = new Date();
  const where = {
    is_active: true,
    start_date: { lte: now },
    end_date: { gte: now },
    cafes: { status: { in: ['APPROVED', 'ACTIVE'] } }
  };

  if (offerCategory && offerCategory !== 'ALL') {
    where.offer_category = offerCategory;
  }

  const offers = await prisma.menu_offers.findMany({
    where,
    include: {
      cafes: {
        select: { id: true, name: true, city: true, cover_image: true, category: true }
      },
      buy_item: {
        select: { id: true, name: true, price: true, image_url: true, food_type: true }
      },
      reward_item: {
        select: { id: true, name: true, price: true, image_url: true, food_type: true }
      },
      menu_offer_items: {
        include: {
          menu_items: {
            select: { id: true, name: true, price: true, image_url: true, food_type: true }
          }
        }
      },
      menu_offer_categories: {
        include: {
          menu_categories: {
            select: { id: true, name: true, image_url: true }
          }
        }
      }
    },
    orderBy: { created_at: 'desc' },
    take: limit
  });

  return offers.map((o) => ({
    ...o,
    computed_status: 'ACTIVE'
  }));
};

module.exports = {
  findOffersByCafe,
  findOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
  updateOfferStatus,
  getActiveOffersForCafe,
  findPublicActiveOffers,
  computeOfferStatus
};

