const availabilityService = require('../services/availabilityService');

/**
 * Controller for Cafe Availability Calendar & Block Management
 */

const getAvailability = async (req, res) => {
  try {
    const { cafeId } = req.params;
    const { from, to } = req.query;

    const data = await availabilityService.getAvailability(cafeId, from, to, req.user);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('getAvailability Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch cafe availability'
    });
  }
};

const getAvailabilitySummary = async (req, res) => {
  try {
    const { cafeId } = req.params;

    const data = await availabilityService.getAvailabilitySummary(cafeId, req.user);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('getAvailabilitySummary Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch availability summary'
    });
  }
};

const createBlock = async (req, res) => {
  try {
    const { cafeId } = req.params;

    const result = await availabilityService.createAvailabilityBlock(cafeId, req.body, req.user);

    return res.status(201).json({
      success: true,
      message: 'Availability block created successfully',
      data: result.block,
      hasConflictingBookings: result.hasConflictingBookings,
      conflictingBookingsCount: result.conflictingBookingsCount,
      conflictingBookings: result.conflictingBookings
    });
  } catch (error) {
    console.error('createBlock Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create availability block',
      overlappingBlock: error.overlappingBlock
    });
  }
};

const updateBlock = async (req, res) => {
  try {
    const { cafeId, blockId } = req.params;

    const result = await availabilityService.updateAvailabilityBlock(cafeId, blockId, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: 'Availability block updated successfully',
      data: result.block,
      hasConflictingBookings: result.hasConflictingBookings,
      conflictingBookingsCount: result.conflictingBookingsCount,
      conflictingBookings: result.conflictingBookings
    });
  } catch (error) {
    console.error('updateBlock Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update availability block',
      overlappingBlock: error.overlappingBlock
    });
  }
};

const deleteBlock = async (req, res) => {
  try {
    const { cafeId, blockId } = req.params;

    const result = await availabilityService.deleteAvailabilityBlock(cafeId, blockId, req.user);

    return res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('deleteBlock Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete availability block'
    });
  }
};

module.exports = {
  getAvailability,
  getAvailabilitySummary,
  createBlock,
  updateBlock,
  deleteBlock
};
