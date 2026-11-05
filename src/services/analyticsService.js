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
    return null;
  }
};

/**
 * Calculate Start & End Date filters from period token
 */
const getDateRange = (period, startDateStr, endDateStr) => {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date(now);

  if (period === 'today') {
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
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
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    endDate = new Date(now);
  } else if (period === 'last_month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (period === 'custom' && startDateStr && endDateStr) {
    startDate = new Date(startDateStr);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(endDateStr);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Default 7 days
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
};

/**
 * Get unified restaurant analytics combining Food Orders & Table Bookings
 */
const getCafeAnalytics = async (ownerId, cafeId, period = '7days', startDateStr = null, endDateStr = null, userRole = 'CAFE_OWNER') => {
  const isAdmin = userRole === 'ADMIN';

  // 1. Check cafe ownership & fetch cafe info
  const cafe = await prisma.cafes.findFirst({
    where: {
      id: cafeId,
      ...(isAdmin ? {} : { owner_id: ownerId })
    }
  });

  if (!cafe) {
    const error = new Error('Cafe or Restaurant not found or access forbidden');
    error.statusCode = 403;
    throw error;
  }

  // 2. Date Boundaries
  const { startDate, endDate } = getDateRange(period, startDateStr, endDateStr);

  const dateFilter = {
    gte: startDate,
    lte: endDate
  };

  // 3. Parallel Queries for Food Orders, Bookings, Analytics Events & Refunds
  const [foodOrders, bookings, events, refunds] = await Promise.all([
    prisma.food_orders.findMany({
      where: {
        cafe_id: cafeId,
        created_at: dateFilter
      },
      include: {
        order_items: true,
        users: { select: { id: true, name: true, phone: true } }
      },
      orderBy: { created_at: 'desc' }
    }),
    prisma.bookings.findMany({
      where: {
        cafe_id: cafeId,
        created_at: dateFilter
      },
      include: {
        users: { select: { id: true, name: true, phone: true } }
      },
      orderBy: { created_at: 'desc' }
    }),
    prisma.cafe_analytics_events ? prisma.cafe_analytics_events.findMany({
      where: {
        cafe_id: cafeId,
        created_at: dateFilter
      },
      select: {
        id: true,
        user_id: true,
        session_id: true,
        event_type: true,
        source: true,
        created_at: true
      }
    }) : [],
    prisma.payment_refunds.findMany({
      where: {
        refund_status: 'SUCCESS',
        created_at: dateFilter,
        bookings: { cafe_id: cafeId }
      }
    })
  ]);

  // 4. Food Orders Analytics Calculation
  let grossFoodSales = 0;
  let paidFoodOrdersCount = 0;
  let pendingFoodPaymentsCount = 0;
  let cancelledFoodOrdersCount = 0;
  let totalFoodOrdersCount = foodOrders.length;
  const foodCustomerSet = new Set();
  const topSellingItemsMap = {};

  foodOrders.forEach(o => {
    const oStatus = String(o.order_status || '').toUpperCase();
    const pStatus = String(o.payment_status || '').toUpperCase();
    const isCancelled = ['CANCELLED', 'REJECTED'].includes(oStatus);
    const isPaid = pStatus === 'PAID';

    if (o.customer_id) foodCustomerSet.add(o.customer_id);

    if (isCancelled) {
      cancelledFoodOrdersCount++;
    } else if (isPaid) {
      paidFoodOrdersCount++;
      const orderAmt = Number(o.total_amount || 0);
      grossFoodSales += orderAmt;

      // Item aggregates
      const orderItems = o.order_items || o.food_order_items;
      if (Array.isArray(orderItems)) {
        orderItems.forEach(item => {
          const itemName = item.item_name_snapshot || item.item_name || 'Food Item';
          if (!topSellingItemsMap[itemName]) {
            topSellingItemsMap[itemName] = { name: itemName, quantity: 0, revenue: 0 };
          }
          topSellingItemsMap[itemName].quantity += Number(item.quantity || 1);
          topSellingItemsMap[itemName].revenue += Number(item.line_total || item.total_price || 0);
        });
      }
    } else {
      pendingFoodPaymentsCount++;
    }
  });

  const netFoodRevenue = Math.max(0, grossFoodSales);
  const avgFoodOrderValue = paidFoodOrdersCount > 0 ? Math.round(netFoodRevenue / paidFoodOrdersCount) : 0;

  // Top selling food items list
  const topSellingFoodItems = Object.values(topSellingItemsMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // 5. Booking Analytics Calculation
  let grossBookingRevenue = 0;
  let eligibleBookingCount = 0;
  const bookingCustomerSet = new Set();

  bookings.forEach(b => {
    const bStatus = String(b.booking_status || '').toUpperCase();
    const pStatus = String(b.payment_status || '').toUpperCase();
    const isCancelled = ['CANCELLED', 'REJECTED', 'DECLINED'].includes(bStatus);
    const isRefunded = ['REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED'].includes(pStatus);

    if (b.customer_id) bookingCustomerSet.add(b.customer_id);

    if (!isCancelled && !isRefunded) {
      const isCompleted = bStatus === 'COMPLETED';
      const isPaid = ['PAID', 'COMPLETED', 'SUCCESS'].includes(pStatus);
      const isConfirmedFree = bStatus === 'CONFIRMED' && Number(b.subtotal || b.total || 0) === 0;

      if (isCompleted || isPaid || isConfirmedFree) {
        eligibleBookingCount++;
        let cafeNet = Number(b.cafe_amount || 0);
        if (cafeNet <= 0) {
          const calcSub = Number(b.subtotal || b.total || 0);
          const evAmt = Number(b.event_service_amount || 0);
          cafeNet = Math.max(0, calcSub - evAmt);
        }
        grossBookingRevenue += cafeNet;
      }
    }
  });

  // Deduct refunds from booking revenue
  const totalBookingRefunds = refunds.reduce((sum, r) => sum + Number(r.refund_amount || 0), 0);
  const netBookingRevenue = Math.max(0, grossBookingRevenue - totalBookingRefunds);
  const avgBookingValue = eligibleBookingCount > 0 ? Math.round(netBookingRevenue / eligibleBookingCount) : 0;

  // 6. Overall Unified Revenue & Customer Metrics
  const overallRevenue = netFoodRevenue + netBookingRevenue;
  const combinedCustomersSet = new Set([...foodCustomerSet, ...bookingCustomerSet]);
  const totalCustomers = combinedCustomersSet.size;

  // 7. Time Progression Series for Charts (Daily buckets across range)
  const timeBucketsMap = {};
  const currDay = new Date(startDate);
  while (currDay <= endDate) {
    const key = currDay.toISOString().split('T')[0];
    const label = currDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    timeBucketsMap[key] = { date: key, label, foodRevenue: 0, bookingRevenue: 0, totalRevenue: 0, foodOrders: 0, bookings: 0 };
    currDay.setDate(currDay.getDate() + 1);
  }

  // Populate food orders in timeline
  foodOrders.forEach(o => {
    const isCancelled = ['CANCELLED', 'REJECTED'].includes(String(o.order_status || '').toUpperCase());
    const isPaid = String(o.payment_status || '').toUpperCase() === 'PAID';
    if (!isCancelled && isPaid) {
      const dayKey = new Date(o.created_at).toISOString().split('T')[0];
      if (timeBucketsMap[dayKey]) {
        const amt = Number(o.total_amount || 0);
        timeBucketsMap[dayKey].foodRevenue += amt;
        timeBucketsMap[dayKey].totalRevenue += amt;
        timeBucketsMap[dayKey].foodOrders += 1;
      }
    }
  });

  // Populate bookings in timeline
  bookings.forEach(b => {
    const bStatus = String(b.booking_status || '').toUpperCase();
    const pStatus = String(b.payment_status || '').toUpperCase();
    const isCancelled = ['CANCELLED', 'REJECTED', 'DECLINED'].includes(bStatus);
    const isRefunded = ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(pStatus);
    const isPaid = ['PAID', 'COMPLETED', 'SUCCESS'].includes(pStatus);
    const isConfirmedFree = bStatus === 'CONFIRMED' && Number(b.subtotal || b.total || 0) === 0;

    if (!isCancelled && !isRefunded && (isPaid || isConfirmedFree)) {
      const dayKey = new Date(b.created_at).toISOString().split('T')[0];
      if (timeBucketsMap[dayKey]) {
        let cafeNet = Number(b.cafe_amount || 0);
        if (cafeNet <= 0) {
          const calcSub = Number(b.subtotal || b.total || 0);
          const evAmt = Number(b.event_service_amount || 0);
          cafeNet = Math.max(0, calcSub - evAmt);
        }
        timeBucketsMap[dayKey].bookingRevenue += cafeNet;
        timeBucketsMap[dayKey].totalRevenue += cafeNet;
        timeBucketsMap[dayKey].bookings += 1;
      }
    }
  });

  const revenueTimeline = Object.values(timeBucketsMap);

  // 8. Event and Funnel Aggregations
  let totalViews = 0;
  let menuViews = 0;
  let wishlistAdds = 0;
  let directionsClicks = 0;
  let contactClicks = 0;
  const uniqueVisitorsSet = new Set();
  const sourcesCount = {};

  events.forEach(e => {
    const visitorKey = e.user_id || e.session_id || e.id;
    uniqueVisitorsSet.add(visitorKey);
    const src = e.source || 'direct';
    sourcesCount[src] = (sourcesCount[src] || 0) + 1;

    switch (e.event_type) {
      case 'CAFE_VIEW': totalViews++; break;
      case 'MENU_VIEW': menuViews++; break;
      case 'WISHLIST_ADD': wishlistAdds++; break;
      case 'DIRECTIONS_CLICK': directionsClicks++; break;
      case 'CONTACT_CLICK':
      case 'PHONE_CLICK':
      case 'WHATSAPP_CLICK': contactClicks++; break;
      default: break;
    }
  });

  // Discovery Sources
  const discoverySources = Object.keys(sourcesCount).map(src => ({
    source: src,
    count: sourcesCount[src]
  })).sort((a, b) => b.count - a.count);

  // Interest Funnel
  const funnel = [
    { stage: 'Venue Views', count: totalViews },
    { stage: 'Menu Views', count: menuViews },
    { stage: 'Food Orders Placed', count: totalFoodOrdersCount },
    { stage: 'Food Orders Paid', count: paidFoodOrdersCount },
    { stage: 'Table Reservations', count: eligibleBookingCount }
  ];

  // Dynamic Insights
  const insights = [];
  if (netFoodRevenue > 0) {
    insights.push(`Your food ordering generated ₹${netFoodRevenue.toLocaleString()} across ${paidFoodOrdersCount} orders.`);
  }
  if (netBookingRevenue > 0) {
    insights.push(`Table reservations brought ₹${netBookingRevenue.toLocaleString()} from ${eligibleBookingCount} bookings.`);
  }
  if (totalCustomers > 0) {
    insights.push(`You served ${totalCustomers} unique customers during this period.`);
  }
  if (insights.length === 0) {
    insights.push(`Your restaurant is active and ready to receive customer orders and table reservations.`);
  }

  return {
    cafe_id: cafeId,
    cafe_name: cafe.name,
    category: cafe.category || 'Restaurant',
    period,
    date_range: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    },
    // Overall KPIs
    kpi: {
      overall_revenue: Math.round(overallRevenue * 100) / 100,
      food_revenue: Math.round(netFoodRevenue * 100) / 100,
      booking_revenue: Math.round(netBookingRevenue * 100) / 100,
      total_food_orders: totalFoodOrdersCount,
      paid_food_orders: paidFoodOrdersCount,
      pending_food_payments: pendingFoodPaymentsCount,
      cancelled_food_orders: cancelledFoodOrdersCount,
      total_bookings: bookings.length,
      eligible_bookings: eligibleBookingCount,
      total_customers: totalCustomers,
      food_customers: foodCustomerSet.size,
      booking_customers: bookingCustomerSet.size,
      avg_food_order_value: avgFoodOrderValue,
      avg_booking_value: avgBookingValue
    },
    // Charts & timelines
    timeline: revenueTimeline,
    top_selling_food_items: topSellingFoodItems,
    funnel,
    discovery_sources: discoverySources,
    overview: {
      total_views: totalViews,
      unique_visitors: uniqueVisitorsSet.size,
      menu_views: menuViews,
      wishlist_adds: wishlistAdds,
      directions_clicks: directionsClicks,
      contact_clicks: contactClicks
    },
    insights
  };
};

module.exports = {
  recordEvent,
  getCafeAnalytics
};
