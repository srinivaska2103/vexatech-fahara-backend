const offerService = require('../services/offerService');

const getOffers = async (req, res, next) => {
  try {
    const offers = await offerService.getOffers(req.user.id, req.user.role, req.query);
    res.status(200).json({
      success: true,
      message: 'Offers retrieved successfully',
      data: offers
    });
  } catch (error) {
    next(error);
  }
};

const getOfferStats = async (req, res, next) => {
  try {
    const stats = await offerService.getOfferStats(req.user.id, req.user.role, req.query.cafeId);
    res.status(200).json({
      success: true,
      message: 'Offer statistics retrieved successfully',
      data: stats
    });
  } catch (error) {
    next(error);
  }
};

const getOfferById = async (req, res, next) => {
  try {
    const offer = await offerService.getOfferById(req.user.id, req.user.role, req.params.id);
    res.status(200).json({
      success: true,
      message: 'Offer details retrieved successfully',
      data: offer
    });
  } catch (error) {
    next(error);
  }
};

const createOffer = async (req, res, next) => {
  try {
    const newOffer = await offerService.createOffer(req.user.id, req.user.role, req.body);
    res.status(201).json({
      success: true,
      message: 'Offer created successfully',
      data: newOffer
    });
  } catch (error) {
    next(error);
  }
};

const updateOffer = async (req, res, next) => {
  try {
    const updated = await offerService.updateOffer(req.user.id, req.user.role, req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: 'Offer updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

const deleteOffer = async (req, res, next) => {
  try {
    await offerService.deleteOffer(req.user.id, req.user.role, req.params.id);
    res.status(200).json({
      success: true,
      message: 'Offer deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

const updateOfferStatus = async (req, res, next) => {
  try {
    const updated = await offerService.updateOfferStatus(req.user.id, req.user.role, req.params.id, req.body.isActive);
    res.status(200).json({
      success: true,
      message: `Offer status updated to ${req.body.isActive ? 'active' : 'inactive'}`,
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

// ==================== PUBLIC CUSTOMER CONTROLLERS ====================

const getPublicOffers = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offers = await offerService.getPublicOffers(limit);
    res.status(200).json({
      success: true,
      message: 'Public offers retrieved successfully',
      data: offers
    });
  } catch (error) {
    next(error);
  }
};

const getPublicCafeOffers = async (req, res, next) => {
  try {
    const offers = await offerService.getPublicCafeOffers(req.params.cafeId);
    res.status(200).json({
      success: true,
      message: 'Cafe offers retrieved successfully',
      data: offers
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOffers,
  getOfferStats,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
  updateOfferStatus,
  getPublicOffers,
  getPublicCafeOffers
};

