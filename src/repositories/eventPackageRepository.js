const prisma = require('../config/prisma');

const eventPackageRepository = {
  // Create or Update Event Package
  upsertPackage: async (packageData) => {
    const {
      id,
      provider_id,
      provider_type,
      event_type,
      package_name,
      package_level,
      description,
      base_price,
      package_pricing_mode = 'BASE_ONLY',
      inclusions = [],
      is_active = true,
    } = packageData;

    return await prisma.$transaction(async (tx) => {
      let pkg;
      if (id) {
        pkg = await tx.event_packages.update({
          where: { id },
          data: {
            package_name,
            description,
            base_price,
            package_pricing_mode,
            is_active,
            updated_at: new Date(),
          },
        });
      } else {
        // Upsert by (provider_id, event_type, package_level)
        pkg = await tx.event_packages.upsert({
          where: {
            uq_provider_event_package_level: {
              provider_id,
              event_type,
              package_level,
            },
          },
          update: {
            package_name,
            description,
            base_price,
            package_pricing_mode,
            is_active,
            updated_at: new Date(),
          },
          create: {
            provider_id,
            provider_type,
            event_type,
            package_name,
            package_level,
            description,
            base_price,
            package_pricing_mode,
            is_active,
          },
        });
      }

      // Sync inclusions & tiers if provided
      if (Array.isArray(inclusions)) {
        // Delete existing inclusions & cascades
        await tx.event_package_inclusions.deleteMany({
          where: { package_id: pkg.id },
        });

        for (let idx = 0; idx < inclusions.length; idx++) {
          const inc = inclusions[idx];
          const createdInc = await tx.event_package_inclusions.create({
            data: {
              package_id: pkg.id,
              name: inc.name,
              category: inc.category || inc.name,
              description: inc.description || null,
              pricing_type: inc.pricing_type || 'FIXED',
              unit_price: inc.unit_price || 0,
              quantity: inc.quantity || 1,
              inclusion_type: inc.inclusion_type || (inc.is_optional ? 'OPTIONAL_ADDON' : 'INCLUDED'),
              is_optional: Boolean(inc.is_optional || inc.inclusion_type === 'OPTIONAL_ADDON'),
              is_active: inc.is_active !== false,
              display_order: inc.display_order ?? idx,
            },
          });

          // Create tier records if tiers array is present
          const tiersList = Array.isArray(inc.tiers) ? inc.tiers : [
            { tier_name: 'BASIC', description: inc.basic_desc || inc.description, unit_price: inc.basic_price ?? inc.unit_price ?? 0, pricing_type: inc.pricing_type || 'FIXED' },
            { tier_name: 'STANDARD', description: inc.standard_desc || inc.description, unit_price: inc.standard_price ?? inc.unit_price ?? 0, pricing_type: inc.pricing_type || 'FIXED' },
            { tier_name: 'PREMIUM', description: inc.premium_desc || inc.description, unit_price: inc.premium_price ?? inc.unit_price ?? 0, pricing_type: inc.pricing_type || 'FIXED' },
          ];

          if (tiersList.length > 0) {
            const tierRows = tiersList.map(t => ({
              inclusion_id: createdInc.id,
              tier_name: (t.tier_name || t.tierName || 'STANDARD').toUpperCase(),
              description: t.description || null,
              pricing_type: t.pricing_type || t.pricingType || inc.pricing_type || 'FIXED',
              unit_price: t.unit_price !== undefined ? t.unit_price : (t.unitPrice !== undefined ? t.unitPrice : 0),
              is_active: t.is_active !== false,
            }));

            await tx.event_package_inclusion_tiers.createMany({
              data: tierRows,
            });
          }
        }
      }

      return await tx.event_packages.findUnique({
        where: { id: pkg.id },
        include: {
          inclusions: {
            orderBy: { display_order: 'asc' },
            include: {
              tiers: true,
            },
          },
        },
      });
    });
  },

  // Get All Packages for a Provider
  getPackagesByProvider: async (providerId, providerType) => {
    const where = { provider_id: providerId, is_active: true };
    if (providerType) where.provider_type = providerType;

    return await prisma.event_packages.findMany({
      where,
      include: {
        inclusions: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
          include: {
            tiers: true,
          },
        },
      },
      orderBy: [{ event_type: 'asc' }, { base_price: 'asc' }],
    });
  },

  // Get Packages by Provider and Event Type (BASIC, STANDARD, PREMIUM)
  getPackagesByEvent: async (providerId, eventType) => {
    return await prisma.event_packages.findMany({
      where: {
        provider_id: providerId,
        event_type: eventType,
        is_active: true,
      },
      include: {
        inclusions: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
          include: {
            tiers: true,
          },
        },
      },
      orderBy: { base_price: 'asc' },
    });
  },

  // Get Package by ID
  getPackageById: async (id) => {
    return await prisma.event_packages.findUnique({
      where: { id },
      include: {
        inclusions: {
          where: { is_active: true },
          orderBy: { display_order: 'asc' },
          include: {
            tiers: true,
          },
        },
      },
    });
  },

  // Soft Delete / Archive Package
  deletePackage: async (id) => {
    return await prisma.event_packages.update({
      where: { id },
      data: { is_active: false, updated_at: new Date() },
    });
  },
};

module.exports = eventPackageRepository;
