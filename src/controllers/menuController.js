const menuService = require('../services/menuService');

// ==================== CATEGORY CONTROLLERS ====================

const getCategories = async (req, res, next) => {
  try {
    const roleName = req.user?.roles?.name || req.user?.role;
    const categories = await menuService.getCategories(req.user.id, roleName, req.query);
    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const roleName = req.user?.roles?.name || req.user?.role;
    const category = await menuService.createCategory(req.user.id, roleName, req.body);
    res.status(201).json({
      success: true,
      message: 'Menu category created successfully',
      data: category
    });
  } catch (error) {
    next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const roleName = req.user?.roles?.name || req.user?.role;
    const category = await menuService.updateCategory(req.user.id, roleName, id, req.body);
    res.status(200).json({
      success: true,
      message: 'Menu category updated successfully',
      data: category
    });
  } catch (error) {
    next(error);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const roleName = req.user?.roles?.name || req.user?.role;
    await menuService.deleteCategory(req.user.id, roleName, id);
    res.status(200).json({
      success: true,
      message: 'Menu category deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

const updateCategoryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const roleName = req.user?.roles?.name || req.user?.role;
    const category = await menuService.updateCategoryStatus(req.user.id, roleName, id, isActive);
    res.status(200).json({
      success: true,
      message: 'Category status updated successfully',
      data: category
    });
  } catch (error) {
    next(error);
  }
};

// ==================== FOOD ITEM CONTROLLERS ====================

const getMenuItems = async (req, res, next) => {
  try {
    const roleName = req.user?.roles?.name || req.user?.role;
    const items = await menuService.getMenuItems(req.user.id, roleName, req.query);
    res.status(200).json({
      success: true,
      data: items
    });
  } catch (error) {
    next(error);
  }
};

const createMenuItem = async (req, res, next) => {
  try {
    const roleName = req.user?.roles?.name || req.user?.role;
    const item = await menuService.createMenuItem(req.user.id, roleName, req.body);
    res.status(201).json({
      success: true,
      message: 'Food item created successfully',
      data: item
    });
  } catch (error) {
    next(error);
  }
};

const updateMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const roleName = req.user?.roles?.name || req.user?.role;
    const item = await menuService.updateMenuItem(req.user.id, roleName, id, req.body);
    res.status(200).json({
      success: true,
      message: 'Food item updated successfully',
      data: item
    });
  } catch (error) {
    next(error);
  }
};

const deleteMenuItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const roleName = req.user?.roles?.name || req.user?.role;
    await menuService.deleteMenuItem(req.user.id, roleName, id);
    res.status(200).json({
      success: true,
      message: 'Food item deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

const updateMenuItemAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isAvailable } = req.body;
    const roleName = req.user?.roles?.name || req.user?.role;
    const item = await menuService.updateMenuItemAvailability(req.user.id, roleName, id, isAvailable);
    res.status(200).json({
      success: true,
      message: 'Item availability updated successfully',
      data: item
    });
  } catch (error) {
    next(error);
  }
};

// ==================== OVERVIEW & PUBLIC MENU ====================

const getMenuStats = async (req, res, next) => {
  try {
    const roleName = req.user?.roles?.name || req.user?.role;
    const stats = await menuService.getMenuStats(req.user.id, roleName, req.query.cafeId);
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

const getPublicMenu = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const menu = await menuService.getPublicMenuByCafeId(cafeId);
    res.status(200).json({
      success: true,
      data: menu
    });
  } catch (error) {
    next(error);
  }
};

const getPublicMenuCategories = async (req, res, next) => {
  try {
    const categories = await menuService.getPublicRestaurantMenuCategories();
    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Categories
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryStatus,

  // Food Items
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  updateMenuItemAvailability,

  // Stats & Public Menu
  getMenuStats,
  getPublicMenu,
  getPublicMenuCategories
};

