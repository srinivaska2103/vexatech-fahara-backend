const prisma = require('../config/prisma');
const qrService = require('./qrService');
const { getCafeCustomerVisibility } = require('./cafeVisibilityService');

/**
 * QR Code Controller & Resolution Service
 * 
 * 1. resolveQrCode(qrCodeId):
 *    - Looks up cafe by qr_code_id
 *    - Validates visibility & subscription status
 *    - Returns canonical route (e.g. `/customer/cafe/${cafe.id}`) and eligibility
 * 
 * 2. getCafeQr(cafeId, requestingUser):
 *    - Verifies ownership or admin privileges
 *    - Generates preview data URL & landing URL for the cafe's stable qr_code_id
 *    - Ensures persistent identifier
 * 
 * 3. downloadCafeQr(cafeId, requestingUser, options):
 *    - Returns PNG buffer for download
 */

const resolveQrCode = async (qrCodeId) => {
  if (!qrCodeId || typeof qrCodeId !== 'string') {
    const error = new Error('Invalid QR code identifier');
    error.statusCode = 400;
    throw error;
  }

  const cleanQrId = qrCodeId.trim();

  const cafe = await prisma.cafes.findFirst({
    where: { qr_code_id: cleanQrId },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          partner_subscriptions: {
            select: {
              id: true,
              status: true,
              current_period_end: true,
              cancel_at_period_end: true
            }
          }
        }
      }
    }
  });

  if (!cafe) {
    const error = new Error('QR Code not found');
    error.statusCode = 404;
    error.code = 'QR_NOT_FOUND';
    throw error;
  }

  const visibility = getCafeCustomerVisibility(cafe);

  // Canonical details route according to Fahara canonical routing registry
  const canonicalRoute = `/customer/cafe/${cafe.id}`;
  const publicRoute = `/cafes/${cafe.id}`;

  return {
    qrCodeId: cafe.qr_code_id,
    cafeId: cafe.id,
    cafeName: cafe.name,
    category: cafe.category,
    status: cafe.status,
    canonicalRoute,
    publicRoute,
    isEligible: visibility.visible,
    visibilityReason: visibility.reason,
    destinationUrl: qrService.buildQrLandingUrl(cafe.qr_code_id)
  };
};

const getCafeQrData = async (cafeId, requestingUser) => {
  const cafe = await prisma.cafes.findUnique({
    where: { id: cafeId }
  });

  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }

  // Authorization check: cafe owner or admin
  const isOwner = requestingUser?.id && String(cafe.owner_id).trim().toLowerCase() === String(requestingUser.id).trim().toLowerCase();
  const isAdmin = requestingUser?.roles?.name === 'ADMIN' || requestingUser?.role === 'ADMIN';

  if (!isOwner && !isAdmin) {
    const error = new Error('Forbidden: You do not have permission to view or manage this cafe QR');
    error.statusCode = 403;
    throw error;
  }

  // If for some reason qr_code_id was null (safe fallback), generate and persist it now
  let qrCodeId = cafe.qr_code_id;
  if (!qrCodeId) {
    qrCodeId = qrService.generateQrCodeId();
    await prisma.cafes.update({
      where: { id: cafe.id },
      data: { qr_code_id: qrCodeId }
    });
  }

  const qrData = await qrService.generateQrDataUrl(qrCodeId);

  return {
    cafeId: cafe.id,
    cafeName: cafe.name,
    qrCodeId,
    landingUrl: qrData.landingUrl,
    dataUrl: qrData.dataUrl,
    environment: process.env.NODE_ENV || 'development',
    customerAppUrl: qrService.getCustomerAppUrl()
  };
};

const getCafeQrImageBuffer = async (cafeId, requestingUser, options = {}) => {
  const cafe = await prisma.cafes.findUnique({
    where: { id: cafeId }
  });

  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }

  const isOwner = requestingUser?.id && String(cafe.owner_id).trim().toLowerCase() === String(requestingUser.id).trim().toLowerCase();
  const isAdmin = requestingUser?.roles?.name === 'ADMIN' || requestingUser?.role === 'ADMIN';

  if (!isOwner && !isAdmin) {
    const error = new Error('Forbidden: You do not have permission to download this cafe QR');
    error.statusCode = 403;
    throw error;
  }

  let qrCodeId = cafe.qr_code_id;
  if (!qrCodeId) {
    qrCodeId = qrService.generateQrCodeId();
    await prisma.cafes.update({
      where: { id: cafe.id },
      data: { qr_code_id: qrCodeId }
    });
  }

  return await qrService.generateQrBuffer(qrCodeId, options);
};

module.exports = {
  resolveQrCode,
  getCafeQrData,
  getCafeQrImageBuffer
};
