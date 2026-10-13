const prisma = require('../config/prisma');

/**
 * Centralized Cafe Customer Visibility Service
 * Business Rule:
 * Customer-visible cafe = ADMIN APPROVED/ACTIVE + CAFE ACTIVE/PUBLISHED + OWNER SUBSCRIPTION ACTIVE & NOT EXPIRED
 */

/**
 * Returns Prisma relational condition for customer-visible cafes.
 * Uses database-level filtering.
 */
const getCustomerVisibleCafeWhereClause = () => {
  const now = new Date();
  return {
    status: { in: ['APPROVED', 'ACTIVE'] },
    users: {
      partner_subscriptions: {
        some: {
          status: 'ACTIVE',
          current_period_end: { gt: now }
        }
      }
    }
  };
};

/**
 * Derives the visibility object and reason for a cafe record.
 * @param {Object} cafe - Prisma cafe record (includes users.partner_subscriptions if present)
 * @returns {Object} { visible: boolean, reason: string | null }
 */
const getCafeCustomerVisibility = (cafe) => {
  if (!cafe) {
    return { visible: false, reason: 'DELETED' };
  }

  const status = String(cafe.status || '').toUpperCase();

  if (status === 'PENDING' || status === 'DRAFT') {
    return { visible: false, reason: 'VERIFICATION_PENDING' };
  }
  if (status === 'REJECTED') {
    return { visible: false, reason: 'VERIFICATION_REJECTED' };
  }
  if (status === 'SUSPENDED') {
    return { visible: false, reason: 'CAFE_SUSPENDED' };
  }
  if (status === 'INACTIVE') {
    return { visible: false, reason: 'CAFE_INACTIVE' };
  }
  if (status !== 'APPROVED' && status !== 'ACTIVE') {
    return { visible: false, reason: 'CAFE_INACTIVE' };
  }

  // Status is APPROVED or ACTIVE. Check owner subscription state.
  const now = new Date();
  const partnerSubs = cafe.users?.partner_subscriptions || [];
  const hasActiveSub = partnerSubs.some(sub => {
    return sub.status === 'ACTIVE' && sub.current_period_end && new Date(sub.current_period_end) > now;
  });

  if (!hasActiveSub) {
    return { visible: false, reason: 'SUBSCRIPTION_INACTIVE' };
  }

  return { visible: true, reason: null };
};

/**
 * Checks whether a cafe is customer-visible by ID.
 * @param {string} cafeId 
 * @returns {Promise<boolean>}
 */
const isCafeCustomerVisible = async (cafeId) => {
  if (!cafeId) return false;
  const now = new Date();
  const cafe = await prisma.cafes.findFirst({
    where: {
      id: cafeId,
      status: { in: ['APPROVED', 'ACTIVE'] },
      users: {
        partner_subscriptions: {
          some: {
            status: 'ACTIVE',
            current_period_end: { gt: now }
          }
        }
      }
    },
    select: { id: true }
  });
  return !!cafe;
};

/**
 * Attaches customerVisibility property to a cafe or list of cafes.
 */
const enrichCafeWithVisibility = (cafeOrList) => {
  if (!cafeOrList) return cafeOrList;
  if (Array.isArray(cafeOrList)) {
    return cafeOrList.map(c => enrichCafeWithVisibility(c));
  }
  const visibility = getCafeCustomerVisibility(cafeOrList);
  return {
    ...cafeOrList,
    customerVisibility: visibility
  };
};

module.exports = {
  getCustomerVisibleCafeWhereClause,
  getCafeCustomerVisibility,
  isCafeCustomerVisible,
  enrichCafeWithVisibility
};
