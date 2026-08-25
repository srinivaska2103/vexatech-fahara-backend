const express = require('express');
const Joi = require('joi');
const eventServiceController = require('../controllers/eventServiceController');
const validateRequest = require('../middlewares/validateRequest');
const { protect, optionalProtect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

const serviceSchema = Joi.object({
  category: Joi.string().required(),
  service_name: Joi.string().required(),
  description: Joi.string().allow('', null),
  price: Joi.number().min(0).required(),
  gallery: Joi.array().items(Joi.string()).optional(),
  inclusions: Joi.array().items(Joi.string()).optional(),
});



/**
 * @swagger
 * tags:
 *   name: EventServices
 *   description: Event Services Management APIs
 */

/**
 * @swagger
 * /api/v1/event-services:
 *   get:
 *     summary: Get all event services
 *     tags: [EventServices]
 *     responses:
 *       200:
 *         description: List of event services
 */
router.get('/', optionalProtect, eventServiceController.getServices);

/**
 * @swagger
 * /api/v1/event-services/{id}:
 *   get:
 *     summary: Get event service by ID
 *     tags: [EventServices]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The service ID
 *     responses:
 *       200:
 *         description: Service details
 */
router.get('/:id', optionalProtect, eventServiceController.getServiceById);

/**
 * @swagger
 * /api/v1/event-services:
 *   post:
 *     summary: Create a new event service
 *     tags: [EventServices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category
 *               - service_name
 *               - price
 *             properties:
 *               category:
 *                 type: string
 *               service_name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       201:
 *         description: Event service created
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Not an EVENT_MANAGER)
 */
router.post('/', protect, authorizeRoles('EVENT_MANAGER'), validateRequest(serviceSchema), eventServiceController.createService);

/**
 * @swagger
 * /api/v1/event-services/{id}:
 *   put:
 *     summary: Update an event service
 *     tags: [EventServices]
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
 *             properties:
 *               category:
 *                 type: string
 *               service_name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Service updated
 */
router.put('/:id', protect, authorizeRoles('EVENT_MANAGER'), validateRequest(serviceSchema), eventServiceController.updateService);

/**
 * @swagger
 * /api/v1/event-services/{id}:
 *   delete:
 *     summary: Delete an event service
 *     tags: [EventServices]
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
 *         description: Service deleted
 */
router.delete('/:id', protect, authorizeRoles('EVENT_MANAGER'), eventServiceController.deleteService);



module.exports = router;
