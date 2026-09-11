const eventPackageRepository = require('../repositories/eventPackageRepository');

const eventPackageService = {
  createOrUpdatePackage: async (packageData) => {
    if (!packageData.provider_id || !packageData.provider_type || !packageData.event_type || !packageData.package_level) {
      throw new Error('provider_id, provider_type, event_type, and package_level are required');
    }
    const validLevels = ['BASIC', 'STANDARD', 'PREMIUM'];
    if (!validLevels.includes(packageData.package_level.toUpperCase())) {
      throw new Error('package_level must be BASIC, STANDARD, or PREMIUM');
    }
    packageData.package_level = packageData.package_level.toUpperCase();
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

  deletePackage: async (id) => {
    return await eventPackageRepository.deletePackage(id);
  },
};

module.exports = eventPackageService;
