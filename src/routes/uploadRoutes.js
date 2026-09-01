const express = require('express');
const uploadController = require('../controllers/uploadController');
const upload = require('../middlewares/uploadMiddleware');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Uploads
 *   description: Cloudinary Image Uploads
 */

/**
 * @swagger
 * /api/v1/uploads:
 *   post:
 *     summary: Upload a single image
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Successfully uploaded image
 *       400:
 *         description: No image provided
 */
router.post('/', upload.any(), uploadController.uploadSingleImage);

/**
 * @swagger
 * /api/v1/uploads/multiple:
 *   post:
 *     summary: Upload multiple images
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Successfully uploaded images
 *       400:
 *         description: No images provided
 */
router.post('/multiple', protect, upload.array('images', 10), uploadController.uploadMultipleImages);

module.exports = router;
