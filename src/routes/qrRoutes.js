const express = require('express');
const qrController = require('../controllers/qrController');

const router = express.Router();

// Public route to resolve QR code
router.get('/resolve/:qrCodeId', qrController.resolveQr);

module.exports = router;
