const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/events', protect, authorizeRoles('CAFE_OWNER', 'EVENT_MANAGER'), analyticsController.getEventAnalytics);

module.exports = router;
