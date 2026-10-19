const eventAvailabilityService = require('../services/eventAvailabilityService');

/**
 * Controller for Event Manager Availability Calendar & Block Management
 */

const getAvailability = async (req, res) => {
  try {
    const { from, to, eventManagerId } = req.query;
    // Derive ID from query (if customer/admin viewing specific manager) or default to authenticated user
    const targetId = eventManagerId || req.user?.id;

    if (!targetId) {
      return res.status(400).json({
        success: false,
        message: 'Event manager ID is required'
      });
    }

    const data = await eventAvailabilityService.getAvailability(targetId, from, to, req.user);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('getEventManagerAvailability Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch event manager availability'
    });
  }
};

const getAvailabilitySummary = async (req, res) => {
  try {
    const userRole = req.user.roles?.name || req.user.role;
    const data = await eventAvailabilityService.getAvailabilitySummary(req.user.id, userRole);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('getEventManagerAvailabilitySummary Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch availability summary'
    });
  }
};

const createBlock = async (req, res) => {
  try {
    const userRole = req.user.roles?.name || req.user.role;
    const result = await eventAvailabilityService.createAvailabilityBlock(req.user, req.body, userRole);

    return res.status(201).json({
      success: true,
      message: 'Availability block created successfully',
      data: result.block,
      hasConflictingBookings: result.hasConflictingBookings,
      conflictingBookingsCount: result.conflictingBookingsCount,
      conflictingBookings: result.conflictingBookings
    });
  } catch (error) {
    console.error('createEventManagerBlock Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create availability block',
      overlappingBlock: error.overlappingBlock
    });
  }
};

const updateBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    const userRole = req.user.roles?.name || req.user.role;
    const result = await eventAvailabilityService.updateAvailabilityBlock(req.user.id, blockId, req.body, userRole);

    return res.status(200).json({
      success: true,
      message: 'Availability block updated successfully',
      data: result.block,
      hasConflictingBookings: result.hasConflictingBookings,
      conflictingBookingsCount: result.conflictingBookingsCount,
      conflictingBookings: result.conflictingBookings
    });
  } catch (error) {
    console.error('updateEventManagerBlock Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update availability block',
      overlappingBlock: error.overlappingBlock
    });
  }
};

const deleteBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    const userRole = req.user.roles?.name || req.user.role;
    const result = await eventAvailabilityService.deleteAvailabilityBlock(req.user.id, blockId, userRole);

    return res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('deleteEventManagerBlock Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to delete availability block'
    });
  }
};

const getCalendarBookings = async (req, res) => {
  try {
    const { from, to } = req.query;
    const userRole = req.user.roles?.name || req.user.role;
    const data = await eventAvailabilityService.getCalendarBookings(req.user.id, from, to, userRole);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('getEventManagerCalendarBookings Error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch calendar bookings'
    });
  }
};

module.exports = {
  getAvailability,
  getAvailabilitySummary,
  createBlock,
  updateBlock,
  deleteBlock,
  getCalendarBookings
};
