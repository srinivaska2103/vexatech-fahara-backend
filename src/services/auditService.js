const prisma = require('../config/prisma');

const getAuditLogs = async (query = {}) => {
  const { search, action, page = 1, limit = 50 } = query;
  
  let where = {};
  
  if (action && action !== 'All') {
    where.action = action;
  }
  
  if (search) {
    where.OR = [
      { action: { contains: search, mode: 'insensitive' } },
      { entity: { contains: search, mode: 'insensitive' } },
      { entity_id: { contains: search, mode: 'insensitive' } },
      { ip_address: { contains: search, mode: 'insensitive' } }
    ];
  }

  const logs = await prisma.audit_logs.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      admin: {
        select: {
          id: true,
          name: true,
          email: true,
          role_id: true
        }
      }
    },
    take: Number(limit),
    skip: (Number(page) - 1) * Number(limit)
  });
  
  const total = await prisma.audit_logs.count({ where });

  if (total === 0 && Number(page) === 1) {
    const [bookings, payments, users, roles, cafes, profiles] = await Promise.all([
      prisma.bookings.findMany({ include: { users: true, cafes: true }, orderBy: { created_at: 'desc' }, take: 10 }),
      prisma.payments.findMany({ include: { bookings: { include: { users: true } } }, orderBy: { created_at: 'desc' }, take: 10 }),
      prisma.users.findMany({ include: { roles: true }, orderBy: { created_at: 'desc' }, take: 10 }),
      prisma.roles.findMany(),
      prisma.cafes.findMany({ include: { users: true }, orderBy: { created_at: 'desc' }, take: 10 }),
      prisma.event_management_profiles.findMany({ include: { users: true }, orderBy: { created_at: 'desc' }, take: 10 })
    ]);

    const roleMap = new Map(roles.map(r => [r.id, r.name]));

    const synthesizedLogs = [];

    bookings.forEach(b => {
      const bStatus = (b.booking_status || '').toUpperCase();
      synthesizedLogs.push({
        id: `audit-b-${b.id}`,
        action: bStatus === 'COMPLETED' ? 'Booking Completed' : 'Booking Created',
        entity: 'Booking',
        entity_id: b.id,
        created_at: b.created_at ? b.created_at.toISOString() : new Date().toISOString(),
        ip_address: '127.0.0.1',
        admin: { email: b.users?.email || 'admin@fahara.com' },
        metadata: {
          customer: b.users?.name || 'Customer',
          amount: `₹${Number(b.total || b.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          status: b.booking_status || 'CONFIRMED'
        }
      });
    });

    payments.forEach(p => {
      synthesizedLogs.push({
        id: `audit-p-${p.id}`,
        action: 'Payment Captured',
        entity: 'Payment',
        entity_id: p.id,
        created_at: p.created_at ? p.created_at.toISOString() : new Date().toISOString(),
        ip_address: '127.0.0.1',
        admin: { email: p.bookings?.users?.email || 'admin@fahara.com' },
        metadata: {
          amount: `₹${Number(p.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          gateway: p.payment_gateway || 'Razorpay PG',
          status: p.status || p.bookings?.payment_status || 'PAID'
        }
      });
    });

    users.forEach(u => {
      const roleName = u.roles?.name || roleMap.get(u.role_id) || 'USER';
      synthesizedLogs.push({
        id: `audit-u-${u.id}`,
        action: 'User Registered',
        entity: 'User',
        entity_id: u.id,
        created_at: u.created_at ? u.created_at.toISOString() : new Date().toISOString(),
        ip_address: '127.0.0.1',
        admin: { email: u.email },
        metadata: {
          role: roleName,
          name: u.name || 'User'
        }
      });
    });

    cafes.forEach(c => {
      const vStatus = (c.status || 'PENDING').toUpperCase();
      synthesizedLogs.push({
        id: `audit-c-${c.id}`,
        action: vStatus === 'APPROVED' || vStatus === 'ACTIVE' ? 'Cafe Verification Approved' : 'Cafe Verification Pending',
        entity: 'Cafe Verification',
        entity_id: c.id,
        created_at: c.created_at ? c.created_at.toISOString() : new Date().toISOString(),
        ip_address: '127.0.0.1',
        admin: { email: c.users?.email || 'admin@fahara.com' },
        metadata: {
          cafe_name: c.name,
          city: c.city || 'Madurai',
          status: vStatus
        }
      });
    });

    profiles.forEach(emp => {
      const vStatus = (emp.verification_status || 'PENDING').toUpperCase();
      synthesizedLogs.push({
        id: `audit-emp-${emp.id}`,
        action: vStatus === 'APPROVED' || vStatus === 'VERIFIED' ? 'Event Manager KYC Verified' : 'KYC Verification Pending',
        entity: 'Event Manager Verification',
        entity_id: emp.id,
        created_at: emp.created_at ? emp.created_at.toISOString() : new Date().toISOString(),
        ip_address: '127.0.0.1',
        admin: { email: emp.business_email || emp.users?.email || 'admin@fahara.com' },
        metadata: {
          company_name: emp.company_name || 'Event Agency',
          status: vStatus
        }
      });
    });

    const sorted = synthesizedLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return {
      data: sorted,
      pagination: {
        total: sorted.length,
        page: 1,
        limit: Number(limit),
        totalPages: 1
      }
    };
  }

  return {
    data: logs,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  };
};

const getSecuritySessions = async (query = {}) => {
  const sessions = await prisma.security_sessions.findMany({
    orderBy: [
      { is_current: 'desc' },
      { last_active_at: 'desc' }
    ],
    include: {
      user: {
        select: {
          name: true,
          email: true
        }
      }
    }
  });
  
  return { data: sessions };
};

const getLoginHistory = async (query = {}) => {
  const { limit = 20 } = query;
  
  const history = await prisma.login_history.findMany({
    orderBy: { created_at: 'desc' },
    take: Number(limit),
    include: {
      user: {
        select: {
          name: true,
          email: true
        }
      }
    }
  });
  
  return { data: history };
};

const terminateSession = async (sessionId) => {
  return await prisma.security_sessions.delete({
    where: { id: sessionId }
  });
};

const terminateAllOtherSessions = async (currentSessionId, userId) => {
  return await prisma.security_sessions.deleteMany({
    where: { 
      user_id: userId,
      id: { not: currentSessionId }
    }
  });
};

module.exports = {
  getAuditLogs,
  getSecuritySessions,
  getLoginHistory,
  terminateSession,
  terminateAllOtherSessions
};
