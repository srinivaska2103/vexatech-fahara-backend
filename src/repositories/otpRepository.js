const prisma = require('../config/prisma');

const createOtp = async (email, otp, expiresAt) => {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  const normalizedOtp = otp ? String(otp).trim() : '';

  return await prisma.otp_verifications.create({
    data: {
      email: normalizedEmail,
      otp: normalizedOtp,
      expires_at: expiresAt,
      verified: false,
    },
  });
};

const findValidOtp = async (email, otp) => {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  const normalizedOtp = otp ? String(otp).trim() : '';

  return await prisma.otp_verifications.findFirst({
    where: {
      email: { equals: normalizedEmail, mode: 'insensitive' },
      otp: normalizedOtp,
      verified: false,
      expires_at: {
        gt: new Date(),
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};

const markOtpVerified = async (id) => {
  return await prisma.otp_verifications.update({
    where: { id },
    data: { verified: true },
  });
};

module.exports = {
  createOtp,
  findValidOtp,
  markOtpVerified,
};

