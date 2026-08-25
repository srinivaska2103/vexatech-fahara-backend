const eventProfileService = require('../services/eventProfileService');

const getProfile = async (req, res, next) => {
  try {
    const result = await eventProfileService.getProfile(req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(200).json({ success: true, data: null });
    }
    next(error);
  }
};

const createProfile = async (req, res, next) => {
  try {
    const result = await eventProfileService.createProfile(req.user.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const fs = require('fs');
const updateProfile = async (req, res, next) => {
  try {
    fs.writeFileSync('last_request_log.json', JSON.stringify({ body: req.body }, null, 2));
    console.log("PUT /me received body:", req.body);
    // Support camelCase businessHours if frontend is sending that
    if (req.body.businessHours && !req.body.business_hours) {
      req.body.business_hours = req.body.businessHours;
      delete req.body.businessHours;
    }
    const result = await eventProfileService.updateProfile(req.user.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    fs.writeFileSync('last_error_log.json', JSON.stringify({ error: error.message }, null, 2));
    next(error);
  }
};

const updateBusinessHours = async (req, res, next) => {
  try {
    const { business_hours, businessHours, event_business_hours, working_hours, workingHours } = req.body;
    
    // Accept various formats from frontend
    const hours = business_hours || businessHours || event_business_hours || working_hours || workingHours;
    
    if (!hours) {
      return res.status(400).json({ success: false, message: 'Business hours data is required' });
    }
    
    const result = await eventProfileService.updateBusinessHours(req.user.id, hours);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updateProfileStatus = async (req, res, next) => {
  try {
    const result = await eventProfileService.updateEventProfileStatus(req.params.userId, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getPaymentAccount = async (req, res, next) => {
  try {
    const result = await eventProfileService.getEventPaymentAccount(req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updatePaymentAccount = async (req, res, next) => {
  try {
    const result = await eventProfileService.updateEventPaymentAccount(req.user.id, req.body);
    res.status(200).json({ success: true, message: result.message, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  createProfile,
  updateProfile,
  updateBusinessHours,
  updateProfileStatus,
  getPaymentAccount,
  updatePaymentAccount
};

