const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const roleRepository = require('../repositories/roleRepository');
const otpRepository = require('../repositories/otpRepository');
const otpUtils = require('../utils/otpUtils');
const jwtUtils = require('../utils/jwtUtils');
const emailService = require('../utils/emailService');

const registerUser = async (userData) => {
  const email = userData.email ? String(userData.email).trim().toLowerCase() : '';
  const { password, name, phone, phoneNumber, roleName } = userData;
  const actualPhone = phone || phoneNumber;

  let existingUser = await userRepository.findUserByEmail(email);
  if (existingUser) {
    const existingRole = (existingUser.roles?.name || '').toUpperCase();
    const isPartner = existingRole === 'CAFE_OWNER' || existingRole === 'EVENT_MANAGER';
    if (isPartner && (roleName || 'CUSTOMER').toUpperCase() === 'CUSTOMER') {
      const error = new Error('An account with this email address is already registered as a Cafe Owner or Event Manager and cannot be registered as a Customer.');
      error.statusCode = 400;
      throw error;
    }

    if (existingUser.email_verified && existingUser.status !== 'DELETED') {
      const error = new Error('An account with this email address already exists.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (actualPhone) {
    const existingPhoneUser = await userRepository.findUserByPhone(actualPhone);
    if (existingPhoneUser && existingPhoneUser.id !== existingUser?.id && existingPhoneUser.status !== 'DELETED') {
      const error = new Error('An account with this phone number already exists.');
      error.statusCode = 400;
      throw error;
    }
  }

  const role = await roleRepository.findRoleByName(roleName || 'CUSTOMER');
  if (!role) {
    const error = new Error(`Role ${roleName} not found`);
    error.statusCode = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  if (!existingUser) {
    existingUser = await userRepository.createUser({
      email,
      name,
      phone: actualPhone,
      password_hash: hashedPassword,
      role_id: role.id,
      email_verified: false,
      status: 'ACTIVE',
    });

    // Notify admin asynchronously about the new account creation
    emailService.sendNewAccountNotificationToAdmin({
      name,
      email,
      phone: actualPhone,
      roleName: role.name
    }).catch(err => console.error('Failed to send admin notification:', err));
  } else {
    // Update password & status if unverified or previously deleted user registers again
    await userRepository.updateUser(existingUser.id, {
      name,
      phone: actualPhone,
      password_hash: hashedPassword,
      role_id: role.id,
      email_verified: false,
      status: 'ACTIVE',
    });
  }

  const otp = otpUtils.generateOTP();
  const expiresAt = otpUtils.getOtpExpiry(5);
  
  await otpRepository.createOtp(email, otp, expiresAt);
  await emailService.sendOtpEmail(email, otp);

  return { message: 'OTP sent to email. Please verify.' };
};

const verifyRegistrationOtp = async (emailInput, otpInput) => {
  const inputStr = emailInput ? String(emailInput).trim().toLowerCase() : '';
  const otp = otpInput ? String(otpInput).trim() : '';

  let user = await userRepository.findUserByEmail(inputStr);
  if (!user && inputStr.length > 20) {
    user = await userRepository.findUserById(inputStr);
  }

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const validOtp = await otpRepository.findValidOtp(user.email, otp);
  if (!validOtp) {
    const error = new Error('Invalid or expired OTP');
    error.statusCode = 400;
    throw error;
  }

  await otpRepository.markOtpVerified(validOtp.id);
  await userRepository.verifyUserEmail(user.id);

  const fullUser = await userRepository.findUserById(user.id);

  const payload = { id: fullUser.id, role: fullUser.roles?.name };
  const accessToken = jwtUtils.generateAccessToken(payload);
  const refreshToken = jwtUtils.generateRefreshToken(payload);

  return {
    message: 'Email verified successfully.',
    user: {
      id: fullUser.id,
      name: fullUser.name,
      email: fullUser.email,
      role: fullUser.roles?.name,
      owner_onboarding_completed: fullUser.owner_onboarding_completed ?? false,
      owner_onboarding_completed_at: fullUser.owner_onboarding_completed_at || null,
    },
    role: fullUser.roles?.name,
    token: accessToken,
    accessToken,
    refreshToken,
  };
};

const login = async (emailInput, password, expectedRole) => {
  const email = emailInput ? String(emailInput).trim().toLowerCase() : '';
  const user = await userRepository.findUserByEmail(email);
  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  if (user.status === 'DELETED') {
    const error = new Error('This account has been deleted.');
    error.statusCode = 403;
    throw error;
  }

  if (user.status === 'SUSPENDED') {
    const error = new Error('This account has been suspended. Please contact support.');
    error.statusCode = 403;
    throw error;
  }

  if (!user.email_verified) {
    const error = new Error('Please verify your email first');
    error.statusCode = 401;
    throw error;
  }

  const roleName = (user.roles?.name || '').toUpperCase();
  const isPartnerAccount = 
    roleName === 'CAFE_OWNER' || 
    roleName === 'EVENT_MANAGER' || 
    (user.cafes && user.cafes.length > 0) || 
    (user.event_management_profiles && user.event_management_profiles.length > 0);

  const targetRole = expectedRole ? String(expectedRole).toUpperCase() : null;

  if (targetRole === 'CUSTOMER' && isPartnerAccount) {
    const error = new Error('Accounts created as Cafe Owner or Event Manager are not permitted to log in as Customer. Please use the Partner portal.');
    error.statusCode = 403;
    throw error;
  }

  if ((targetRole === 'CAFE_OWNER' || targetRole === 'EVENT_MANAGER' || targetRole === 'PARTNER') && roleName === 'CUSTOMER' && !isPartnerAccount) {
    const error = new Error('Customer accounts are not permitted to log in to the Partner portal. Please use the Customer portal.');
    error.statusCode = 403;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const payload = { id: user.id, role: user.roles?.name };
  const accessToken = jwtUtils.generateAccessToken(payload);
  const refreshToken = jwtUtils.generateRefreshToken(payload);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.roles?.name,
      owner_onboarding_completed: user.owner_onboarding_completed ?? false,
      owner_onboarding_completed_at: user.owner_onboarding_completed_at || null,
    },
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (emailInput, expectedRole) => {
  const email = emailInput ? String(emailInput).trim().toLowerCase() : '';
  const user = await userRepository.findUserByEmail(email);
  if (!user || user.status === 'DELETED') {
    const error = new Error(user?.status === 'DELETED' ? 'This account has been deleted.' : 'User not found');
    error.statusCode = user?.status === 'DELETED' ? 403 : 404;
    throw error;
  }

  const roleName = (user.roles?.name || '').toUpperCase();
  const isPartnerAccount = 
    roleName === 'CAFE_OWNER' || 
    roleName === 'EVENT_MANAGER' || 
    (user.cafes && user.cafes.length > 0) || 
    (user.event_management_profiles && user.event_management_profiles.length > 0);

  const targetRole = expectedRole ? String(expectedRole).toUpperCase() : null;

  if (targetRole === 'CUSTOMER' && isPartnerAccount) {
    const error = new Error('Accounts created as Cafe Owner or Event Manager cannot request password reset from the Customer portal. Please use the Partner portal.');
    error.statusCode = 403;
    throw error;
  }

  if ((targetRole === 'CAFE_OWNER' || targetRole === 'EVENT_MANAGER' || targetRole === 'PARTNER') && roleName === 'CUSTOMER' && !isPartnerAccount) {
    const error = new Error('Customer accounts cannot request password reset from the Partner portal.');
    error.statusCode = 403;
    throw error;
  }

  const otp = otpUtils.generateOTP();
  const expiresAt = otpUtils.getOtpExpiry(5);
  
  await otpRepository.createOtp(email, otp, expiresAt);
  await emailService.sendOtpEmail(email, otp);

  return { message: 'Password reset OTP sent to email.', userId: user.id };
};

const resetPassword = async (emailInput, otpInput, newPassword) => {
  const inputStr = emailInput ? String(emailInput).trim().toLowerCase() : '';
  const otp = otpInput ? String(otpInput).trim() : '';

  let user = await userRepository.findUserByEmail(inputStr);
  if (!user && inputStr.length > 20) {
    user = await userRepository.findUserById(inputStr);
  }

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const validOtp = await otpRepository.findValidOtp(user.email, otp);
  if (!validOtp) {
    const error = new Error('Invalid or expired OTP');
    error.statusCode = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  await otpRepository.markOtpVerified(validOtp.id);
  await userRepository.updatePassword(user.id, hashedPassword);

  return { message: 'Password reset successfully.' };
};

const refreshToken = async (token) => {
  const decoded = jwtUtils.verifyToken(token);
  if (!decoded) {
    const error = new Error('Invalid refresh token');
    error.statusCode = 401;
    throw error;
  }

  const user = await userRepository.findUserById(decoded.id);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const payload = { id: user.id, role: user.roles?.name };
  const accessToken = jwtUtils.generateAccessToken(payload);
  const newRefreshToken = jwtUtils.generateRefreshToken(payload);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.roles?.name,
      owner_onboarding_completed: user.owner_onboarding_completed ?? false,
      owner_onboarding_completed_at: user.owner_onboarding_completed_at || null,
    },
    accessToken,
    refreshToken: newRefreshToken,
  };
};

module.exports = {
  registerUser,
  verifyRegistrationOtp,
  login,
  forgotPassword,
  resetPassword,
  refreshToken,
};
