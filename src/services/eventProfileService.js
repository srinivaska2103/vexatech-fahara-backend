const eventProfileRepository = require('../repositories/eventProfileRepository');

const normalizeUrl = (url) => {
  if (url === null || url === undefined) return null;
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const formatProfileResponse = (profile) => {
  if (!profile) return null;
  const website = profile.website_url || null;
  const facebook = profile.facebook_url || null;
  const linkedin = profile.linkedin_url || null;
  const instagram = profile.instagram_url || null;
  const youtube = profile.youtube_url || null;

  return {
    ...profile,
    website_url: website,
    websiteUrl: website,
    website: website,
    facebook_url: facebook,
    facebookUrl: facebook,
    facebook: facebook,
    linkedin_url: linkedin,
    linkedinUrl: linkedin,
    linkedin: linkedin,
    instagram_url: instagram,
    instagramUrl: instagram,
    instagram: instagram,
    social_media_url: instagram || website,
    socialMediaUrl: instagram || website,
    socialUrl: instagram || website,
    youtube_url: youtube,
    youtubeUrl: youtube,
    youtube: youtube
  };
};

const getProfile = async (userId) => {
  const profile = await eventProfileRepository.getProfileByUserId(userId);
  if (!profile) {
    const error = new Error('Event profile not found');
    error.statusCode = 404;
    throw error;
  }
  return formatProfileResponse(profile);
};

const sanitizeProfileInput = (inputData) => {
  const {
    working_hours, workingHours, working_hrs,
    event_business_hours, business_hours, businessHours,
    website_url, websiteUrl, website, site_url,
    facebook_url, facebookUrl, facebook,
    linkedin_url, linkedinUrl, linkedin,
    instagram_url, instagramUrl, instagram, social_media_url, socialMediaUrl, socialUrl,
    youtube_url, youtubeUrl, youtube,
    ...rest
  } = inputData || {};

  const cleanData = { ...rest };

  // Assign normalized URL fields if provided
  const webVal = website_url || websiteUrl || website || site_url;
  if (webVal !== undefined) cleanData.website_url = normalizeUrl(webVal);

  const fbVal = facebook_url || facebookUrl || facebook;
  if (fbVal !== undefined) cleanData.facebook_url = normalizeUrl(fbVal);

  const liVal = linkedin_url || linkedinUrl || linkedin;
  if (liVal !== undefined) cleanData.linkedin_url = normalizeUrl(liVal);

  const instaVal = instagram_url || instagramUrl || instagram || social_media_url || socialMediaUrl || socialUrl;
  if (instaVal !== undefined) cleanData.instagram_url = normalizeUrl(instaVal);

  const ytVal = youtube_url || youtubeUrl || youtube;
  if (ytVal !== undefined) cleanData.youtube_url = normalizeUrl(ytVal);

  return {
    profileData: cleanData,
    hoursToUpdate: working_hours || workingHours || working_hrs || event_business_hours || business_hours || businessHours
  };
};

const createProfile = async (userId, profileDataInput) => {
  // Check if profile already exists
  const existingProfile = await eventProfileRepository.getProfileByUserId(userId);
  if (existingProfile) {
    const error = new Error('Event profile already exists for this user');
    error.statusCode = 400;
    throw error;
  }

  const { profileData, hoursToUpdate } = sanitizeProfileInput(profileDataInput);

  await eventProfileRepository.createProfile({
    ...profileData,
    user_id: userId,
  });

  if (hoursToUpdate) {
    await updateBusinessHours(userId, hoursToUpdate);
  }

  return await getProfile(userId);
};

const updateProfile = async (userId, updateData) => {
  const { profileData, hoursToUpdate } = sanitizeProfileInput(updateData);
  
  // Check if profile exists
  let profile = await eventProfileRepository.getProfileByUserId(userId);
  
  if (!profile) {
    // Auto-create profile if it doesn't exist yet (Upsert pattern)
    await eventProfileRepository.createProfile({
      ...profileData,
      user_id: userId,
      company_name: profileData.company_name || 'My Event Company',
      city: profileData.city || 'Unknown',
      state: profileData.state || 'Unknown',
    });
  } else {
    // Update existing profile
    await eventProfileRepository.updateProfile(userId, profileData);
  }
  
  if (hoursToUpdate) {
    await updateBusinessHours(userId, hoursToUpdate);
  }
  
  return await getProfile(userId);
};

const updateBusinessHours = async (userId, businessHours) => {
  return await eventProfileRepository.updateEventBusinessHours(userId, businessHours);
};

const updateEventProfileStatus = async (userId, statusData) => {
  const { status, verification_status, is_featured, rejection_reason } = statusData;
  const userRepository = require('../repositories/userRepository');

  // Update base user status if provided
  if (status) {
    await userRepository.updateUser(userId, { status });
  }

  // Update event profile fields if provided
  if (verification_status || is_featured !== undefined) {
    const updatePayload = {};
    if (verification_status) updatePayload.verification_status = verification_status;
    if (is_featured !== undefined) updatePayload.is_featured = is_featured;
    
    // Check if profile exists before updating
    const profile = await eventProfileRepository.getProfileByUserId(userId);
    if (profile) {
      await eventProfileRepository.updateProfile(userId, updatePayload);
    }
  }
  
  return { success: true };
};

// --- Event Profile Payment Account & Bank Verification Services ---

const linkedAccountService = require('./linkedAccountService');
const prisma = require('../config/prisma');

const getEventPaymentAccount = async (userId) => {
  let profile = await prisma.event_management_profiles.findUnique({
    where: { user_id: userId }
  });

  if (!profile) {
    const userRepository = require('../repositories/userRepository');
    const user = await userRepository.findUserById(userId);
    profile = await prisma.event_management_profiles.create({
      data: {
        user_id: userId,
        company_name: user?.business_name || user?.name || 'Event Management Company'
      }
    });
  }

  const isVerified = String(profile.bank_verification_status || '').toUpperCase() === 'VERIFIED';
  const accountId = profile.payment_account_id || profile.razorpay_linked_account_id || profile.razorpay_account_id;
  const settlementStatus = isVerified ? 'ENABLED' : 'DISABLED';

  return {
    profileId: profile.id,
    userId: profile.user_id,
    bankVerificationStatus: profile.bank_verification_status || 'PENDING',
    isVerified: isVerified,
    settlementStatus: settlementStatus,
    accountHolderName: profile.bank_account_holder || '',
    maskedBankAccount: profile.bank_account_last4 ? `XXXX XXXX ${profile.bank_account_last4}` : 'Not Configured',
    bankAccountLast4: profile.bank_account_last4 || null,
    bankVerifiedAt: profile.bank_verified_at || null,
  };
};

const updateEventPaymentAccount = async (userId, bankPayload) => {
  let profile = await prisma.event_management_profiles.findUnique({
    where: { user_id: userId }
  });

  const userRepository = require('../repositories/userRepository');
  const user = await userRepository.findUserById(userId);

  if (!profile) {
    profile = await prisma.event_management_profiles.create({
      data: {
        user_id: userId,
        company_name: user?.business_name || user?.name || 'Event Management Company'
      }
    });
  }

  const accountHolder = bankPayload.accountHolderName || bankPayload.account_holder_name || bankPayload.account_holder || bankPayload.accountHolder;
  const accountNumber = bankPayload.bankAccountNumber || bankPayload.account_number || bankPayload.accountNumber;
  const confirmAccountNumber = bankPayload.confirmBankAccountNumber || bankPayload.confirm_account_number || bankPayload.confirmAccountNumber || accountNumber;
  const ifsc = bankPayload.ifscCode || bankPayload.ifsc_code || bankPayload.ifsc;
  const phone = bankPayload.phoneNumber || bankPayload.phone_number || bankPayload.phone;
  const email = bankPayload.email || bankPayload.email_address || bankPayload.emailAddress;

  const verificationResult = await linkedAccountService.updateBankDetailsAndVerify({
    user,
    vendorType: 'EVENT_MANAGER',
    entityId: profile.id,
    accountNumber,
    confirmAccountNumber,
    accountHolder,
    ifsc,
    phone: phone || profile.business_phone || user?.phone,
    email: email || profile.business_email || user?.email
  });

  return {
    profileId: profile.id,
    userId: profile.user_id,
    linkedAccountId: verificationResult.accountId,
    cashfreeVendorId: profile.payment_account_id || verificationResult.accountId,
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
  getProfile,
  createProfile,
  updateProfile,
  updateBusinessHours,
  updateEventProfileStatus,
  getEventPaymentAccount,
  updateEventPaymentAccount
};

