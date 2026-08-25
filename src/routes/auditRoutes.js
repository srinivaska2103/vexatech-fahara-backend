const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.use(protect);
router.use(authorizeRoles('ADMIN'));

/**
 * @swagger
 * tags:
 *   name: Audit
 *   description: Audit logs and security center management
 */

/**
 * @swagger
 * /api/v1/audit/logs:
 *   get:
 *     summary: Get all audit logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of audit logs
 */
router.get('/logs', auditController.getAuditLogs);

/**
 * @swagger
 * /api/v1/audit/sessions:
 *   get:
 *     summary: Get all security sessions
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of security sessions
 */
router.get('/sessions', auditController.getSecuritySessions);

/**
 * @swagger
 * /api/v1/audit/sessions/{id}:
 *   delete:
 *     summary: Terminate a specific session
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session terminated successfully
 */
router.delete('/sessions/:id', auditController.terminateSession);

/**
 * @swagger
 * /api/v1/audit/sessions:
 *   delete:
 *     summary: Terminate all other sessions
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All other sessions terminated successfully
 */
router.delete('/sessions', auditController.terminateAllOtherSessions);

/**
 * @swagger
 * /api/v1/audit/login-history:
 *   get:
 *     summary: Get login history
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login history list
 */
router.get('/login-history', auditController.getLoginHistory);

module.exports = router;
