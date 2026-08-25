const prisma = require('../config/prisma');
const flattenInclusions = (pkg) => {
  if (pkg && pkg.inclusions && typeof pkg.inclusions === 'object') {
    Object.assign(pkg, pkg.inclusions);
  }
  return pkg;
};

const createPackage = async (packageData) => {
  const pkg = await prisma.cafe_packages.create({
    data: packageData,
  });
  return flattenInclusions(pkg);
};

const findPackageById = async (id) => {
  const pkg = await prisma.cafe_packages.findUnique({
    where: { id },
    include: { cafes: true }
  });
  
  if (pkg && pkg.cafes) {
    pkg.cafe = pkg.cafes;
    delete pkg.cafes;
  }
  
  return flattenInclusions(pkg);
};

const updatePackage = async (id, updateData) => {
  const pkg = await prisma.cafe_packages.update({
    where: { id },
    data: updateData,
  });
  return flattenInclusions(pkg);
};

const deletePackage = async (id) => {
  return await prisma.cafe_packages.delete({
    where: { id },
  });
};

// --- Media Support ---
const upsertPackageMedia = async (packageId, fileUrl) => {
  if (!fileUrl) return null;
  
  // Find existing media for this package
  const existing = await prisma.media.findFirst({
    where: { owner_type: 'package', owner_id: packageId }
  });

  if (existing) {
    return await prisma.media.update({
      where: { id: existing.id },
      data: { file_url: fileUrl, file_type: 'image' }
    });
  } else {
    return await prisma.media.create({
      data: {
        owner_type: 'package',
        owner_id: packageId,
        file_url: fileUrl,
        file_type: 'image'
      }
    });
  }
};

const findMediaForPackages = async (packageIds) => {
  if (!packageIds || packageIds.length === 0) return [];
  return await prisma.media.findMany({
    where: {
      owner_type: 'package',
      owner_id: { in: packageIds }
    }
  });
};

module.exports = {
  createPackage,
  findPackageById,
  updatePackage,
  deletePackage,
  upsertPackageMedia,
  findMediaForPackages,
};
