const prisma = require('../config/prisma');

const getCustomersByOwner = async (ownerId, userRole = 'CAFE_OWNER') => {
  let whereClause = {};

  if (userRole !== 'ADMIN') {
    whereClause = {
      cafes: {
        owner_id: ownerId
      }
    };

    if (userRole === 'EVENT_MANAGER') {
      const eventServices = await prisma.event_services.findMany({
        where: { user_id: ownerId },
        select: { id: true }
      });
      const eventServiceIds = eventServices.map(es => es.id);
      whereClause = {
        event_service_id: { in: eventServiceIds }
      };
    }
  }

  // Find all bookings for this owner's cafes or event services
  const bookings = await prisma.bookings.findMany({
    where: whereClause,
    include: {
      users: true,
      cafes: { select: { name: true } }
    }
  });

  // Group by customer
  const customerMap = {};
  for (const b of bookings) {
    if (!b.users) continue;
    
    if (!customerMap[b.users.id]) {
      customerMap[b.users.id] = {
        ...b.users,
        id: b.users.id,
        name: b.users.name,
        email: b.users.email,
        phone: b.users.phone,
        profile_image: b.users.profile_image,
        created_at: b.users.created_at,
        status: b.users.status,
        is_vip: false,
        total_bookings: 0,
        total_spend: 0,
        notes: [],
        cafeVisits: {},
        eventVisits: {}
      };
    }
    
    customerMap[b.users.id].total_bookings += 1;
    
    let spend = 0;
    if (userRole === 'CAFE_OWNER') {
      spend = Number(b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0));
    } else if (userRole === 'EVENT_MANAGER') {
      spend = Number(b.event_service_amount || 0);
    } else if (userRole === 'ADMIN') {
      spend = Number(b.subtotal || 0);
    }
    
    customerMap[b.users.id].total_spend += spend;

    if (b.cafes?.name) {
      customerMap[b.users.id].cafeVisits[b.cafes.name] = (customerMap[b.users.id].cafeVisits[b.cafes.name] || 0) + 1;
    }
    
    if (b.event_service_id) {
      customerMap[b.users.id].eventVisits[b.event_service_id] = (customerMap[b.users.id].eventVisits[b.event_service_id] || 0) + 1;
    }
  }

  // Get unique event service IDs to fetch their names
  const eventServiceIdsToFetch = new Set();
  for (const customer of Object.values(customerMap)) {
    for (const eventId of Object.keys(customer.eventVisits)) {
      eventServiceIdsToFetch.add(eventId);
    }
  }

  const eventServicesMap = {};
  if (eventServiceIdsToFetch.size > 0) {
    const services = await prisma.event_services.findMany({
      where: { id: { in: Array.from(eventServiceIdsToFetch) } },
      select: { id: true, service_name: true, category: true }
    });
    services.forEach(s => {
      eventServicesMap[s.id] = s.service_name || s.category;
    });
  }

  return Object.values(customerMap).map(customer => {
    let favorite_cafe = 'None yet';
    let maxCafeVisits = 0;
    for (const [cafeName, visits] of Object.entries(customer.cafeVisits)) {
      if (visits > maxCafeVisits) {
        maxCafeVisits = visits;
        favorite_cafe = cafeName;
      }
    }

    let preferred_event = 'General';
    let maxEventVisits = 0;
    for (const [eventId, visits] of Object.entries(customer.eventVisits)) {
      if (visits > maxEventVisits) {
        maxEventVisits = visits;
        preferred_event = eventServicesMap[eventId] || 'General';
      }
    }

    // Remove sensitive fields
    delete customer.password_hash;
    delete customer.google_id;

    return {
      ...customer,
      favorite_cafe,
      preferred_event
    };
  });

  // Fetch all notes for this owner (if not admin, else all customer notes)
  const allNotes = await prisma.customer_notes.findMany({
    where: userRole === 'ADMIN' ? {} : { owner_id: ownerId },
    orderBy: { created_at: 'desc' }
  });

  for (const note of allNotes) {
    const cust = result.find(c => c.id === note.customer_id);
    if (cust) {
      cust.notes.push(note);
    }
  }

  return result;
};

const getCustomerById = async (customerId, ownerId, userRole = 'CAFE_OWNER') => {
  const users = await getCustomersByOwner(ownerId, userRole);
  return users.find(u => u.id === customerId) || null;
};

const getCustomerBookings = async (customerId, ownerId, userRole = 'CAFE_OWNER') => {
  let whereClause = { customer_id: customerId };

  if (userRole !== 'ADMIN') {
    whereClause = {
      customer_id: customerId,
      cafes: {
        owner_id: ownerId
      }
    };

    if (userRole === 'EVENT_MANAGER') {
      const eventServices = await prisma.event_services.findMany({
        where: { user_id: ownerId },
        select: { id: true }
      });
      const eventServiceIds = eventServices.map(es => es.id);
      whereClause = {
        customer_id: customerId,
        event_service_id: { in: eventServiceIds }
      };
    }
  }

  const bookings = await prisma.bookings.findMany({
    where: whereClause,
    include: {
      cafes: { select: { name: true } }
    },
    orderBy: { created_at: 'desc' }
  });

  return bookings.map(b => {
    let spend = 0;
    if (userRole === 'CAFE_OWNER') {
      spend = Number(b.subtotal || 0) - ((b.package_id && !b.event_service_id) ? 0 : Number(b.event_service_amount || 0));
    } else if (userRole === 'EVENT_MANAGER') {
      spend = Number(b.event_service_amount || 0);
    } else if (userRole === 'ADMIN') {
      spend = Number(b.subtotal || 0);
    }
    
    return {
      ...b,
      total_price: spend
    };
  });
};

const getCustomerPayments = async (customerId, ownerId, userRole = 'CAFE_OWNER') => {
  let whereClause = {
    bookings: { customer_id: customerId }
  };

  if (userRole !== 'ADMIN') {
    whereClause = {
      bookings: {
        customer_id: customerId,
        cafes: { owner_id: ownerId }
      }
    };

    if (userRole === 'EVENT_MANAGER') {
      const eventServices = await prisma.event_services.findMany({
        where: { user_id: ownerId },
        select: { id: true }
      });
      const eventServiceIds = eventServices.map(es => es.id);
      whereClause = {
        bookings: {
          customer_id: customerId,
          event_service_id: { in: eventServiceIds }
        }
      };
    }
  }

  return await prisma.payments.findMany({
    where: whereClause,
    include: {
      bookings: { select: { booking_number: true, cafes: { select: { name: true } } } }
    },
    orderBy: { paid_at: 'desc' }
  });
};

const getCustomerReviews = async (customerId, ownerId, userRole = 'CAFE_OWNER') => {
  let whereClause = { customer_id: customerId };

  if (userRole !== 'ADMIN') {
    whereClause = {
      customer_id: customerId,
      cafes: { owner_id: ownerId }
    };

    if (userRole === 'EVENT_MANAGER') {
      const eventServices = await prisma.event_services.findMany({
        where: { user_id: ownerId },
        select: { id: true }
      });
      const eventServiceIds = eventServices.map(es => es.id);
      whereClause = {
        customer_id: customerId,
        event_services: { id: { in: eventServiceIds } }
      };
    }
  }

  return await prisma.reviews.findMany({
    where: whereClause,
    include: {
      cafes: { select: { name: true } }
    },
    orderBy: { created_at: 'desc' }
  });
};

const getCustomerAnalytics = async (ownerId, userRole = 'CAFE_OWNER') => {
  const customers = await getCustomersByOwner(ownerId, userRole);
  const totalCustomers = customers.length;
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newCustomers = customers.filter(c => new Date(c.created_at) >= startOfMonth).length;

  const returningCustomers = customers.filter(c => c.total_bookings > 1).length;
  const returningRate = totalCustomers > 0 ? Math.round((returningCustomers / totalCustomers) * 100) : 0;

  const totalSpend = customers.reduce((sum, c) => sum + c.total_spend, 0);
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
      total_bookings: c.total_bookings
    }));

  return {
    totalCustomers,
    newCustomers,
    returningCustomers: returningRate,
    averageSpend,
    topCustomers
  };
};

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
  getCustomerPayments,
  getCustomerReviews,
  getCustomerAnalytics,
  addCustomerNote,
  updateCustomerNote,
  deleteCustomerNote,
};
// Trigger nodemon restart
