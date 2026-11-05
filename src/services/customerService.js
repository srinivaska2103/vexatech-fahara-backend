const prisma = require('../config/prisma');

/**
 * Normalized helper to extract normalized phone number
 */
const normalizePhone = (phone) => {
  if (!phone) return null;
  // Keep only digits, stripping leading country codes if any or spaces
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10); // last 10 digits
  }
  return digits || null;
};

/**
 * Normalized helper for email
 */
const normalizeEmail = (email) => {
  if (!email) return null;
  return String(email).trim().toLowerCase();
};

/**
 * Get unified list of customers for a restaurant/cafe owner, merging:
 * 1. Table/Venue Bookings
 * 2. Food Orders
 * 3. Cafe Analytics/Engagement Events
 * 
 * Supports deduplication by:
 * - Customer user ID
 * - Normalized Phone number
 * - Normalized Email
 * All partitioned strictly by restaurant owner scope.
 */
const getCustomersByOwner = async (ownerId, userRole = 'CAFE_OWNER', filters = {}) => {
  const isAdmin = userRole === 'ADMIN';
  const isEventManager = userRole === 'EVENT_MANAGER';

  // 1. Determine cafes belonging to this owner
  let ownerCafes = [];
  if (isAdmin) {
    ownerCafes = await prisma.cafes.findMany({ select: { id: true, name: true, owner_id: true } });
  } else {
    ownerCafes = await prisma.cafes.findMany({ where: { owner_id: ownerId }, select: { id: true, name: true, owner_id: true } });
  }
  const cafeIds = ownerCafes.map(c => c.id);
  const cafeNameMap = {};
  ownerCafes.forEach(c => { cafeNameMap[c.id] = c.name; });

  // Event service IDs if applicable
  let eventServiceIds = [];
  if (isEventManager) {
    const eventServices = await prisma.event_services.findMany({
      where: { user_id: ownerId },
      select: { id: true }
    });
    eventServiceIds = eventServices.map(es => es.id);
  }

  // 2. Query bookings for this owner
  let bookingWhere = {};
  if (!isAdmin) {
    if (isEventManager) {
      bookingWhere = { event_service_id: { in: eventServiceIds } };
    } else {
      bookingWhere = { cafes: { owner_id: ownerId } };
    }
  }

  const [bookings, foodOrders] = await Promise.all([
    prisma.bookings.findMany({
      where: bookingWhere,
      include: {
        users: true,
        cafes: { select: { id: true, name: true } }
      },
      orderBy: { created_at: 'desc' }
    }),
    (!isEventManager && (cafeIds.length > 0 || isAdmin)) ? prisma.food_orders.findMany({
      where: isAdmin ? {} : { cafe_id: { in: cafeIds } },
      include: {
        users: true,
        cafes: { select: { id: true, name: true } }
      },
      orderBy: { created_at: 'desc' }
    }) : []
  ]);

  // Master deduplication maps:
  // Keyed by primary match: user_id OR phone OR email
  const customerMap = {};
  const phoneToKey = {};
  const emailToKey = {};

  const getOrCreateCustomerRecord = (userData, sourceRef, createdAtDate) => {
    const userId = userData.id || null;
    const phone = normalizePhone(userData.phone);
    const email = normalizeEmail(userData.email);

    // Matching order: user ID -> phone -> email
    let existingKey = null;
    if (userId && customerMap[userId]) {
      existingKey = userId;
    } else if (phone && phoneToKey[phone] && customerMap[phoneToKey[phone]]) {
      existingKey = phoneToKey[phone];
    } else if (email && emailToKey[email] && customerMap[emailToKey[email]]) {
      existingKey = emailToKey[email];
    }

    if (existingKey) {
      const rec = customerMap[existingKey];
      // Backfill missing contact info if available
      if (!rec.name && userData.name) rec.name = userData.name;
      if (!rec.phone && userData.phone) rec.phone = userData.phone;
      if (!rec.email && userData.email) rec.email = userData.email;
      if (!rec.profile_image && userData.profile_image) rec.profile_image = userData.profile_image;
      return rec;
    }

    // Generate new key
    const primaryKey = userId || (phone ? `phone_${phone}` : `email_${email}`) || `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdDate = createdAtDate || userData.created_at || new Date();

    const newRecord = {
      id: userId || primaryKey,
      user_id: userId,
      name: userData.name || 'Guest Customer',
      email: userData.email || '',
      phone: userData.phone || '',
      profile_image: userData.profile_image || null,
      created_at: createdDate,
      first_interaction: createdDate,
      last_interaction: createdDate,
      status: userData.status || 'ACTIVE',
      is_vip: false,
      total_bookings: 0,
      total_food_orders: 0,
      booking_spend: 0,
      food_spend: 0,
      total_spend: 0,
      customer_sources: new Set(),
      customer_source: 'TABLE_BOOKING',
      notes: [],
      cafeVisits: {},
      eventVisits: {},
      orders_history: [],
      bookings_history: []
    };

    customerMap[primaryKey] = newRecord;
    if (phone) phoneToKey[phone] = primaryKey;
    if (email) emailToKey[email] = primaryKey;

    return newRecord;
  };

  // 3. Process Bookings
  for (const b of bookings) {
    const custUser = b.users || {
      id: b.customer_id,
      name: b.customer_name || 'Guest Diner',
      phone: b.customer_phone || '',
      email: b.customer_email || ''
    };

    const record = getOrCreateCustomerRecord(custUser, 'BOOKING', b.created_at);
    record.total_bookings += 1;
    record.customer_sources.add('TABLE_BOOKING');

    // Update interactions
    const bDate = new Date(b.created_at || b.booking_date || Date.now());
    if (!record.first_interaction || bDate < new Date(record.first_interaction)) {
      record.first_interaction = bDate;
    }
    if (!record.last_interaction || bDate > new Date(record.last_interaction)) {
      record.last_interaction = bDate;
    }

    // Revenue calculation
    const bStatus = String(b.booking_status || '').toUpperCase();
    const pStatus = String(b.payment_status || '').toUpperCase();
    const isCancelled = ['CANCELLED', 'REJECTED', 'DECLINED'].includes(bStatus);
    const isRefunded = ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(pStatus);

    if (!isCancelled && !isRefunded) {
      const isPaid = ['PAID', 'COMPLETED', 'SUCCESS'].includes(pStatus);
      const isFreeConfirmed = bStatus === 'CONFIRMED' && Number(b.subtotal || b.total || 0) === 0;

      if (isPaid || isFreeConfirmed) {
        let spend = 0;
        if (userRole === 'CAFE_OWNER' || userRole === 'RESTAURANT_OWNER') {
          spend = Number(b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0));
        } else if (isEventManager) {
          spend = Number(b.event_service_amount || 0);
        } else {
          spend = Number(b.subtotal || 0);
        }
        const eligibleSpend = Math.max(0, spend);
        record.booking_spend += eligibleSpend;
        record.total_spend += eligibleSpend;
      }
    }

    if (b.cafes?.name) {
      record.cafeVisits[b.cafes.name] = (record.cafeVisits[b.cafes.name] || 0) + 1;
    }
  }

  // 4. Process Food Orders
  for (const o of foodOrders) {
    const custUser = o.users || {
      id: o.customer_id,
      name: o.customer_name || 'Food Customer',
      phone: o.customer_phone || '',
      email: o.users?.email || ''
    };

    const record = getOrCreateCustomerRecord(custUser, 'FOOD_ORDER', o.created_at);
    record.total_food_orders += 1;
    record.customer_sources.add('FOOD_ORDER');

    // Update interactions
    const oDate = new Date(o.created_at || Date.now());
    if (!record.first_interaction || oDate < new Date(record.first_interaction)) {
      record.first_interaction = oDate;
    }
    if (!record.last_interaction || oDate > new Date(record.last_interaction)) {
      record.last_interaction = oDate;
    }

    // Revenue calculation: Only successfully paid food orders count toward spending
    const oStatus = String(o.order_status || '').toUpperCase();
    const pStatus = String(o.payment_status || '').toUpperCase();
    const isCancelled = ['CANCELLED', 'REJECTED'].includes(oStatus);
    const isPaid = pStatus === 'PAID';

    if (!isCancelled && isPaid) {
      const foodSpend = Number(o.total_amount || 0);
      record.food_spend += foodSpend;
      record.total_spend += foodSpend;
    }

    if (o.cafes?.name) {
      record.cafeVisits[o.cafes.name] = (record.cafeVisits[o.cafes.name] || 0) + 1;
    }
  }

  // 5. Include Users who interacted via Analytics Events (if any)
  if (cafeIds.length > 0 && prisma.cafe_analytics_events) {
    try {
      const analyticsUsers = await prisma.cafe_analytics_events.findMany({
        where: {
          cafe_id: { in: cafeIds },
          user_id: { not: null }
        },
        include: { users: true },
        orderBy: { created_at: 'desc' },
        take: 100
      });

      for (const ev of analyticsUsers) {
        if (!ev.users) continue;
        const record = getOrCreateCustomerRecord(ev.users, 'DISCOVERY', ev.created_at);
        const cafeName = cafeNameMap[ev.cafe_id];
        if (cafeName) {
          record.cafeVisits[cafeName] = (record.cafeVisits[cafeName] || 0) + 1;
        }
      }
    } catch (e) {
      console.warn('[customerService] Analytics events query skipped:', e.message);
    }
  }

  // 6. Final Formatting, Sources & Notes
  const customerList = Object.values(customerMap).map(c => {
    // Determine customer source label
    const sources = Array.from(c.customer_sources);
    let customer_source = 'OTHER';
    if (sources.includes('FOOD_ORDER') && sources.includes('TABLE_BOOKING')) {
      customer_source = 'MULTIPLE';
    } else if (sources.includes('FOOD_ORDER')) {
      customer_source = 'FOOD_ORDER';
    } else if (sources.includes('TABLE_BOOKING')) {
      customer_source = 'TABLE_BOOKING';
    } else if (sources.includes('EVENT_BOOKING')) {
      customer_source = 'EVENT_BOOKING';
    }

    // Favorite cafe
    let favorite_cafe = 'None yet';
    let maxCafeVisits = 0;
    for (const [cafeName, visits] of Object.entries(c.cafeVisits)) {
      if (visits > maxCafeVisits) {
        maxCafeVisits = visits;
        favorite_cafe = cafeName;
      }
    }

    // Delete sensitive fields
    delete c.password_hash;
    delete c.google_id;
    delete c.customer_sources;

    return {
      ...c,
      customer_source,
      favorite_cafe,
      total_bookings: c.total_bookings,
      total_food_orders: c.total_food_orders,
      booking_spend: Number(c.booking_spend.toFixed(2)),
      food_spend: Number(c.food_spend.toFixed(2)),
      total_spend: Number(c.total_spend.toFixed(2))
    };
  });

  // Attach private notes for this owner
  try {
    const allNotes = await prisma.customer_notes.findMany({
      where: isAdmin ? {} : { owner_id: ownerId },
      orderBy: { created_at: 'desc' }
    });

    allNotes.forEach(note => {
      const cust = customerList.find(c => c.id === note.customer_id || c.user_id === note.customer_id);
      if (cust) {
        cust.notes.push(note);
      }
    });
  } catch (err) {
    console.warn('[customerService] Customer notes fetch error:', err.message);
  }

  // Sort by newest interaction date
  customerList.sort((a, b) => new Date(b.last_interaction || 0) - new Date(a.last_interaction || 0));

  return customerList;
};

/**
 * Get detailed customer profile with complete booking and food order histories
 */
const getCustomerById = async (customerId, ownerId, userRole = 'CAFE_OWNER') => {
  const customers = await getCustomersByOwner(ownerId, userRole);
  const customer = customers.find(u => u.id === customerId || u.user_id === customerId);
  if (!customer) return null;

  // Fetch reviews submitted by this customer
  let average_rating = 0;
  try {
    const reviews = await prisma.reviews.findMany({
      where: { customer_id: customer.user_id || customerId },
      select: { rating: true }
    });

    if (reviews.length > 0) {
      const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
      average_rating = (sum / reviews.length).toFixed(1);
    }
  } catch (err) {
    console.warn('[customerService] Reviews calculation error:', err.message);
  }

  return {
    ...customer,
    average_rating
  };
};

/**
 * Get bookings history for customer
 */
const getCustomerBookings = async (customerId, ownerId, userRole = 'CAFE_OWNER') => {
  const isAdmin = userRole === 'ADMIN';
  const isEventManager = userRole === 'EVENT_MANAGER';

  let ownerCafes = [];
  if (isAdmin) {
    ownerCafes = await prisma.cafes.findMany({ select: { id: true } });
  } else {
    ownerCafes = await prisma.cafes.findMany({ where: { owner_id: ownerId }, select: { id: true } });
  }
  const cafeIds = ownerCafes.map(c => c.id);

  let whereClause = {
    customer_id: customerId,
    ...(isAdmin ? {} : { cafe_id: { in: cafeIds } })
  };

  const bookings = await prisma.bookings.findMany({
    where: whereClause,
    include: {
      cafes: { select: { name: true } }
    },
    orderBy: { created_at: 'desc' }
  });

  return bookings.map(b => {
    let spend = 0;
    if (userRole === 'CAFE_OWNER' || userRole === 'RESTAURANT_OWNER') {
      spend = Number(b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0));
    } else if (isEventManager) {
      spend = Number(b.event_service_amount || 0);
    } else {
      spend = Number(b.subtotal || 0);
    }
    
    return {
      ...b,
      total_price: Math.max(0, spend)
    };
  });
};

/**
 * Get food order history for a customer
 */
const getCustomerFoodOrders = async (customerId, ownerId, userRole = 'CAFE_OWNER') => {
  const isAdmin = userRole === 'ADMIN';

  let ownerCafes = [];
  if (isAdmin) {
    ownerCafes = await prisma.cafes.findMany({ select: { id: true } });
  } else {
    ownerCafes = await prisma.cafes.findMany({ where: { owner_id: ownerId }, select: { id: true } });
  }
  const cafeIds = ownerCafes.map(c => c.id);

  const orders = await prisma.food_orders.findMany({
    where: {
      customer_id: customerId,
      ...(isAdmin ? {} : { cafe_id: { in: cafeIds } })
    },
    include: {
      cafes: { select: { name: true } },
      food_order_items: true
    },
    orderBy: { created_at: 'desc' }
  });

  return orders;
};

/**
 * Get unified payment records for this customer (Bookings + Food Orders)
 */
const getCustomerPayments = async (customerId, ownerId, userRole = 'CAFE_OWNER') => {
  const isAdmin = userRole === 'ADMIN';

  let ownerCafes = [];
  if (isAdmin) {
    ownerCafes = await prisma.cafes.findMany({ select: { id: true } });
  } else {
    ownerCafes = await prisma.cafes.findMany({ where: { owner_id: ownerId }, select: { id: true } });
  }
  const cafeIds = ownerCafes.map(c => c.id);

  // Booking payments
  const bookingPayments = await prisma.payments.findMany({
    where: {
      bookings: {
        customer_id: customerId,
        ...(isAdmin ? {} : { cafe_id: { in: cafeIds } })
      }
    },
    include: {
      bookings: { select: { booking_number: true, cafes: { select: { name: true } } } }
    },
    orderBy: { paid_at: 'desc' }
  });

  // Food Order payments
  const foodOrders = await prisma.food_orders.findMany({
    where: {
      customer_id: customerId,
      payment_status: 'PAID',
      ...(isAdmin ? {} : { cafe_id: { in: cafeIds } })
    },
    include: {
      cafes: { select: { name: true } }
    },
    orderBy: { updated_at: 'desc' }
  });

  const formattedFoodPayments = foodOrders.map(fo => ({
    id: `fo_${fo.id}`,
    amount: fo.total_amount,
    payment_method: fo.order_type === 'TAKEAWAY' ? 'ONLINE' : 'ONLINE',
    status: 'SUCCESS',
    paid_at: fo.updated_at || fo.created_at,
    created_at: fo.created_at,
    type: 'FOOD_ORDER',
    order_number: fo.order_number,
    cafe_name: fo.cafes?.name
  }));

  return [
    ...bookingPayments.map(bp => ({ ...bp, type: 'TABLE_BOOKING' })),
    ...formattedFoodPayments
  ].sort((a, b) => new Date(b.paid_at || b.created_at || 0) - new Date(a.paid_at || a.created_at || 0));
};

/**
 * Get customer reviews
 */
const getCustomerReviews = async (customerId, ownerId, userRole = 'CAFE_OWNER') => {
  let whereClause = { customer_id: customerId };

  if (userRole !== 'ADMIN') {
    whereClause = {
      customer_id: customerId,
      cafes: { owner_id: ownerId }
    };
  }

  return await prisma.reviews.findMany({
    where: whereClause,
    include: {
      cafes: { select: { name: true } }
    },
    orderBy: { created_at: 'desc' }
  });
};

/**
 * High-level customer management KPI analytics
 */
const getCustomerAnalytics = async (ownerId, userRole = 'CAFE_OWNER') => {
  const customers = await getCustomersByOwner(ownerId, userRole);
  const totalCustomers = customers.length;
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newCustomers = customers.filter(c => new Date(c.first_interaction || c.created_at) >= startOfMonth).length;

  const foodCustomers = customers.filter(c => (c.total_food_orders || 0) > 0).length;
  const bookingCustomers = customers.filter(c => (c.total_bookings || 0) > 0).length;

  const returningCustomers = customers.filter(c => ((c.total_bookings || 0) + (c.total_food_orders || 0)) > 1).length;
  const returningRate = totalCustomers > 0 ? Math.round((returningCustomers / totalCustomers) * 100) : 0;

  const totalSpend = customers.reduce((sum, c) => sum + (c.total_spend || 0), 0);
  const foodSpend = customers.reduce((sum, c) => sum + (c.food_spend || 0), 0);
  const bookingSpend = customers.reduce((sum, c) => sum + (c.booking_spend || 0), 0);
  const averageSpend = totalCustomers > 0 ? Math.round(totalSpend / totalCustomers) : 0;

  const topCustomers = [...customers]
    .sort((a, b) => b.total_spend - a.total_spend)
    .slice(0, 5)
    .map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      avatar: c.profile_image,
      total_spend: c.total_spend,
      food_spend: c.food_spend,
      booking_spend: c.booking_spend,
      total_bookings: c.total_bookings,
      total_food_orders: c.total_food_orders,
      customer_source: c.customer_source
    }));

  return {
    totalCustomers,
    foodCustomers,
    bookingCustomers,
    newCustomers,
    returningCustomers: returningRate,
    returningCount: returningCustomers,
    totalSpend,
    foodSpend,
    bookingSpend,
    averageSpend,
    topCustomers
  };
};

/**
 * Note actions
 */
const addCustomerNote = async (customerId, ownerId, note) => {
  return await prisma.customer_notes.create({
    data: {
      customer_id: customerId,
      owner_id: ownerId,
      note
    }
  });
};

const updateCustomerNote = async (noteId, note) => {
  return await prisma.customer_notes.update({
    where: { id: noteId },
    data: { note, updated_at: new Date() }
  });
};

const deleteCustomerNote = async (noteId) => {
  return await prisma.customer_notes.delete({
    where: { id: noteId }
  });
};

module.exports = {
  getCustomersByOwner,
  getCustomerById,
  getCustomerBookings,
  getCustomerFoodOrders,
  getCustomerPayments,
  getCustomerReviews,
  getCustomerAnalytics,
  addCustomerNote,
  updateCustomerNote,
  deleteCustomerNote,
};
