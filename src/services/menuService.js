const offerRepository = require('../repositories/offerRepository');
const { calculateDiscountForItem } = require('./offerService');
const menuRepository = require('../repositories/menuRepository');
const cafeRepository = require('../repositories/cafeRepository');

/**
 * Resolve and authorize cafe for the current user session
 */
const resolveAuthorizedCafe = async (userId, userRole, requestedCafeId = null) => {
  // If user is ADMIN and supplied a cafeId, allow managing that cafe
  if (userRole === 'ADMIN' && requestedCafeId) {
    const cafe = await cafeRepository.findCafeById(requestedCafeId);
    if (!cafe) {
      const error = new Error('Cafe not found');
      error.statusCode = 404;
      throw error;
    }
    return cafe;
  }

  // Find cafe where owner_id = userId
  let cafe = null;
  if (requestedCafeId) {
    cafe = await cafeRepository.findCafeById(requestedCafeId);
    if (cafe && cafe.owner_id !== userId && userRole !== 'ADMIN') {
      const error = new Error('Unauthorized to access this cafe menu');
      error.statusCode = 403;
      throw error;
    }
  }

  if (!cafe) {
    const userCafes = await cafeRepository.findAllCafes({ owner_id: userId, limit: 1 });
    cafe = userCafes && userCafes.length > 0 ? userCafes[0] : null;
  }

  if (!cafe) {
    const error = new Error('No registered cafe or restaurant profile found for this partner account');
    error.statusCode = 404;
    throw error;
  }

  return cafe;
};

// ==================== CATEGORIES SERVICES ====================

const getCategories = async (userId, userRole, query = {}) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, query.cafeId);
  const includeInactive = query.includeInactive === 'true' || query.includeInactive === true;
  return await menuRepository.getCategoriesByCafe(cafe.id, includeInactive);
};

const createCategory = async (userId, userRole, data) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, data.cafeId);

  const categoryData = {
    cafe_id: cafe.id,
    name: data.name.trim(),
    description: data.description ? data.description.trim() : null,
    image_url: data.imageUrl || null,
    display_order: Number.isInteger(data.displayOrder) ? data.displayOrder : 0,
    is_active: data.isActive !== undefined ? Boolean(data.isActive) : true
  };

  return await menuRepository.createCategory(categoryData);
};

const updateCategory = async (userId, userRole, categoryId, data) => {
  const category = await menuRepository.findCategoryById(categoryId);
  if (!category) {
    const error = new Error('Category not found');
    error.statusCode = 404;
    throw error;
  }

  // Authorize cafe ownership
  await resolveAuthorizedCafe(userId, userRole, category.cafe_id);

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.imageUrl !== undefined) updateData.image_url = data.imageUrl;
  if (data.displayOrder !== undefined) updateData.display_order = Number(data.displayOrder);
  if (data.isActive !== undefined) updateData.is_active = Boolean(data.isActive);

  return await menuRepository.updateCategory(categoryId, updateData);
};

const deleteCategory = async (userId, userRole, categoryId) => {
  const category = await menuRepository.findCategoryById(categoryId);
  if (!category) {
    const error = new Error('Category not found');
    error.statusCode = 404;
    throw error;
  }

  await resolveAuthorizedCafe(userId, userRole, category.cafe_id);
  return await menuRepository.deleteCategory(categoryId);
};

const updateCategoryStatus = async (userId, userRole, categoryId, isActive) => {
  const category = await menuRepository.findCategoryById(categoryId);
  if (!category) {
    const error = new Error('Category not found');
    error.statusCode = 404;
    throw error;
  }

  await resolveAuthorizedCafe(userId, userRole, category.cafe_id);
  return await menuRepository.updateCategoryStatus(categoryId, Boolean(isActive));
};

// ==================== FOOD ITEMS SERVICES ====================

const getMenuItems = async (userId, userRole, filters = {}) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, filters.cafeId);
  return await menuRepository.getMenuItemsByCafe(cafe.id, filters);
};

const createMenuItem = async (userId, userRole, data) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, data.cafeId);

  // Validate that the category exists and belongs to the same cafe
  const category = await menuRepository.findCategoryById(data.categoryId);
  if (!category) {
    const error = new Error('Selected menu category does not exist');
    error.statusCode = 400;
    throw error;
  }

  if (category.cafe_id !== cafe.id) {
    const error = new Error('Selected category does not belong to this cafe');
    error.statusCode = 400;
    throw error;
  }

  // Valid food types: VEG, NON_VEG, EGG
  const allowedFoodTypes = ['VEG', 'NON_VEG', 'EGG'];
  const foodType = String(data.foodType || 'VEG').toUpperCase();
  if (!allowedFoodTypes.includes(foodType)) {
    const error = new Error('Invalid food type. Must be VEG, NON_VEG, or EGG');
    error.statusCode = 400;
    throw error;
  }

  const price = Number(data.price);
  if (isNaN(price) || price < 0) {
    const error = new Error('Valid price is required');
    error.statusCode = 400;
    throw error;
  }

  const itemData = {
    cafe_id: cafe.id,
    category_id: category.id,
    name: data.name.trim(),
    description: data.description ? data.description.trim() : null,
    image_url: data.imageUrl || null,
    price: price,
    food_type: foodType,
    is_available: data.isAvailable !== undefined ? Boolean(data.isAvailable) : true,
    preparation_time: data.preparationTime ? parseInt(data.preparationTime) : 15,
    display_order: Number.isInteger(data.displayOrder) ? data.displayOrder : 0,
    is_featured: data.isFeatured !== undefined ? Boolean(data.isFeatured) : false
  };

  return await menuRepository.createMenuItem(itemData);
};

const updateMenuItem = async (userId, userRole, itemId, data) => {
  const item = await menuRepository.findMenuItemById(itemId);
  if (!item) {
    const error = new Error('Menu item not found');
    error.statusCode = 404;
    throw error;
  }

  await resolveAuthorizedCafe(userId, userRole, item.cafe_id);

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description ? data.description.trim() : null;
  if (data.imageUrl !== undefined) updateData.image_url = data.imageUrl;
  if (data.price !== undefined) {
    const price = Number(data.price);
    if (isNaN(price) || price < 0) {
      const error = new Error('Price must be a valid positive number');
      error.statusCode = 400;
      throw error;
    }
    updateData.price = price;
  }
  if (data.foodType !== undefined) {
    const foodType = String(data.foodType).toUpperCase();
    if (!['VEG', 'NON_VEG', 'EGG'].includes(foodType)) {
      const error = new Error('Invalid food type. Must be VEG, NON_VEG, or EGG');
      error.statusCode = 400;
      throw error;
    }
    updateData.food_type = foodType;
  }
  if (data.isAvailable !== undefined) updateData.is_available = Boolean(data.isAvailable);
  if (data.preparationTime !== undefined) updateData.preparation_time = parseInt(data.preparationTime);
  if (data.displayOrder !== undefined) updateData.display_order = Number(data.displayOrder);
  if (data.isFeatured !== undefined) updateData.is_featured = Boolean(data.isFeatured);

  if (data.categoryId && data.categoryId !== item.category_id) {
    const category = await menuRepository.findCategoryById(data.categoryId);
    if (!category || category.cafe_id !== item.cafe_id) {
      const error = new Error('Invalid category specified for this cafe');
      error.statusCode = 400;
      throw error;
    }
    updateData.category_id = data.categoryId;
  }

  return await menuRepository.updateMenuItem(itemId, updateData);
};

const deleteMenuItem = async (userId, userRole, itemId) => {
  const item = await menuRepository.findMenuItemById(itemId);
  if (!item) {
    const error = new Error('Menu item not found');
    error.statusCode = 404;
    throw error;
  }

  await resolveAuthorizedCafe(userId, userRole, item.cafe_id);
  return await menuRepository.deleteMenuItem(itemId);
};

const updateMenuItemAvailability = async (userId, userRole, itemId, isAvailable) => {
  const item = await menuRepository.findMenuItemById(itemId);
  if (!item) {
    const error = new Error('Menu item not found');
    error.statusCode = 404;
    throw error;
  }

  await resolveAuthorizedCafe(userId, userRole, item.cafe_id);
  return await menuRepository.updateMenuItemAvailability(itemId, Boolean(isAvailable));
};

// ==================== STATS & PUBLIC CUSTOMER MENU ====================

const getMenuStats = async (userId, userRole, requestedCafeId = null) => {
  const cafe = await resolveAuthorizedCafe(userId, userRole, requestedCafeId);
  const stats = await menuRepository.getMenuStatsByCafe(cafe.id);
  return {
    cafeId: cafe.id,
    cafeName: cafe.name,
    ...stats
  };
};

const getPublicMenuByCafeId = async (cafeId) => {
  const cafe = await cafeRepository.findCafeById(cafeId);
  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }

  const [categories, activeOffers] = await Promise.all([
    menuRepository.getPublicMenuByCafe(cafe.id),
    offerRepository.getActiveOffersForCafe(cafe.id)
  ]);

  return {
    cafe: {
      id: cafe.id,
      name: cafe.name,
      coverImage: cafe.cover_image,
      city: cafe.city,
      address: cafe.address,
      rating: cafe.average_rating || 0,
      totalReviews: cafe.total_reviews || 0,
      category: cafe.category
    },
    activeOffersCount: activeOffers.length,
    activeOffers: activeOffers.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      offerType: o.offer_type,
      discountType: o.discount_type,
      discountValue: Number(o.discount_value),
      maxDiscountAmount: o.max_discount_amount ? Number(o.max_discount_amount) : null,
      endDate: o.end_date
    })),
    categories: categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      imageUrl: cat.image_url,
      displayOrder: cat.display_order,
      items: cat.menu_items.map(item => {
        // Do not apply discounts to unavailable items
        const pricing = item.is_available 
          ? calculateDiscountForItem(item, activeOffers)
          : {
              originalPrice: Number(item.price),
              discountAmount: 0,
              discountedPrice: Number(item.price),
              hasDiscount: false,
              appliedOffer: null
            };

        const savingsPercent = pricing.hasDiscount && pricing.originalPrice > 0
          ? Math.round((pricing.discountAmount / pricing.originalPrice) * 100)
          : 0;

        return {
          id: item.id,
          name: item.name,
          description: item.description,
          imageUrl: item.image_url,
          price: pricing.discountedPrice, // Authoritative price to show
          originalPrice: pricing.originalPrice,
          discountAmount: pricing.discountAmount,
          discountedPrice: pricing.discountedPrice,
          hasDiscount: pricing.hasDiscount,
          savingsPercent,
          appliedOffer: pricing.appliedOffer,
          foodType: item.food_type,
          isAvailable: item.is_available,
          preparationTime: item.preparation_time,
          displayOrder: item.display_order,
          isFeatured: item.is_featured
        };
      })
    }))
  };
};

// 7. Get Public Restaurant Menu Categories Across All Restaurants
const getPublicRestaurantMenuCategories = async () => {
  const records = await menuRepository.getDistinctActiveMenuCategories();

  // Aggregate by category name (case-insensitive deduplication)
  const categoryMap = new Map();

  for (const r of records) {
    const rawName = (r.name || '').trim();
    if (!rawName) continue;
    const key = rawName.toLowerCase();

    const itemCount = r._count?.menu_items || 1;
    const catImage = r.image_url || r.menu_items?.[0]?.image_url || '/cat_cafes.jpg';

    if (!categoryMap.has(key)) {
      categoryMap.set(key, {
        id: key.replace(/\s+/g, '-'),
        name: rawName,
        imageUrl: catImage,
        itemCount: itemCount,
        cafeIds: [r.cafe_id]
      });
    } else {
      const existing = categoryMap.get(key);
      existing.itemCount += itemCount;
      if (!existing.cafeIds.includes(r.cafe_id)) {
        existing.cafeIds.push(r.cafe_id);
      }
      if (!existing.imageUrl || existing.imageUrl === '/cat_cafes.jpg') {
        existing.imageUrl = catImage;
      }
    }
  }

  return Array.from(categoryMap.values());
};

module.exports = {
  // Category operations
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryStatus,

  // Menu items operations
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  updateMenuItemAvailability,

  // Stats and public views
  getMenuStats,
  getPublicMenuByCafeId,
  getPublicRestaurantMenuCategories
};

