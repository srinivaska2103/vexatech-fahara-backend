const eventPackageRepository = require('../repositories/eventPackageRepository');

const eventPackageService = {
  createOrUpdatePackage: async (packageData) => {
    if (!packageData.provider_id || !packageData.provider_type || !packageData.event_type) {
      throw new Error('provider_id, provider_type, and event_type are required');
    }
    if (!packageData.package_level) {
      packageData.package_level = 'CUSTOM';
    }
    return await eventPackageRepository.upsertPackage(packageData);
  },

  getPackagesByProvider: async (providerId, providerType) => {
    return await eventPackageRepository.getPackagesByProvider(providerId, providerType);
  },

  getPackagesByEvent: async (providerId, eventType) => {
    return await eventPackageRepository.getPackagesByEvent(providerId, eventType);
  },

  getPackageById: async (id) => {
    const pkg = await eventPackageRepository.getPackageById(id);
    if (!pkg || !pkg.is_active) {
      throw new Error('Package not found or inactive');
    }
    return pkg;
  },

  getAllPackages: async (filters = {}) => {
    return await eventPackageRepository.getAllPackages(filters);
  },

  deletePackage: async (id) => {
    return await eventPackageRepository.deletePackage(id);
  },
};

module.exports = eventPackageService;
