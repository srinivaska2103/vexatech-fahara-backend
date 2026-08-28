const favoriteService = require('../services/favoriteService');

const getFavorites = async (req, res, next) => {
  try {
    const data = await favoriteService.getFavorites(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getFavoriteIds = async (req, res, next) => {
  try {
    const data = await favoriteService.getFavoriteIds(req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const toggleFavorite = async (req, res, next) => {
  try {
    const { cafeId } = req.body;
    const targetCafeId = cafeId || req.params.cafeId;
    const result = await favoriteService.toggleFavorite(req.user.id, targetCafeId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFavorites,
  getFavoriteIds,
  toggleFavorite,
};
