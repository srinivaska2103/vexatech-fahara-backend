const prisma = require('../config/prisma');

// ==================== CATEGORIES REPOSITORY ====================

const getCategoriesByCafe = async (cafeId, includeInactive = false) => {
  const where = { cafe_id: cafeId };
  if (!includeInactive) {
    where.is_active = true;
  }
  return await prisma.menu_categories.findMany({
    where,
    orderBy: [
      { display_order: 'asc' },
      { created_at: 'asc' }
    ],
    include: {
      _count: {
        select: { menu_items: true }
      }
    }
  });
};

const findCategoryById = async (categoryId) => {
  return await prisma.menu_categories.findUnique({
    where: { id: categoryId },
    include: {
      menu_items: {
        orderBy: [
          { display_order: 'asc' },
          { created_at: 'asc' }
        ]
      }
    }
  });
};

const createCategory = async (categoryData) => {
  return await prisma.menu_categories.create({
    data: categoryData
  });
};

const updateCategory = async (categoryId, updateData) => {
  return await prisma.menu_categories.update({
    where: { id: categoryId },
    data: updateData
  });
};

const deleteCategory = async (categoryId) => {
  return await prisma.menu_categories.delete({
    where: { id: categoryId }
  });
};

const updateCategoryStatus = async (categoryId, isActive) => {
  return await prisma.menu_categories.update({
    where: { id: categoryId },
    data: { is_active: isActive }
  });
};

// ==================== MENU ITEMS REPOSITORY ====================

const getMenuItemsByCafe = async (cafeId, filters = {}) => {
  const where = { cafe_id: cafeId };

  if (filters.categoryId) {
    where.category_id = filters.categoryId;
  }

  if (filters.foodType) {
    where.food_type = filters.foodType.toUpperCase();
  }

  if (filters.isAvailable !== undefined && filters.isAvailable !== null && filters.isAvailable !== '') {
    where.is_available = filters.isAvailable === 'true' || filters.isAvailable === true;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  return await prisma.menu_items.findMany({
    where,
    orderBy: [
      { display_order: 'asc' },
      { created_at: 'asc' }
    ],
    include: {
      menu_categories: {
        select: {
          id: true,
          name: true,
          is_active: true
        }
      }
    }
  });
};

const findMenuItemById = async (itemId) => {
  return await prisma.menu_items.findUnique({
    where: { id: itemId },
    include: {
      menu_categories: true
    }
  });
};

const createMenuItem = async (itemData) => {
  return await prisma.menu_items.create({
    data: itemData,
    include: {
      menu_categories: true
    }
  });
};

const updateMenuItem = async (itemId, updateData) => {
  return await prisma.menu_items.update({
    where: { id: itemId },
    data: updateData,
    include: {
      menu_categories: true
    }
  });
};

const deleteMenuItem = async (itemId) => {
  return await prisma.menu_items.delete({
    where: { id: itemId }
  });
};

const updateMenuItemAvailability = async (itemId, isAvailable) => {
  return await prisma.menu_items.update({
    where: { id: itemId },
    data: { is_available: isAvailable }
  });
};

// ==================== STATS & PUBLIC QUERIES ====================

const getMenuStatsByCafe = async (cafeId) => {
  const [totalCategories, totalItems, availableItems, unavailableItems] = await Promise.all([
    prisma.menu_categories.count({ where: { cafe_id: cafeId } }),
    prisma.menu_items.count({ where: { cafe_id: cafeId } }),
    prisma.menu_items.count({ where: { cafe_id: cafeId, is_available: true } }),
    prisma.menu_items.count({ where: { cafe_id: cafeId, is_available: false } })
  ]);

  return {
    totalCategories,
    totalItems,
    availableItems,
    unavailableItems
  };
};

const getPublicMenuByCafe = async (cafeId) => {
  // Fetch active categories with their menu items
  return await prisma.menu_categories.findMany({
    where: {
      cafe_id: cafeId,
      is_active: true
    },
    orderBy: [
      { display_order: 'asc' },
      { created_at: 'asc' }
    ],
    include: {
      menu_items: {
        orderBy: [
          { display_order: 'asc' },
          { created_at: 'asc' }
        ]
      }
    }
  });
};

const getDistinctActiveMenuCategories = async () => {
  // Group or retrieve distinct active menu categories across active cafes
  const categories = await prisma.menu_categories.findMany({
    where: {
      is_active: true,
      cafes: {
        status: 'ACTIVE'
      },
      menu_items: {
        some: {
          is_available: true
        }
      }
    },
    select: {
      id: true,
      name: true,
      image_url: true,
      cafe_id: true,
      _count: {
        select: {
          menu_items: true
        }
      },
      menu_items: {
        where: { is_available: true },
        take: 1,
        select: { image_url: true }
      }
    },
    orderBy: {
      display_order: 'asc'
    }
  });

  return categories;
};

module.exports = {
  // Categories
  getCategoriesByCafe,
  findCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryStatus,

  // Items
  getMenuItemsByCafe,
  findMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  updateMenuItemAvailability,

  // Stats & Public
  getMenuStatsByCafe,
  getPublicMenuByCafe,
  getDistinctActiveMenuCategories
};

