const prisma = require('../config/prisma');

const VALID_EVENT_TYPES = [
  'CAFE_VIEW',
  'MENU_VIEW',
  'IMAGE_VIEW',
  'LOCATION_VIEW',
  'DIRECTIONS_CLICK',
  'CONTACT_CLICK',
  'PHONE_CLICK',
  'WHATSAPP_CLICK',
  'WISHLIST_ADD',
  'WISHLIST_REMOVE',
  'REVIEW_VIEW',
  'REVIEW_SUBMITTED'
];

/**
 * Non-blocking event tracking
 */
const recordEvent = async (eventData) => {
  try {
    const { cafe_id, user_id, session_id, event_type, source, metadata } = eventData;
    if (!cafe_id || !event_type) return null;

    if (!VALID_EVENT_TYPES.includes(event_type)) {
      return null;
    }

    // Verify cafe exists
    const cafeExists = await prisma.cafes.findUnique({
      where: { id: cafe_id },
      select: { id: true }
    });

    if (!cafeExists || !prisma.cafe_analytics_events) return null;

    const event = await prisma.cafe_analytics_events.create({
      data: {
        cafe_id,
        user_id: user_id || null,
        session_id: session_id || null,
        event_type,
        source: source || 'direct',
        metadata: metadata || null,
      }
    });

    return event;
  } catch (error) {
    console.error('Failed to record analytics event:', error);
    // Non-blocking: fail silently
    return null;
  }
};

/**
 * Get aggregated analytics metrics for cafe owner
 */
const getCafeAnalytics = async (ownerId, cafeId, period = '7days', startDateStr = null, endDateStr = null, userRole = 'CAFE_OWNER') => {
  // Check cafe ownership
  const cafe = await prisma.cafes.findFirst({
    where: {
      id: cafeId,
      ...(userRole === 'ADMIN' ? {} : { owner_id: ownerId })
    }
  });

  if (!cafe) {
    const error = new Error('Cafe not found or access forbidden');
    error.statusCode = 403;
    throw error;
  }

  // Calculate Date Boundaries
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date(now);

  if (period === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else if (period === 'yesterday') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
    endDate.setDate(endDate.getDate() - 1);
    endDate.setHours(23, 59, 59, 999);
  } else if (period === '7days') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === '30days') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === 'this_month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'custom' && startDateStr && endDateStr) {
    startDate = new Date(startDateStr);
    endDate = new Date(endDateStr);
  } else {
    // Default 7 days
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  }

  const dateFilter = {
    created_at: {
      gte: startDate,
      lte: endDate
    }
  };

  // Fetch events for this cafe in range
  const events = prisma.cafe_analytics_events ? await prisma.cafe_analytics_events.findMany({
    where: {
      cafe_id: cafeId,
      ...dateFilter
    },
    select: {
      id: true,
      user_id: true,
      session_id: true,
      event_type: true,
      source: true,
      created_at: true
    }
  }) : [];

  // Calculate Aggregations
  let totalViews = 0;
  let menuViews = 0;
  let wishlistAdds = 0;
  let directionsClicks = 0;
  let contactClicks = 0;
  let reviewViews = 0;
  let reviewSubmissions = 0;

  const uniqueVisitorsSet = new Set();
  const sourcesCount = {};

  events.forEach(e => {
    const visitorKey = e.user_id || e.session_id || e.id;
    uniqueVisitorsSet.add(visitorKey);

    const src = e.source || 'direct';
    sourcesCount[src] = (sourcesCount[src] || 0) + 1;

    switch (e.event_type) {
      case 'CAFE_VIEW':
        totalViews++;
        break;
      case 'MENU_VIEW':
        menuViews++;
        break;
      case 'WISHLIST_ADD':
        wishlistAdds++;
        break;
      case 'DIRECTIONS_CLICK':
        directionsClicks++;
        break;
      case 'CONTACT_CLICK':
      case 'PHONE_CLICK':
      case 'WHATSAPP_CLICK':
        contactClicks++;
        break;
      case 'REVIEW_VIEW':
        reviewViews++;
        break;
      case 'REVIEW_SUBMITTED':
        reviewSubmissions++;
        break;
      default:
        break;
    }
  });

  // Also query favorites count for real backend wishlist fallback/addition
  const wishlistCount = await prisma.favorites.count({
    where: {
      cafe_id: cafeId
    }
  });

  const totalWishlists = Math.max(wishlistAdds, wishlistCount);

  // Discovery Sources formatting
  const discoverySources = Object.keys(sourcesCount).map(src => ({
    source: src,
    count: sourcesCount[src]
  })).sort((a, b) => b.count - a.count);

  // Customer Interest Funnel
  const funnel = [
    { stage: 'Cafe Views', count: totalViews },
    { stage: 'Menu Views', count: menuViews },
    { stage: 'Wishlist Adds', count: totalWishlists },
    { stage: 'Directions Clicked', count: directionsClicks },
    { stage: 'Contact Requests', count: contactClicks }
  ];

  // Data-driven Insights
  const insights = [];
  if (totalViews > 0) {
    insights.push(`Your cafe received ${totalViews.toLocaleString()} total views during this period.`);
  } else {
    insights.push(`Your cafe is listed and ready for visitor activity.`);
  }

  if (directionsClicks > 0) {
    insights.push(`Customers requested directions to your location ${directionsClicks} times.`);
  }

  if (totalWishlists > 0) {
    insights.push(`${totalWishlists} customers saved your cafe to their wishlist.`);
  }

  if (contactClicks > 0) {
    insights.push(`${contactClicks} potential customers clicked to contact your cafe.`);
  }

  return {
    cafe_id: cafeId,
    cafe_name: cafe.name,
    is_walking_cafe: cafe.is_walking_cafe || false,
    period,
    date_range: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    },
    overview: {
      total_views: totalViews,
      unique_visitors: uniqueVisitorsSet.size,
      menu_views: menuViews,
      wishlist_adds: totalWishlists,
      directions_clicks: directionsClicks,
      contact_clicks: contactClicks,
      review_views: reviewViews,
      review_submissions: reviewSubmissions
    },
    funnel,
    discovery_sources: discoverySources,
    insights
  };
};

module.exports = {
  recordEvent,
  getCafeAnalytics
};
