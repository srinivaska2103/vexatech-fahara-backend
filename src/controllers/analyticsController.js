const analyticsService = require('../services/analyticsService');
const dashboardService = require('../services/dashboardService');
const prisma = require('../config/prisma');

const trackEvent = async (req, res, next) => {
  try {
    const { cafe_id, event_type, source, session_id, metadata } = req.body;
    const user_id = req.user?.id || null;

    if (!cafe_id || !event_type) {
      return res.status(400).json({ success: false, message: 'cafe_id and event_type are required' });
    }

    // Trigger non-blocking event recording
    analyticsService.recordEvent({
      cafe_id,
      user_id,
      session_id,
      event_type,
      source: source || 'direct',
      metadata
    });

    return res.status(202).json({ success: true, message: 'Event accepted' });
  } catch (error) {
    // Non-blocking: respond with 200/202 regardless
    return res.status(202).json({ success: true, message: 'Event accepted' });
  }
};

const getCafeAnalytics = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const userRole = req.user.roles?.name || req.user.role || 'CAFE_OWNER';
    let cafeId = req.params.cafeId;

    const { period, startDate, endDate } = req.query;

    if (!cafeId || cafeId === 'overview') {
      // Find default or first cafe for owner
      const cafe = await prisma.cafes.findFirst({
        where: userRole === 'ADMIN' ? {} : { owner_id: ownerId },
        select: { id: true }
      });

      if (!cafe) {
        return res.status(200).json({
          success: true,
          data: {
            overview: { total_views: 0, unique_visitors: 0, menu_views: 0, wishlist_adds: 0, directions_clicks: 0, contact_clicks: 0 },
            funnel: [],
            discovery_sources: [],
            insights: ['No active cafe found for analytics.']
          }
        });
      }
      cafeId = cafe.id;
    }

    const analytics = await analyticsService.getCafeAnalytics(
      ownerId,
      cafeId,
      period || '7days',
      startDate,
      endDate,
      userRole
    );

    return res.status(200).json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
};

const getEventAnalytics = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const summary = await dashboardService.getSummary(ownerId);
    
    const attendance_data = [45, 60, 85, 110, 150, Math.floor((summary.total_bookings || 0) * 1.5)];
    const attendance_labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

    const data = {
      total_events: summary.top_events ? summary.top_events.length : 0,
      events_trend: 10,
      tickets_sold: summary.top_events ? summary.top_events.reduce((acc, curr) => acc + curr.tickets_sold, 0) : 0,
      tickets_trend: 15,
      avg_rating: summary.average_rating,
      rating_trend: 5,
      attendance_data,
      attendance_labels,
      top_events: summary.top_events || []
    };

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  trackEvent,
  getCafeAnalytics,
  getEventAnalytics
};
