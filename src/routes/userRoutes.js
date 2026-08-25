const express = require('express');
const userController = require('../controllers/userController');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management API
 */

/**
 * @swagger
 * /api/v1/users/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Bad Request
 */
router.post('/register', userController.registerUser);

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.get('/', protect, authorizeRoles('ADMIN'), userController.getUsers);

// Static literal routes MUST be defined before parameterized /:id routes
router.get('/me', protect, userController.getMe);
router.put('/me', protect, userController.updateProfile);
router.patch('/me', protect, userController.updateProfile);
router.patch('/onboarding-status', protect, userController.updateOnboardingStatus);
router.delete('/me', protect, userController.deleteMe);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get a specific user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', protect, authorizeRoles('ADMIN'), userController.getUserById);
router.delete('/:id', protect, authorizeRoles('ADMIN'), userController.deleteUser);
router.patch('/:id/status', protect, authorizeRoles('ADMIN'), userController.updateUserStatus);

module.exports = router;
