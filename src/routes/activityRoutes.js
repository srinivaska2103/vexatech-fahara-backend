const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const dashboardService = require('../services/dashboardService');

router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const activities = await dashboardService.getActivityTimeline(req.user.id);
    res.status(200).json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
