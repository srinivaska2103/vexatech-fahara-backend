const qrResolutionService = require('../services/qrResolutionService');

/**
 * Public endpoint to resolve a scanned QR code identifier.
 * GET /api/v1/qr/resolve/:qrCodeId
 */
const resolveQr = async (req, res, next) => {
  try {
    const { qrCodeId } = req.params;
    const result = await qrResolutionService.resolveQrCode(qrCodeId);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Owner/Admin endpoint to preview/fetch the cafe QR code data.
 * GET /api/v1/cafes/:cafeId/qr
 */
const getCafeQr = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const result = await qrResolutionService.getCafeQrData(cafeId, req.user);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Owner/Admin endpoint to download the cafe QR code image as PNG.
 * GET /api/v1/cafes/:cafeId/qr/download
 */
const downloadCafeQr = async (req, res, next) => {
  try {
    const { cafeId } = req.params;
    const width = parseInt(req.query.width, 10) || 1024;
    const result = await qrResolutionService.getCafeQrImageBuffer(cafeId, req.user, { width });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="fahara-cafe-qr-${result.qrCodeId}.png"`);
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  resolveQr,
  getCafeQr,
  downloadCafeQr
};
