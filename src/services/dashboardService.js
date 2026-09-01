const prisma = require('../config/prisma');
const paymentService = require('./paymentService');

const getSummary = async (ownerId, role) => {
  const isAdmin = role === 'ADMIN';

  // Aggregate revenue and bookings
  const bookings = await prisma.bookings.findMany({
    where: isAdmin ? {} : { cafes: { owner_id: ownerId } },
    include: { users: true }
  });

  const activeBookings = bookings.filter(b => b.booking_status === 'CONFIRMED' || b.booking_status === 'PENDING').length;
  
  const totalRevenue = bookings
    .filter(b => ['COMPLETED', 'CONFIRMED'].includes((b.booking_status || '').toUpperCase()) || ['COMPLETED', 'PAID', 'SUCCESS'].includes((b.payment_status || '').toUpperCase()))
    .reduce((sum, b) => sum + Number(b.subtotal || b.total || 0), 0);

  const customerSet = new Set();
  bookings.forEach(b => {
    if (b.customer_id) customerSet.add(b.customer_id);
  });
  const totalCustomers = customerSet.size;

  let adminExtra = {};
  if (isAdmin) {
    const [cafes, users, roles, pendingProfilesCount] = await Promise.all([
      prisma.cafes.findMany(),
      prisma.users.findMany({ include: { roles: true } }),
      prisma.roles.findMany(),
      prisma.event_management_profiles.count({ where: { verification_status: 'PENDING' } })
    ]);
    
    const cafeOwnerRole = roles.find(r => r.name === 'CAFE_OWNER');
    const eventManagerRole = roles.find(r => r.name === 'EVENT_MANAGER');

    const totalCafes = cafes.length;
    const totalCafeOwners = users.filter(u => u.role_id === cafeOwnerRole?.id).length;
    const totalEventManagers = users.filter(u => u.role_id === eventManagerRole?.id).length;
    
    const isSuccessful = (b) => {
      const bStatus = (b.booking_status || '').toUpperCase();
      const pStatus = (b.payment_status || '').toUpperCase();
      return ['COMPLETED', 'CONFIRMED'].includes(bStatus) || ['COMPLETED', 'PAID', 'SUCCESS'].includes(pStatus);
    };

    const completedBookings = bookings.filter(b => (b.booking_status || '').toUpperCase() === 'COMPLETED' || (b.payment_status || '').toUpperCase() === 'PAID').length;
    const cancelledBookings = bookings.filter(b => (b.booking_status || '').toUpperCase() === 'CANCELLED').length;
    const pendingVerifications = cafes.filter(c => c.status === 'PENDING').length + pendingProfilesCount;
    
        // Sum actual fahara_service_charge stored per completed/paid/confirmed booking, with 3% subtotal fallback
        const faharaRevenue = bookings
          .filter(isSuccessful)
          .reduce((sum, b) => {
            const storedFee = Number(b.fahara_service_charge || 0);
            if (storedFee > 0) return sum + storedFee;
            const sub = Number(b.subtotal || 0);
            return sum + Number((sub * 0.03).toFixed(2));
          }, 0);

    const growthData = [];
    for (let i = 3; i >= 0; i--) {
      const todayDate = new Date();
      const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - i + 1, 0); // End of that month
      
      const monthCafes = cafes.filter(c => new Date(c.created_at || c.createdAt || Date.now()) <= d).length;
      
      const monthCustomers = new Set(bookings.filter(b => b.customer_id && new Date(b.created_at || Date.now()) <= d).map(b => b.customer_id)).size;
      
      const monthManagers = users.filter(u => u.role_id === eventManagerRole?.id && new Date(u.created_at || u.createdAt || Date.now()) <= d).length;
      
      growthData.push({
        name: d.toLocaleDateString('en-US', { month: 'short' }),
        cafes: monthCafes,
        customers: monthCustomers,
        managers: monthManagers
      });
    }

    // Pending payouts = exact sum of un-disbursed partner payouts from paymentService
    const adminPayoutsResp = await paymentService.getAdminPayouts({});
    const pendingPayoutsList = adminPayoutsResp.data || [];
    const pendingPayoutsAmount = pendingPayoutsList
      .filter(p => p.status !== 'COMPLETED' && p.payout_status !== 'COMPLETED')
      .reduce((sum, p) => sum + Number(p.payable_amount || p.gross_amount || 0), 0);

    adminExtra = {
      total_cafes: totalCafes,
      total_cafe_owners: totalCafeOwners,
      total_event_managers: totalEventManagers,
      completed_bookings: completedBookings,
      cancelled_bookings: cancelledBookings,
      fahara_revenue: faharaRevenue,
      pending_payouts: pendingPayoutsAmount,
      refund_amount: 0, // Mock for now
      pending_verifications: pendingVerifications,
      growth_chart: growthData
    };
  }

  // Calculate Trends (Last 30 days vs Previous 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const thisMonthRevenue = bookings
    .filter(b => new Date(b.created_at) >= thirtyDaysAgo && (b.booking_status === 'COMPLETED' || b.payment_status === 'COMPLETED' || b.payment_status === 'PAID'))
    .reduce((sum, b) => sum + Number((b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0))), 0);
  const lastMonthRevenue = bookings
    .filter(b => new Date(b.created_at) >= sixtyDaysAgo && new Date(b.created_at) < thirtyDaysAgo && (b.booking_status === 'COMPLETED' || b.payment_status === 'COMPLETED' || b.payment_status === 'PAID'))
    .reduce((sum, b) => sum + Number((b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0))), 0);
  const revenueTrend = lastMonthRevenue > 0 ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : (thisMonthRevenue > 0 ? 100 : 0);

  const thisMonthBookings = bookings.filter(b => new Date(b.created_at) >= thirtyDaysAgo).length;
  const lastMonthBookings = bookings.filter(b => new Date(b.created_at) >= sixtyDaysAgo && new Date(b.created_at) < thirtyDaysAgo).length;
  const bookingTrend = lastMonthBookings > 0 ? Math.round(((thisMonthBookings - lastMonthBookings) / lastMonthBookings) * 100) : (thisMonthBookings > 0 ? 100 : 0);

  const thisMonthCustomers = new Set(bookings.filter(b => new Date(b.created_at) >= thirtyDaysAgo && b.customer_id).map(b => b.customer_id)).size;
  const lastMonthCustomers = new Set(bookings.filter(b => new Date(b.created_at) >= sixtyDaysAgo && new Date(b.created_at) < thirtyDaysAgo && b.customer_id).map(b => b.customer_id)).size;
  const customerTrend = lastMonthCustomers > 0 ? Math.round(((thisMonthCustomers - lastMonthCustomers) / lastMonthCustomers) * 100) : (thisMonthCustomers > 0 ? 100 : 0);

  // Rating
  const reviews = await prisma.reviews.findMany({
    where: isAdmin ? {} : { cafes: { owner_id: ownerId } }
  });
  
  const averageRating = reviews.length > 0 
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : '0.0';

  // Real Revenue Chart (Last 7 days)
  const today = new Date();
  const last7Days = Array.from({length: 7}, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  
  const labels = last7Days.map(d => d.toLocaleDateString('en-US', { weekday: 'short' }));
  
  const revenueData = last7Days.map(d => {
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    
    // Revenue for that day (bookings created or paid that day)
    const dayBookings = bookings.filter(b => 
      b.created_at >= startOfDay && b.created_at < endOfDay && 
      (b.booking_status === 'COMPLETED' || b.payment_status === 'COMPLETED' || b.payment_status === 'PAID')
    );
    return dayBookings.reduce((sum, b) => sum + Number((b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0))), 0);
  });

  const bookingChartData = last7Days.map(d => {
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return bookings.filter(b => b.created_at >= startOfDay && b.created_at < endOfDay).length;
  });

  const paymentDistribution = [
    { name: 'Completed', value: bookings.filter(b => b.booking_status === 'COMPLETED' || b.payment_status === 'COMPLETED' || b.payment_status === 'PAID').length },
    { name: 'Pending', value: bookings.filter(b => b.booking_status === 'PENDING' && b.payment_status !== 'COMPLETED' && b.payment_status !== 'PAID').length },
    { name: 'Refunded', value: bookings.filter(b => b.payment_status === 'REFUNDED').length }
  ];

  // Real Space Occupancy
  const cafes = await prisma.cafes.findMany({
    where: isAdmin ? {} : { owner_id: ownerId }
  });
  
  const totalCapacity = cafes.reduce((sum, c) => sum + (c.maximum_persons || 50), 0);
  
  // Calculate active bookings list
  const validBookings = bookings.filter(b => {
    const st = String(b.booking_status || b.payment_status || '').toUpperCase();
    return ['CONFIRMED', 'PENDING', 'COMPLETED', 'PAID'].includes(st);
  });

  const totalBookedPersons = validBookings.reduce((sum, b) => sum + (Number(b.total_persons) || 1), 0);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const todaysBookings = validBookings.filter(b => {
    if (!b.booking_date) return false;
    const bd = new Date(b.booking_date);
    return bd >= todayStart && bd < todayEnd;
  });

  // Use today's capacity if bookings exist today; otherwise fallback to active/upcoming bookings capacity
  const bookedCapacity = todaysBookings.length > 0 
    ? todaysBookings.reduce((sum, b) => sum + (Number(b.total_persons) || 1), 0)
    : (validBookings.length > 0 ? Math.min(totalBookedPersons, totalCapacity || 50) : 0);

  const maintenanceCapacity = 0; 
  const effectiveTotalCapacity = totalCapacity > 0 ? totalCapacity : 50;
  const cappedBookedCapacity = Math.min(bookedCapacity, effectiveTotalCapacity);
  const availableCapacity = Math.max(0, effectiveTotalCapacity - cappedBookedCapacity - maintenanceCapacity);
  const occupancyRate = effectiveTotalCapacity > 0 ? Math.round((cappedBookedCapacity / effectiveTotalCapacity) * 100) : 0;

  // Top Customers (Most bookings/revenue)
  const customerStats = {};
  bookings.forEach(b => {
    if (b.customer_id) {
      if (!customerStats[b.customer_id]) {
        customerStats[b.customer_id] = { 
          id: b.customer_id, 
          name: b.users?.name || 'Guest', 
          email: b.users?.email || '', 
          visits: 0, 
          spent: 0 
        };
      }
      customerStats[b.customer_id].visits += 1;
      if (b.booking_status === 'COMPLETED' || b.payment_status === 'COMPLETED' || b.payment_status === 'PAID') {
        customerStats[b.customer_id].spent += Number((b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0)));
      }
    }
  });
  const top_customers = Object.values(customerStats)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5)
    .map(c => ({
      ...c,
      total_bookings: c.visits,
      lifetime_value: c.spent
    }));

  // Top Events (group by package_id only, as this is cafe owner dashboard)
  const eventStats = {};
  bookings.forEach(b => {
    const eventId = b.package_id;
    const type = 'package';

    if (eventId) {
      if (!eventStats[eventId]) {
        eventStats[eventId] = { id: eventId, type, tickets_sold: 0, revenue: 0 };
      }
      eventStats[eventId].tickets_sold += (b.total_persons || 0);
      if (b.booking_status === 'COMPLETED' || b.payment_status === 'COMPLETED' || b.payment_status === 'PAID') {
        eventStats[eventId].revenue += Number((b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0)));
      }
    }
  });

  const packageIds = Object.values(eventStats).filter(e => e.type === 'package').map(e => e.id);

  const [cafePackages] = await Promise.all([
    packageIds.length > 0 ? prisma.cafe_packages.findMany({ where: { id: { in: packageIds } }, select: { id: true, package_name: true } }) : []
  ]);

  const eventNameMap = {};
  cafePackages.forEach(p => { eventNameMap[p.id] = p.package_name; });

  const top_events = Object.values(eventStats)
    .map(e => ({ title: eventNameMap[e.id] || 'Unknown', tickets_sold: e.tickets_sold, revenue: e.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
  // Calculate Peak Dining Time Slots from real start_time or created_at
  const timeSlotCounts = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  validBookings.forEach(b => {
    let hour = 12;
    if (b.start_time) {
      const st = new Date(b.start_time);
      if (!isNaN(st.getTime())) {
        hour = st.getUTCHours();
      }
    } else if (b.created_at) {
      hour = new Date(b.created_at).getHours();
    }

    if (hour >= 8 && hour < 12) timeSlotCounts.morning++;
    else if (hour >= 12 && hour < 16) timeSlotCounts.afternoon++;
    else if (hour >= 16 && hour < 20) timeSlotCounts.evening++;
    else timeSlotCounts.night++;
  });

  return {
    total_revenue: totalRevenue,
    revenue_trend: revenueTrend,
    total_bookings: bookings.length,
    booking_trend: bookingTrend,
    new_customers: totalCustomers,
    customer_trend: customerTrend,
    occupancy_rate: occupancyRate,
    occupancy_trend: 0,
    average_rating: Number(averageRating),
    rating_trend: 0,
    revenue_chart: {
      data: revenueData,
      labels: labels
    },
    booking_chart: {
      data: bookingChartData,
      labels: labels
    },
    payment_distribution: paymentDistribution,
    occupancy_breakdown: [cappedBookedCapacity, availableCapacity, maintenanceCapacity],
    top_events: top_events,
    top_customers: top_customers,
    todays_bookings: todaysBookings.length,
    peak_time_slots: [
      { slot: 'Morning (8:00 AM - 12:00 PM)', count: timeSlotCounts.morning },
      { slot: 'Afternoon Peak (12:00 PM - 4:00 PM)', count: timeSlotCounts.afternoon },
      { slot: 'Evening (4:00 PM - 8:00 PM)', count: timeSlotCounts.evening },
      { slot: 'Night (8:00 PM - 11:00 PM)', count: timeSlotCounts.night },
    ],
    ...adminExtra
  };
};

const getRevenueStats = async (ownerId, period, role) => {
  const isAdmin = role === 'ADMIN';
  const bookings = await prisma.bookings.findMany({
    where: { 
      ...(isAdmin ? {} : { cafes: { owner_id: ownerId } }),
      OR: [
        { booking_status: 'COMPLETED' },
        { payment_status: 'COMPLETED' },
        { payment_status: 'PAID' }
      ]
    },
    select: {
      created_at: true,
      subtotal: true,
      event_service_amount: true,
      package_id: true,
      event_service_id: true
    }
  });

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Group by month
  const stats = monthNames.map(name => ({ name, revenue: 0 }));
  
  bookings.forEach(b => {
    if (b.created_at) {
      const month = new Date(b.created_at).getMonth();
      stats[month].revenue += Number((b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0)));
    }
  });

  // Only return up to the current month or maybe all months if desired.
  return stats;
};

const getRecentBookings = async (ownerId, role) => {
  const isAdmin = role === 'ADMIN';
  const bookings = await prisma.bookings.findMany({
    where: isAdmin ? {} : { cafes: { owner_id: ownerId } },
    orderBy: { created_at: 'desc' },
    take: 5,
    include: { users: true, cafes: true }
  });

  return bookings.map(b => ({
    id: b.id,
    customerName: b.users?.name || 'Guest',
    customerEmail: b.users?.email || '',
    cafeName: b.cafes?.name || 'Cafe',
    date: b.booking_date,
    time: b.start_time,
    guests: b.total_persons,
    amount: Number((b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0))),
    status: b.booking_status
  }));
};

const getUpcomingBookings = async (ownerId, role) => {
  const isAdmin = role === 'ADMIN';
  const today = new Date();
  const bookings = await prisma.bookings.findMany({
    where: { 
      ...(isAdmin ? {} : { cafes: { owner_id: ownerId } }),
      booking_date: { gte: today },
      booking_status: { in: ['CONFIRMED', 'PENDING'] }
    },
    orderBy: { booking_date: 'asc' },
    take: 5,
    include: { users: true, cafes: true }
  });

  return bookings.map(b => ({
    id: b.id,
    customerName: b.users?.name || 'Guest',
    cafeName: b.cafes?.name || 'Cafe',
    date: b.booking_date,
    time: b.start_time,
    guests: b.total_persons,
    eventType: b.event_service_id ? 'Event' : (b.package_id ? 'Package' : 'Regular')
  }));
};

const getRecentReviews = async (ownerId, role) => {
  const isAdmin = role === 'ADMIN';
  const reviews = await prisma.reviews.findMany({
    where: isAdmin ? {} : { cafes: { owner_id: ownerId } },
    orderBy: { created_at: 'desc' },
    take: 5,
    include: { users: true }
  });

  return reviews.map(r => ({
    id: r.id,
    customerName: r.users?.name || 'Guest',
    rating: r.rating,
    comment: r.review,
    date: r.created_at
  }));
};

const getActivityTimeline = async (ownerId, role) => {
  const isAdmin = role === 'ADMIN';
  const userEventServices = await prisma.event_services.findMany({
    where: isAdmin ? {} : { user_id: ownerId },
    select: { id: true }
  });
  const eventServiceIds = userEventServices.map(es => es.id);

  const bookings = await prisma.bookings.findMany({
    where: isAdmin ? {} : {
      OR: [
        { cafes: { owner_id: ownerId } },
        ...(eventServiceIds.length > 0 ? [{ event_service_id: { in: eventServiceIds } }] : [])
      ]
    },
    orderBy: { created_at: 'desc' },
    take: 5,
    include: { users: true }
  });

  return bookings.map(b => ({
    id: b.id,
    type: 'booking',
    title: `New Booking from ${b.users?.name || 'Guest'}`,
    description: `Booking for ${b.total_persons} people.`,
    time: b.created_at
  }));
};

module.exports = {
  getSummary,
  getRevenueStats,
  getRecentBookings,
  getUpcomingBookings,
  getRecentReviews,
  getActivityTimeline,
};
