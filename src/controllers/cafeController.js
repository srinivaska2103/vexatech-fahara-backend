const cafeService = require('../services/cafeService');
const fs = require('fs');

const createCafe = async (req, res, next) => {
  try {
    const result = await cafeService.createCafe(req.user.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getCafes = async (req, res, next) => {
  try {
    const result = await cafeService.getAllCafes(req.query);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getCafeById = async (req, res, next) => {
  try {
    const result = await cafeService.getCafeById(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updateCafe = async (req, res, next) => {
  try {
    const result = await cafeService.updateCafe(req.user.id, req.params.id, req.body, req.user.roles?.name);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const deleteCafe = async (req, res, next) => {
  try {
    await cafeService.deleteCafe(req.user.id, req.params.id);
    res.status(200).json({ success: true, message: 'Cafe deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const updateBusinessHours = async (req, res, next) => {
  try {
    fs.writeFileSync('last_cafe_business_hours_log.json', JSON.stringify({ body: req.body, params: req.params }, null, 2));
    console.log("PUT /cafe/:id/business-hours received body:", req.body);

    let hours = req.body.business_hours || req.body.working_hrs || req.body.workingHours;
    
    if (!hours && Object.keys(req.body).length > 0) {
        // If it wasn't nested, perhaps the frontend sent the array/object directly
        hours = req.body;
    }

    console.log("Extracted cafe hours to save:", hours);

    const result = await cafeService.updateCafeBusinessHours(req.user.id, req.params.id, hours);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const addPackage = async (req, res, next) => {
  try {
    fs.writeFileSync('last_cafe_package_add_log.json', JSON.stringify({ body: req.body, params: req.params }, null, 2));
    console.log("POST /cafe/:cafeId/packages received body:", req.body);
    
    // Support camelCase coverImage if frontend is sending that
    if (req.body.coverImage && !req.body.cover_image) {
      req.body.cover_image = req.body.coverImage;
      delete req.body.coverImage;
    }

    const result = await cafeService.addPackageToCafe(req.user.id, req.params.cafeId, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updatePackage = async (req, res, next) => {
  try {
    fs.writeFileSync('last_cafe_package_update_log.json', JSON.stringify({ body: req.body, params: req.params }, null, 2));
    console.log("PUT /cafe/packages/:packageId received body:", req.body);

    // Support camelCase coverImage if frontend is sending that
    if (req.body.coverImage && !req.body.cover_image) {
      req.body.cover_image = req.body.coverImage;
      delete req.body.coverImage;
    }

    const result = await cafeService.updatePackage(req.user.id, req.params.packageId, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const deletePackage = async (req, res, next) => {
  try {
    await cafeService.deletePackage(req.user.id, req.params.packageId);
    res.status(200).json({ success: true, message: 'Package deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getPackageById = async (req, res, next) => {
  try {
    const result = await cafeService.getPackageById(req.params.packageId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getPaymentAccount = async (req, res, next) => {
  try {
    const cafeId = req.params.cafeId || req.params.id;
    const result = await cafeService.getCafePaymentAccount(req.user.id, cafeId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updatePaymentAccount = async (req, res, next) => {
  try {
    const cafeId = req.params.cafeId || req.params.id;
    const result = await cafeService.updateCafePaymentAccount(req.user.id, cafeId, req.body);
    res.status(200).json({ success: true, message: result.message, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCafe,
  getCafes,
  getCafeById,
  updateCafe,
  deleteCafe,
  addPackage,
  getPackageById,
  updatePackage,
  deletePackage,
  updateBusinessHours,
  getPaymentAccount,
  updatePaymentAccount,
};

