const cafeRepository = require('../repositories/cafeRepository');
const cafePackageRepository = require('../repositories/cafePackageRepository');
const userRepository = require('../repositories/userRepository');
const { syncVendorToCashfree } = require('./cashfreeVendorService');

// --- Cafe Services ---

const createCafe = async (userId, cafeData) => {
  const existingCount = await cafeRepository.countCafesByOwner(userId);
  if (existingCount >= 3) {
    const error = new Error('You have reached the maximum limit of 3 cafes.');
    error.statusCode = 400;
    throw error;
  }

  const { business_hours, ...validCafeData } = cafeData;
  
  let cafe = await cafeRepository.createCafe({
    ...validCafeData,
    owner_id: userId,
  });

  if (business_hours) {
    await cafeRepository.updateCafeBusinessHours(cafe.id, business_hours);
  }

  // Sync cafe details to owner user profile (business_name, description, address, city) if not set or on creation
  try {
    const prisma = require('../config/prisma');
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (user) {
      const userUpdate = {};
      if (!user.business_name && validCafeData.name) userUpdate.business_name = validCafeData.name;
      if (!user.description && validCafeData.description) userUpdate.description = validCafeData.description;
      if (!user.address && validCafeData.address) userUpdate.address = validCafeData.address;
      if (!user.city && validCafeData.city) userUpdate.city = validCafeData.city;
      if (!user.profile_image && validCafeData.cover_image) userUpdate.profile_image = validCafeData.cover_image;

      if (Object.keys(userUpdate).length > 0) {
        await prisma.users.update({ where: { id: userId }, data: userUpdate });
      }
    }
  } catch (err) {
    console.error('Failed to sync user profile on cafe creation:', err.message);
  }

  // Attempt Cashfree Vendor creation & assign vendor_id / vendor_status
  try {
    const user = await userRepository.findUserById(userId);
    if (user) {
      const syncResult = await syncVendorToCashfree(user, 'CAFE', cafe.id);
      if (syncResult.vendorId) {
        cafe.payment_account_id = syncResult.vendorId;
        cafe.razorpay_account_status = syncResult.status || 'PENDING_BANK_DETAILS';
      }
    }
  } catch (err) {
    console.error('Failed to sync Cashfree vendor on cafe creation:', err.message);
  }

  return cafe;
};

const getAllCafes = async (query = {}) => {
  return await cafeRepository.findAllCafes(query);
};

const getCafeById = async (id) => {
  const cafe = await cafeRepository.findCafeById(id);
  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }
  return cafe;
};

const updateCafe = async (userId, cafeId, updateData, userRole = 'CAFE_OWNER') => {
  const cafe = await getCafeById(cafeId);

  console.log('updateCafe: userId =', userId, typeof userId, 'cafe.owner_id =', cafe.owner_id, typeof cafe.owner_id);

  if (userRole !== 'ADMIN' && String(cafe.owner_id).trim().toLowerCase() !== String(userId).trim().toLowerCase()) {
    require('fs').writeFileSync('last_auth_error.json', JSON.stringify({ userId, cafeOwnerId: cafe.owner_id, cafeId }, null, 2));
    const error = new Error('Unauthorized to update this cafe');
    error.statusCode = 403;
    throw error;
  }

  // Filter out non-cafe fields like business_hours, rejection_reason, is_featured, email, phone
  const { business_hours, rejection_reason, is_featured, email, phone, ...validUpdateData } = updateData;

  let result = await cafeRepository.updateCafe(cafeId, validUpdateData);
  
  // If email or phone provided, update owner user profile
  if (email || phone) {
    try {
      const prisma = require('../config/prisma');
      const userUpdate = {};
      if (email) userUpdate.email = email;
      if (phone) userUpdate.phone = phone;
      await prisma.users.update({
        where: { id: cafe.owner_id },
        data: userUpdate
      });
    } catch (err) {
      console.error('Failed to sync user contact details on cafe update:', err.message);
    }
  }

  // If business_hours is provided in the main update payload, save it too
  if (business_hours) {
    await cafeRepository.updateCafeBusinessHours(cafeId, business_hours);
  }
  
  return result;
};

const deleteCafe = async (userId, cafeId) => {
  const cafe = await getCafeById(cafeId);

  if (String(cafe.owner_id).trim().toLowerCase() !== String(userId).trim().toLowerCase()) {
    const error = new Error('Unauthorized to delete this cafe');
    error.statusCode = 403;
    throw error;
  }

  return await cafeRepository.deleteCafe(cafeId);
};

const updateCafeBusinessHours = async (userId, cafeId, businessHours) => {
  const cafe = await getCafeById(cafeId);

  if (String(cafe.owner_id).trim().toLowerCase() !== String(userId).trim().toLowerCase()) {
    const error = new Error('Unauthorized to update this cafe');
    error.statusCode = 403;
    throw error;
  }

  return await cafeRepository.updateCafeBusinessHours(cafeId, businessHours);
};

// --- Cafe Package Services ---

const getPackageById = async (packageId) => {
  const pkg = await cafePackageRepository.findPackageById(packageId);
  if (!pkg) {
    const error = new Error('Package not found');
    error.statusCode = 404;
    throw error;
  }
  return pkg;
};

const addPackageToCafe = async (userId, cafeId, packageData) => {
  const cafe = await getCafeById(cafeId);

  if (String(cafe.owner_id).trim().toLowerCase() !== String(userId).trim().toLowerCase()) {
    const error = new Error('Unauthorized to add package to this cafe');
    error.statusCode = 403;
    throw error;
  }

  // Extract non-column fields so Prisma doesn't throw Unknown argument error
  const { 
    cover_image, 
    gallery,
    event_type, 
    status, 
    food, 
    cake, 
    decoration, 
    music, 
    other, 
    custom_category,
    terms,
    availableDays,
    inclusions, 
    package_name,
    description,
    price,
    minimum_persons,
    maximum_persons,
    duration_hours,
    is_active
  } = packageData;

  // Bundle inclusions
  const mergedInclusions = {
    ...(inclusions || {}),
    event_type: event_type || custom_category || undefined,
    custom_category: custom_category || undefined,
    status: status || 'ACTIVE',
    food: food !== undefined ? Boolean(food) : false,
    cake: cake !== undefined ? Boolean(cake) : false,
    decoration: decoration !== undefined ? Boolean(decoration) : false,
    music: music !== undefined ? Boolean(music) : false,
    other: other !== undefined ? Boolean(other) : false,
  };

  const validPrismaData = {
    cafe_id: cafeId,
    package_name: package_name || 'Event Package',
    description: description || null,
    price: price !== undefined && price !== null ? Number(price) : 0,
    minimum_persons: minimum_persons ? Number(minimum_persons) : null,
    maximum_persons: maximum_persons ? Number(maximum_persons) : null,
    duration_hours: duration_hours ? Number(duration_hours) : null,
    cover_image: cover_image || null,
    gallery: gallery || null,
    is_active: is_active !== undefined ? Boolean(is_active) : true,
    inclusions: mergedInclusions,
  };

  const newPackage = await cafePackageRepository.createPackage(validPrismaData);

  if (cover_image) {
    await cafePackageRepository.upsertPackageMedia(newPackage.id, cover_image);
    newPackage.cover_image = cover_image;
  }

  return newPackage;
};

const updatePackage = async (userId, packageId, updateData) => {
  const pkg = await cafePackageRepository.findPackageById(packageId);
  if (!pkg) {
    const error = new Error('Package not found');
    error.statusCode = 404;
    throw error;
  }

  const cafe = await getCafeById(pkg.cafe_id);
  if (String(cafe.owner_id).trim().toLowerCase() !== String(userId).trim().toLowerCase()) {
    const error = new Error('Unauthorized to update this package');
    error.statusCode = 403;
    throw error;
  }

  const { 
    cover_image, 
    gallery,
    event_type, 
    status, 
    food, 
    cake, 
    decoration, 
    music, 
    other, 
    custom_category,
    terms,
    availableDays,
    inclusions, 
    package_name,
    description,
    price,
    minimum_persons,
    maximum_persons,
    duration_hours,
    is_active
  } = updateData;

  const mergedInclusions = {
    ...(typeof pkg.inclusions === 'object' && pkg.inclusions !== null ? pkg.inclusions : {}),
    ...(inclusions || {}),
  };
  
  if (event_type !== undefined) mergedInclusions.event_type = event_type;
  if (custom_category !== undefined) mergedInclusions.custom_category = custom_category;
  if (status !== undefined) mergedInclusions.status = status;
  if (food !== undefined) mergedInclusions.food = Boolean(food);
  if (cake !== undefined) mergedInclusions.cake = Boolean(cake);
  if (decoration !== undefined) mergedInclusions.decoration = Boolean(decoration);
  if (music !== undefined) mergedInclusions.music = Boolean(music);
  if (other !== undefined) mergedInclusions.other = Boolean(other);

  const validPrismaUpdate = { inclusions: mergedInclusions };
  if (package_name !== undefined) validPrismaUpdate.package_name = package_name;
  if (description !== undefined) validPrismaUpdate.description = description;
  if (price !== undefined) validPrismaUpdate.price = Number(price);
  if (minimum_persons !== undefined) validPrismaUpdate.minimum_persons = minimum_persons ? Number(minimum_persons) : null;
  if (maximum_persons !== undefined) validPrismaUpdate.maximum_persons = maximum_persons ? Number(maximum_persons) : null;
  if (duration_hours !== undefined) validPrismaUpdate.duration_hours = duration_hours ? Number(duration_hours) : null;
  if (cover_image !== undefined) validPrismaUpdate.cover_image = cover_image;
  if (gallery !== undefined) validPrismaUpdate.gallery = gallery;
  if (is_active !== undefined) validPrismaUpdate.is_active = Boolean(is_active);

  const updatedPackage = await cafePackageRepository.updatePackage(packageId, validPrismaUpdate);

  if (cover_image !== undefined) {
    await cafePackageRepository.upsertPackageMedia(packageId, cover_image);
    updatedPackage.cover_image = cover_image;
  }

  return updatedPackage;
};

const deletePackage = async (userId, packageId) => {
  const pkg = await cafePackageRepository.findPackageById(packageId);
  if (!pkg) {
    const error = new Error('Package not found');
    error.statusCode = 404;
    throw error;
  }

  const cafe = await getCafeById(pkg.cafe_id);
  if (String(cafe.owner_id).trim().toLowerCase() !== String(userId).trim().toLowerCase()) {
    const error = new Error('Unauthorized to delete this package');
    error.statusCode = 403;
    throw error;
  }

  return await cafePackageRepository.deletePackage(packageId);
};

// --- Cafe Payment Account & Bank Verification Services ---

const linkedAccountService = require('./linkedAccountService');
const prisma = require('../config/prisma');

const getCafePaymentAccount = async (userId, cafeId) => {
  let cafe;
  if (cafeId && cafeId !== 'my-cafe') {
    cafe = await prisma.cafes.findUnique({ where: { id: cafeId } });
  } else {
    cafe = await prisma.cafes.findFirst({
      where: { owner_id: userId }
    });
  }

  if (!cafe) {
    const user = await userRepository.findUserById(userId);
    return {
      cafeId: null,
      linkedAccountId: 'NOT_CREATED',
      cashfreeVendorId: 'NOT_CREATED',
      cashfreeVendorStatus: 'NOT_STARTED',
      bankVerificationStatus: 'NOT_STARTED',
      settlementStatus: 'DISABLED',
      accountHolderName: user?.business_name || user?.name || '',
      maskedBankAccount: 'Not Configured',
      bankAccountLast4: null,
      ifsc: 'Not Configured',
      email: user?.email || '',
      phone: user?.phone || '',
      bankVerifiedAt: null,
      verificationReference: null
    };
  }

  if (String(cafe.owner_id).trim().toLowerCase() !== String(userId).trim().toLowerCase()) {
    const error = new Error('Unauthorized to access payment account for this cafe');
    error.statusCode = 403;
    throw error;
  }

  const isVerified = String(cafe.bank_verification_status || '').toUpperCase() === 'VERIFIED';
  const accountId = cafe.payment_account_id || cafe.razorpay_linked_account_id || cafe.razorpay_account_id;
  const settlementStatus = isVerified ? 'ENABLED' : 'DISABLED';

  const user = await userRepository.findUserById(userId);

  return {
    cafeId: cafe.id,
    bankVerificationStatus: cafe.bank_verification_status || 'PENDING',
    isVerified: isVerified,
    settlementStatus: settlementStatus,
    accountHolderName: cafe.bank_account_holder || '',
    maskedBankAccount: cafe.bank_account_last4 ? `XXXX XXXX ${cafe.bank_account_last4}` : 'Not Configured',
    bankAccountLast4: cafe.bank_account_last4 || null,
    bankVerifiedAt: cafe.bank_verified_at || null,
  };
};

const updateCafePaymentAccount = async (userId, cafeId, bankPayload) => {
  let cafe;
  if (cafeId && cafeId !== 'my-cafe') {
    cafe = await getCafeById(cafeId);
  } else {
    cafe = await prisma.cafes.findFirst({
      where: { owner_id: userId }
    });
  }

  if (!cafe) {
    const user = await userRepository.findUserById(userId);
    cafe = await prisma.cafes.create({
      data: {
        owner_id: userId,
        name: user?.business_name || `${user?.name || 'Owner'}'s Cafe`,
        status: 'DRAFT'
      }
    });
  }

  if (String(cafe.owner_id).trim().toLowerCase() !== String(userId).trim().toLowerCase()) {
    const error = new Error('Unauthorized to update payment account for this cafe');
    error.statusCode = 403;
    throw error;
  }

  const accountHolder = bankPayload.accountHolderName || bankPayload.account_holder_name || bankPayload.account_holder || bankPayload.accountHolder;
  const accountNumber = bankPayload.bankAccountNumber || bankPayload.account_number || bankPayload.accountNumber;
  const confirmAccountNumber = bankPayload.confirmBankAccountNumber || bankPayload.confirm_account_number || bankPayload.confirmAccountNumber || accountNumber;
  const ifsc = bankPayload.ifscCode || bankPayload.ifsc_code || bankPayload.ifsc;
  const phone = bankPayload.phoneNumber || bankPayload.phone_number || bankPayload.phone;
  const email = bankPayload.email || bankPayload.email_address || bankPayload.emailAddress;

  const user = await userRepository.findUserById(userId);

  const verificationResult = await linkedAccountService.updateBankDetailsAndVerify({
    user,
    vendorType: 'CAFE',
    entityId: cafe.id,
    accountNumber,
    confirmAccountNumber,
    accountHolder,
    ifsc,
    phone: phone || user?.phone,
    email: email || user?.email
  });

  return {
    cafeId: cafe.id,
    linkedAccountId: verificationResult.accountId,
    cashfreeVendorId: cafe.payment_account_id || verificationResult.accountId,
    cashfreeVendorStatus: verificationResult.success ? 'ACTIVE' : 'PENDING_BANK_DETAILS',
    bankVerificationStatus: verificationResult.bankVerificationStatus,
    settlementStatus: verificationResult.success ? 'ENABLED' : 'DISABLED',
    accountHolderName: verificationResult.bankAccountHolder,
    maskedBankAccount: verificationResult.maskedAccountNumber,
    bankAccountLast4: verificationResult.bankAccountLast4,
    ifsc: verificationResult.bankIfsc,
    bankVerifiedAt: verificationResult.success ? new Date() : null,
    verificationReference: verificationResult.referenceId,
    message: verificationResult.message
  };
};

module.exports = {
  createCafe,
  getAllCafes,
  getCafeById,
  updateCafe,
  deleteCafe,
  getPackageById,
  addPackageToCafe,
  updatePackage,
  deletePackage,
  updateCafeBusinessHours,
  getCafePaymentAccount,
  updateCafePaymentAccount,
};

