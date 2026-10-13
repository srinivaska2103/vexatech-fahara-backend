const crypto = require('crypto');
const QRCode = require('qrcode');

/**
 * QR Code Service for Dynamic Cafe Landing URLs
 * 
 * - Encodes stable route: {CUSTOMER_APP_URL}/q/{qrCodeId}
 * - Stored identifier (qrCodeId) is unique, persistent, and decoupled from cafe slug, name, or ID.
 * - local vs production environments are determined strictly via environment variables.
 */

/**
 * Generates a collision-resistant unique QR identifier.
 * Format: qr_xxxxxxxxxxxx (URL-safe, lowercase alphanumeric)
 */
const generateQrCodeId = () => {
  return `qr_${crypto.randomBytes(8).toString('hex')}`;
};

/**
 * Returns the configured Customer App URL for QR destinations.
 * Priority:
 * 1. QR_CUSTOMER_APP_URL
 * 2. CUSTOMER_APP_URL
 * 3. FRONTEND_URL
 * 4. Fallback: http://localhost:3001
 */
const getCustomerAppUrl = () => {
  let url = process.env.QR_CUSTOMER_APP_URL || process.env.CUSTOMER_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3001';
  // Strip trailing slashes
  return url.replace(/\/+$/, '');
};

/**
 * Builds the canonical dynamic QR landing URL.
 * Format: {CUSTOMER_APP_URL}/q/{qrCodeId}
 */
const buildQrLandingUrl = (qrCodeId) => {
  if (!qrCodeId) {
    throw new Error('QR Code ID is required to build landing URL');
  }
  const baseUrl = getCustomerAppUrl();
  return `${baseUrl}/q/${qrCodeId}`;
};

/**
 * Generates a QR image Data URL (PNG) from a given QR identifier.
 */
const generateQrDataUrl = async (qrCodeId, options = {}) => {
  const landingUrl = buildQrLandingUrl(qrCodeId);
  const qrOptions = {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    quality: 0.95,
    margin: 2,
    width: options.width || 512,
    color: {
      dark: '#111827',
      light: '#ffffff'
    },
    ...options
  };

  const dataUrl = await QRCode.toDataURL(landingUrl, qrOptions);
  return {
    qrCodeId,
    landingUrl,
    dataUrl
  };
};

/**
 * Generates a QR image Buffer (PNG) from a given QR identifier for download/streaming.
 */
const generateQrBuffer = async (qrCodeId, options = {}) => {
  const landingUrl = buildQrLandingUrl(qrCodeId);
  const qrOptions = {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 2,
    width: options.width || 1024,
    color: {
      dark: '#111827',
      light: '#ffffff'
    },
    ...options
  };

  const buffer = await QRCode.toBuffer(landingUrl, qrOptions);
  return {
    qrCodeId,
    landingUrl,
    buffer
  };
};

module.exports = {
  generateQrCodeId,
  getCustomerAppUrl,
  buildQrLandingUrl,
  generateQrDataUrl,
  generateQrBuffer
};
