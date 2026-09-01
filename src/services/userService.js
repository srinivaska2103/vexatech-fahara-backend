const userRepository = require('../repositories/userRepository');
const bcrypt = require('bcryptjs');

const registerUser = async (userData) => {
  const { email, password } = userData;

  // Check if user exists
  const existingUser = await userRepository.findUserByEmail(email);
  if (existingUser) {
    const error = new Error('User already exists');
    error.statusCode = 400;
    throw error;
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Create user
  const newUser = await userRepository.createUser({
    email,
    password_hash: hashedPassword,
  });

  return {
    id: newUser.id,
    email: newUser.email,
  };
};

const maskBankAccount = (accountNumber) => {
  if (!accountNumber) return null;
  if (accountNumber.length <= 4) return accountNumber;
  return `XXXX-XXXX-XXXX-${accountNumber.slice(-4)}`;
};

const sanitizeUser = (user, reqUser) => {
  if (!user) return user;
  const { 
    password_hash, 
    account_number, 
    ifsc_code, 
    bank_name, 
    bank_account_holder, 
    bank_ifsc, 
    bank_account_last4, 
    bank_verified_at, 
    bank_verification_reference, 
    razorpay_account_id, 
    razorpay_linked_account_id, 
    ...safeUser 
  } = user;

  const roleName = reqUser?.roles?.name || reqUser?.role;
  if (roleName === 'ADMIN') {
    return {
      ...safeUser,
      account_number,
      ifsc_code,
      bank_name,
      bank_account_holder,
      bank_ifsc,
      bank_account_last4,
      bank_verified_at,
      bank_verification_reference,
      razorpay_account_id,
      razorpay_linked_account_id
    };
  }

  return safeUser;
};

const getAllUsers = async (query, reqUser) => {
  const users = await userRepository.findAllUsers(query);
  return users.map(user => sanitizeUser(user, reqUser));
};

const getUserById = async (id, reqUser) => {
  const targetId = (id === 'me' || !id || id === 'undefined' || id === 'null') ? reqUser?.id : id;
  let user = targetId ? await userRepository.findUserById(targetId) : null;
  
  if (!user && reqUser?.id) {
    user = await userRepository.findUserById(reqUser.id);
  }

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  return sanitizeUser(user, reqUser);
};

const updateUserStatus = async (id, statusData) => {
  const { status, rejection_reason } = statusData;

  if (status === 'DELETED') {
    // Perform complete hard deletion of user and all related records from DB
    return await deleteUserAccount(id);
  }

  const updateData = { status };
  const updatedUser = await userRepository.updateUser(id, updateData);
  
  if (updatedUser) {
    // Optionally notify the user via notification service
    const notificationService = require('./notificationService');
    const emailService = require('../utils/emailService');
    
    let title = 'Account Update';
    let message = `Your account status has been updated to ${status}.`;
    let shouldSendEmail = false;
    
    if (status === 'REJECTED') {
      title = 'KYC Verification Rejected';
      message = `Your business verification was rejected. Reason: ${rejection_reason || 'Not specified'}`;
      shouldSendEmail = true;
    } else if (status === 'ACTIVE') {
      title = 'KYC Verification Approved';
      message = 'Your business profile is now active on Fahara!';
      shouldSendEmail = true;
    } else if (status === 'SUSPENDED') {
      title = 'Account Suspended';
      message = 'Your account has been suspended by the administrator. Please contact support for more details.';
      shouldSendEmail = true;
    }

    try {
      await notificationService.notifyUser(
        id, 
        title, 
        message, 
        'SYSTEM_UPDATE', 
        null
      );
    } catch (e) {
      console.log('Failed to notify user on status change', e);
    }

    if (shouldSendEmail) {
      try {
        const userRoles = updatedUser.roles ? (Array.isArray(updatedUser.roles) ? updatedUser.roles.map(r => r.name) : [updatedUser.roles.name]) : [];
        let roleName = 'Partner';
        if (userRoles.includes('CAFE_OWNER')) roleName = 'Cafe Owner';
        else if (userRoles.includes('EVENT_MANAGER')) roleName = 'Event Manager';

        if (status === 'REJECTED') {
          await emailService.sendEntityRejectedEmail(
            updatedUser.email,
            updatedUser.name,
            roleName,
            updatedUser.business_name || updatedUser.name || roleName,
            rejection_reason || 'Does not satisfy platform requirements'
          );
        } else {
          await emailService.sendAccountStatusEmail(
            updatedUser.email, 
            updatedUser.name, 
            title, 
            message, 
            status, 
            rejection_reason,
            roleName
          );
        }
      } catch (e) {
        console.log('Failed to send email to user on status change', e);
      }
    }
  }

  return sanitizeUser(updatedUser, { role: 'ADMIN' });
};

const deleteUserAccount = async (userId) => {
  const prisma = require('../config/prisma');

  const existing = await prisma.users.findUnique({ where: { id: userId } });
  if (!existing) {
    const error = new Error('User account not found');
    error.statusCode = 404;
    throw error;
  }

  // 1. Direct user-linked records
  await prisma.favorites.deleteMany({ where: { user_id: userId } });
  await prisma.notifications.deleteMany({ where: { user_id: userId } });
  await prisma.reviews.deleteMany({ where: { customer_id: userId } });
  await prisma.user_devices.deleteMany({ where: { user_id: userId } });
  await prisma.security_sessions.deleteMany({ where: { user_id: userId } });
  await prisma.login_history.deleteMany({ where: { user_id: userId } });
  await prisma.customer_notes.deleteMany({
    where: { OR: [{ customer_id: userId }, { owner_id: userId }] }
  });
  await prisma.event_business_hours.deleteMany({ where: { user_id: userId } });
  await prisma.event_management_profiles.deleteMany({ where: { user_id: userId } });

  // 2. Event services owned by user & their reviews / bookings
  const userEventServices = await prisma.event_services.findMany({ where: { user_id: userId }, select: { id: true } });
  const eventServiceIds = userEventServices.map(s => s.id);
  if (eventServiceIds.length > 0) {
    await prisma.reviews.deleteMany({ where: { event_service_id: { in: eventServiceIds } } });
    await prisma.bookings.updateMany({
      where: { event_service_id: { in: eventServiceIds } },
      data: { event_service_id: null }
    });
    await prisma.event_services.deleteMany({ where: { user_id: userId } });
  }

  // 3. Cafes owned by user & their packages, hours, reviews, bookings
  const userCafes = await prisma.cafes.findMany({ where: { owner_id: userId }, select: { id: true } });
  const cafeIds = userCafes.map(c => c.id);
  if (cafeIds.length > 0) {
    await prisma.cafe_packages.deleteMany({ where: { cafe_id: { in: cafeIds } } });
    await prisma.cafe_business_hours.deleteMany({ where: { cafe_id: { in: cafeIds } } });
    await prisma.reviews.deleteMany({ where: { cafe_id: { in: cafeIds } } });
    await prisma.favorites.deleteMany({ where: { cafe_id: { in: cafeIds } } });
    
    const cafeBookings = await prisma.bookings.findMany({ where: { cafe_id: { in: cafeIds } }, select: { id: true } });
    const cafeBookingIds = cafeBookings.map(b => b.id);
    if (cafeBookingIds.length > 0) {
      await prisma.notifications.deleteMany({ where: { booking_id: { in: cafeBookingIds } } });
      await prisma.payments.deleteMany({ where: { booking_id: { in: cafeBookingIds } } });
      await prisma.reviews.deleteMany({ where: { booking_id: { in: cafeBookingIds } } });
      await prisma.bookings.deleteMany({ where: { cafe_id: { in: cafeIds } } });
    }
    await prisma.cafes.deleteMany({ where: { owner_id: userId } });
  }

  // 4. Bookings where customer is userId
  const customerBookings = await prisma.bookings.findMany({ where: { customer_id: userId }, select: { id: true } });
  const bookingIds = customerBookings.map(b => b.id);
  if (bookingIds.length > 0) {
    await prisma.notifications.deleteMany({ where: { booking_id: { in: bookingIds } } });
    await prisma.payments.deleteMany({ where: { booking_id: { in: bookingIds } } });
    await prisma.reviews.deleteMany({ where: { booking_id: { in: bookingIds } } });
    await prisma.bookings.deleteMany({ where: { customer_id: userId } });
  }

  // 5. Delete OTP verifications for this email
  if (existing.email) {
    await prisma.otp_verifications.deleteMany({ where: { email: existing.email } });
  }

  // 6. Hard delete the user record completely from PostgreSQL
  await prisma.users.delete({
    where: { id: userId }
  });

  return { success: true, message: 'Account deleted successfully' };
};

const updateOnboardingStatus = async (userId, completed) => {
  const isCompleted = Boolean(completed);
  const updatedUser = await userRepository.updateUser(userId, {
    owner_onboarding_completed: isCompleted,
    owner_onboarding_completed_at: isCompleted ? new Date() : null,
  });
  return sanitizeUser(updatedUser, { role: updatedUser.roles?.name });
};

const updateProfile = async (userId, profileData) => {
  const { name, phone, dob, gender, bio, profile_image, profileImage, avatar } = profileData;
  const updatePayload = {};

  const imageVal = profile_image || profileImage || avatar;
  if (imageVal !== undefined) {
    updatePayload.profile_image = imageVal && String(imageVal).trim() ? String(imageVal).trim() : null;
  }

  if (name !== undefined && name !== null) {
    updatePayload.name = String(name).trim();
  }
  
  if (phone !== undefined) {
    updatePayload.phone = phone && String(phone).trim() ? String(phone).trim() : null;
  }
  
  if (gender !== undefined) {
    updatePayload.gender = gender && String(gender).trim() ? String(gender).trim() : null;
  }
  
  if (bio !== undefined) {
    updatePayload.bio = bio && String(bio).trim() ? String(bio).trim() : null;
  }

  if (dob !== undefined && dob !== null && dob !== '') {
    const parsedDate = new Date(dob);
    if (!isNaN(parsedDate.getTime())) {
      updatePayload.dob = parsedDate;
    } else {
      updatePayload.dob = null;
    }
  } else if (dob === '' || dob === null) {
    updatePayload.dob = null;
  }

  const updatedUser = await userRepository.updateUser(userId, updatePayload);
  return sanitizeUser(updatedUser);
};

module.exports = {
  registerUser,
  getAllUsers,
  getUserById,
  updateUserStatus,
  deleteUserAccount,
  updateOnboardingStatus,
  updateProfile,
};

