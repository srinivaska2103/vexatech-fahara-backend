const eventPackageService = require('../services/eventPackageService');

const eventPackageController = {
  createOrUpdatePackage: async (req, res) => {
    try {
      const packageData = req.body;
      // If cafe or event owner, infer provider_id if omitted
      if (!packageData.provider_id && req.user) {
        packageData.provider_id = req.user.id;
      }
      const pkg = await eventPackageService.createOrUpdatePackage(packageData);
      return res.status(200).json({
        success: true,
        message: 'Event package saved successfully',
        data: pkg,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to save event package',
      });
    }
  },

  getPackagesByProvider: async (req, res) => {
    try {
      const { providerId } = req.params;
      const { providerType } = req.query;
      const packages = await eventPackageService.getPackagesByProvider(providerId, providerType);
      return res.status(200).json({
        success: true,
        data: packages,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch provider packages',
      });
    }
  },

  getPackagesByEvent: async (req, res) => {
    try {
      const { providerId, eventType } = req.params;
      const packages = await eventPackageService.getPackagesByEvent(providerId, eventType);
      return res.status(200).json({
        success: true,
        data: packages,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch event packages',
      });
    }
  },

  getPackageById: async (req, res) => {
    try {
      const { id } = req.params;
      const pkg = await eventPackageService.getPackageById(id);
      return res.status(200).json({
        success: true,
        data: pkg,
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        code: 'PACKAGE_NOT_FOUND',
        message: error.message || 'Package not found',
      });
    }
  },

  deletePackage: async (req, res) => {
    try {
      const { id } = req.params;
      await eventPackageService.deletePackage(id);
      return res.status(200).json({
        success: true,
        message: 'Package archived successfully',
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete package',
      });
    }
  },
};

module.exports = eventPackageController;
