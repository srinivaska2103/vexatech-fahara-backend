const express = require('express');
const Joi = require('joi');
const bookingController = require('../controllers/bookingController');
const validateRequest = require('../middlewares/validateRequest');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

const bookingSchema = Joi.object({
  cafe_id: Joi.string().uuid().required(),
  package_id: Joi.string().uuid().allow(null, ''),
  event_service_id: Joi.string().uuid().allow(null, ''),
  booking_date: Joi.string().isoDate().required(),
  start_time: Joi.string().pattern(/^([01]\d|2[0-3]):?([0-5]\d):?([0-5]\d)$/).required().messages({'string.pattern.base': 'start_time must be HH:mm:ss'}),
  end_time: Joi.string().pattern(/^([01]\d|2[0-3]):?([0-5]\d):?([0-5]\d)$/).required().messages({'string.pattern.base': 'end_time must be HH:mm:ss'}),
  hours: Joi.number().integer().min(1).required(),
  total_persons: Joi.number().integer().min(1).required(),
  food_amount: Joi.number().min(0).default(0),
  decoration_amount: Joi.number().min(0).default(0),
  extra_person_amount: Joi.number().min(0).default(0),
  discount: Joi.number().min(0).default(0),
  special_request: Joi.string().allow('', null),
  event_special_request: Joi.string().allow('', null),
});

const statusSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'CONFIRMED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED').required(),
});

/**
 * @swagger
 * tags:
 *   name: Bookings
 *   description: Booking Management APIs
 */

/**
 * @swagger
 * /api/v1/bookings:
 *   post:
 *     summary: Create a new booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cafe_id
 *               - booking_date
 *               - start_time
 *               - end_time
 *               - hours
 *               - total_persons
 *             properties:
 *               cafe_id:
 *                 type: string
 *               package_id:
 *                 type: string
 *               event_service_id:
 *                 type: string
 *               booking_date:
 *                 type: string
 *                 example: "2026-07-20"
 *               start_time:
 *                 type: string
 *                 example: "14:00:00"
 *               end_time:
 *                 type: string
 *                 example: "16:00:00"
 *               hours:
 *                 type: integer
 *               total_persons:
 *                 type: integer
 *               food_amount:
 *                 type: number
 *               decoration_amount:
 *                 type: number
 *               extra_person_amount:
 *                 type: number
 *               discount:
 *                 type: number
 *               special_request:
 *                 type: string
 *     responses:
 *       201:
 *         description: Booking created successfully
 *       409:
 *         description: Time slot not available
 */
router.post('/', protect, authorizeRoles('CUSTOMER', 'CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), validateRequest(bookingSchema), bookingController.createBooking);

/**
 * @swagger
 * /api/v1/bookings/my-bookings:
 *   get:
 *     summary: Get all bookings for the authenticated customer
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bookings
 */
router.get('/my-bookings', protect, authorizeRoles('CUSTOMER', 'CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), bookingController.getMyBookings);

/**
 * @swagger
 * /api/v1/bookings/cafe-bookings:
 *   get:
 *     summary: Get all bookings for cafes owned by the authenticated user
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bookings
 */
router.get('/cafe-bookings', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER'), bookingController.getCafeBookings);
router.get('/calendar', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER'), bookingController.getCafeBookings);

/**
 * @swagger
 * /api/v1/bookings/admin/all:
 *   get:
 *     summary: Get all bookings for admin
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bookings
 */
router.get('/admin/all', protect, authorizeRoles('ADMIN'), bookingController.getAllAdminBookings);

/**
 * @swagger
 * /api/v1/bookings/{id}:
 *   get:
 *     summary: Get a specific booking by ID
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking details
 */
router.get('/:id', protect, bookingController.getBookingById);

/**
 * @swagger
 * /api/v1/bookings/{id}/status:
 *   patch:
 *     summary: Update booking status
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, CANCELLED, COMPLETED]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch('/:id/status', protect, authorizeRoles('CAFE_OWNER', 'ADMIN'), validateRequest(statusSchema), bookingController.updateBookingStatus);

/**
 * @swagger
 * /api/v1/bookings/{id}/cancel:
 *   patch:
 *     summary: Cancel a booking (Customers only)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking cancelled successfully
 *       400:
 *         description: Booking is already cancelled
 *       403:
 *         description: Unauthorized to cancel this booking
 *       404:
 *         description: Booking not found
 */
router.patch('/:id/cancel', protect, authorizeRoles('CUSTOMER', 'CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), bookingController.cancelBooking);

/**
 * @swagger
 * /api/v1/bookings/{id}:
 *   delete:
 *     summary: Delete a booking (Customers only)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking deleted successfully
 *       404:
 *         description: Booking not found
 */
router.delete('/:id', protect, authorizeRoles('CUSTOMER', 'CAFE_OWNER', 'EVENT_MANAGER', 'ADMIN'), bookingController.deleteBooking);

module.exports = router;
