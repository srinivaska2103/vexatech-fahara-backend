const prisma = require('../config/prisma');
const { calculateFoodPaymentBreakdown } = require('./foodPaymentCalculationService');

/**
 * Standardize date range parsing across Admin Dashboard, Revenue Page, and Transactions
 */
function parseDateRange({ filter, period, startDate, endDate }) {
  if (startDate && endDate) {
    return {
      start: new Date(startDate),
      end: new Date(endDate)
    };
  }

  const effectiveFilter = filter || period || 'ALL';
  const now = new Date();
  let start = null;
  let end = new Date(now);

  const normalized = String(effectiveFilter).trim().toLowerCase();

  switch (normalized) {
    case 'today':
    case '1d': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case 'yesterday': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      break;
    }
    case 'week':
    case '7d': {
      start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
    case '30d': {
      start = new Date(now);
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'this_month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    }
    case 'prev_month':
    case 'previous_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
    case 'quarter':
    case '90d': {
      start = new Date(now);
      start.setDate(now.getDate() - 90);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'year':
    case '1y': {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      break;
    }
    case 'all':
    case 'all_time':
    default: {
      start = null;
      end = null;
      break;
    }
  }

  return { start, end };
}

/**
 * Format to two decimal places safely without floating precision issues
 */
function round2(val) {
  if (val == null || isNaN(val)) return 0;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

/**
 * Unified Financial Calculation Engine for GRAB2GO
 * Both /admin/dashboard and /admin/revenue must call this exact method.
 */
async function getFinancialMetrics({
  ownerId = null,
  role = 'ADMIN',
  filter = null,
  period = null,
  startDate = null,
  endDate = null
} = {}) {
  const isAdmin = role === 'ADMIN';
  const { start, end } = parseDateRange({ filter, period, startDate, endDate });

  const dateFilter = (dateField = 'created_at') => {
    if (!start && !end) return {};
    const cond = {};
    if (start) cond.gte = start;
    if (end) cond.lte = end;
    return { [dateField]: cond };
  };

  // Base scope filters
  const bookingWhere = {
    ...(isAdmin ? {} : { cafes: { owner_id: ownerId } }),
    ...dateFilter('created_at')
  };

  const foodOrderWhere = {
    ...(isAdmin ? {} : { cafes: { owner_id: ownerId } }),
    ...dateFilter('created_at')
  };

  // Fetch all core financial records in parallel
  const [
    allBookings,
    allFoodOrders,
    allPayments,
    allRefunds,
    allSplits
  ] = await Promise.all([
    prisma.bookings.findMany({
      where: bookingWhere,
      include: {
        cafes: true,
        users: true,
        payments: true
      }
    }),
    prisma.food_orders.findMany({
      where: foodOrderWhere,
      include: {
        cafes: true,
        users: true
      }
    }),
    prisma.payments.findMany({
      where: {
        ...(isAdmin ? {} : {
          OR: [
            { bookings: { cafes: { owner_id: ownerId } } },
            { order_id: { in: (await prisma.food_orders.findMany({ where: { cafes: { owner_id: ownerId } }, select: { order_number: true } })).map(o => o.order_number) } }
          ]
        }),
        ...dateFilter('created_at')
      },
      include: {
        bookings: true,
        payment_refunds: true
      }
    }),
    prisma.payment_refunds.findMany({
      where: {
        ...dateFilter('created_at')
      },
      include: {
        payments: {
          include: {
            bookings: true
          }
        }
      }
    }),
    prisma.payment_splits.findMany({
      where: {
        ...(isAdmin ? {} : { vendor_id: ownerId }),
        ...dateFilter('created_at')
      }
    })
  ]);

  // 1. FOOD ORDERS METRICS
  let foodGrossCompleted = 0;      // Completed/Delivered Food Order Sales (Gross)
  let foodPlatformRevenue = 0;     // Platform fee (3% on subtotal)
  let foodRestaurantPayable = 0;   // Restaurant payout from completed orders
  let foodTxnFee = 0;              // 2% Gateway txn fee
  let foodGst = 0;                 // GST on txn fee
  let foodDiscount = 0;            // Discounts applied

  let countFoodDelivered = 0;
  let countFoodCancelled = 0;
  let countFoodPaid = 0;
  let countFoodProcessing = 0;

  for (const fo of allFoodOrders) {
    const oStatus = String(fo.order_status || '').toUpperCase();
    const pStatus = String(fo.payment_status || '').toUpperCase();

    if (pStatus === 'PAID') {
      countFoodPaid++;
    }

    // Cancelled or rejected food orders
    if (['CANCELLED', 'REJECTED'].includes(oStatus)) {
      countFoodCancelled++;
      continue; // Skip revenue inclusion for cancelled orders
    }

    // Only completed/delivered food orders generate real gross sales and platform revenue
    const isCompleted = ['COMPLETED', 'DELIVERED'].includes(oStatus);
    const isPaid = pStatus === 'PAID';

    if (isCompleted || isPaid) {
      if (isCompleted) countFoodDelivered++;
      else countFoodProcessing++;

      const breakdown = calculateFoodPaymentBreakdown({
        subtotal: Number(fo.subtotal || 0),
        discountAmount: Number(fo.discount_amount || 0),
        deliveryCharge: Number(fo.delivery_charge || 0)
      });

      const totalVal = Number(fo.total_amount || breakdown.totalPayableAmount || 0);
      const platFee = Number(breakdown.platformFeeAmount || 0);
      const restPay = Number(breakdown.restaurantSettlementAmount || (totalVal - platFee));
      const txn = Number(breakdown.transactionFeeAmount || 0);
      const gst = Number(breakdown.transactionFeeGstAmount || 0);
      const disc = Number(fo.discount_amount || 0);

      foodGrossCompleted += totalVal;
      foodPlatformRevenue += platFee;
      foodRestaurantPayable += restPay;
      foodTxnFee += txn;
      foodGst += gst;
      foodDiscount += disc;
    }
  }

  // 2. CAFE & EVENT BOOKINGS METRICS
  let cafeGrossCompleted = 0;
  let cafePlatformRevenue = 0;
  let cafePartnerPayable = 0;
  let eventPartnerPayable = 0;
  let bookingTxnFee = 0;
  let bookingGst = 0;
  let bookingDiscount = 0;

  let countBookingConfirmed = 0;
  let countBookingCompleted = 0;
  let countBookingCancelled = 0;

  for (const b of allBookings) {
    const bStatus = String(b.booking_status || '').toUpperCase();
    const pStatus = String(b.payment_status || '').toUpperCase();

    if (['CANCELLED', 'REJECTED', 'DECLINED'].includes(bStatus) || ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(pStatus)) {
      countBookingCancelled++;
      continue; // Exclude cancelled/refunded bookings from revenue
    }

    const isCompleted = bStatus === 'COMPLETED';
    const isPaid = ['COMPLETED', 'PAID', 'SUCCESS'].includes(pStatus);
    const isConfirmed = bStatus === 'CONFIRMED' && (isPaid || Number(b.cafe_amount || b.subtotal || 0) === 0);

    if (isCompleted || isConfirmed) {
      if (isCompleted) countBookingCompleted++;
      else countBookingConfirmed++;

      const totalVal = Number(b.total || 0);
      const subtotalVal = Number(b.subtotal || 0);
      const platFee = Number(b.fahara_service_charge || (subtotalVal * 0.03));
      const tax = Number(b.gst || 0);
      const txn = Number(b.transaction_fee || 0);
      const disc = Number(b.discount || 0);

      let cafeAmt = Number(b.cafe_amount || 0) + Number(b.food_amount || 0) + Number(b.decoration_amount || 0) + Number(b.extra_person_amount || 0);
      let eventAmt = Number(b.event_service_amount || 0);

      if (cafeAmt === 0 && eventAmt === 0 && subtotalVal > 0) {
        if (b.event_service_id != null) {
          cafeAmt = subtotalVal / 2;
          eventAmt = subtotalVal / 2;
        } else {
          cafeAmt = subtotalVal;
        }
      }

      cafeGrossCompleted += totalVal;
      cafePlatformRevenue += platFee;
      cafePartnerPayable += cafeAmt;
      eventPartnerPayable += eventAmt;
      bookingTxnFee += txn;
      bookingGst += tax;
      bookingDiscount += disc;
    }
  }

  // 3. REFUNDS METRICS (Verified & Unified)
  let refundsSettled = 0;      // Status SUCCESS, COMPLETED, PROCESSED
  let refundsPending = 0;      // Status PROCESSING, PENDING, REQUESTED
  let countRefundsSettled = 0;
  let countRefundsPending = 0;

  for (const r of allRefunds) {
    const rStatus = String(r.refund_status || '').toUpperCase();
    const amt = Number(r.refund_amount || 0);

    if (['SUCCESS', 'COMPLETED', 'PROCESSED', 'REFUNDED'].includes(rStatus)) {
      refundsSettled += amt;
      countRefundsSettled++;
    } else if (['PROCESSING', 'PENDING', 'REQUESTED'].includes(rStatus)) {
      refundsPending += amt;
      countRefundsPending++;
    }
  }

  // Fallback for payments marked REFUNDED without a separate payment_refunds row
  for (const p of allPayments) {
    const pStatus = String(p.status || '').toUpperCase();
    if (['REFUNDED'].includes(pStatus) && (!p.payment_refunds || p.payment_refunds.length === 0)) {
      refundsSettled += Number(p.amount || 0);
      countRefundsSettled++;
    }
  }

  // 4. SETTLEMENTS METRICS (payment_splits)
  let pendingSettlementAmount = 0;
  let completedSettlementAmount = 0;

  for (const split of allSplits) {
    const sStatus = String(split.settlement_status || '').toUpperCase();
    const splitAmt = Number(split.split_amount || 0);

    if (['COMPLETED', 'SETTLED'].includes(sStatus)) {
      completedSettlementAmount += splitAmt;
    } else if (['PENDING', 'NOT_CREATED', 'PROCESSING'].includes(sStatus)) {
      pendingSettlementAmount += splitAmt;
    }
  }

  // 5. COMBINED TOTALS
  const totalGrossRevenue = foodGrossCompleted + cafeGrossCompleted;
  const totalPlatformRevenue = foodPlatformRevenue + cafePlatformRevenue;
  const totalPartnerPayable = foodRestaurantPayable + cafePartnerPayable + eventPartnerPayable;
  const totalTxnFee = foodTxnFee + bookingTxnFee;
  const totalGst = foodGst + bookingGst;
  const totalDiscount = foodDiscount + bookingDiscount;
  const netPlatformRevenue = totalPlatformRevenue; // Platform commission earned

  // Monthly 6-month chart aggregation
  const now = new Date();
  const months = [];
  const monthlyValues = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthNames[d.getMonth()]);
    monthlyValues.push(0);
  }

  // Populate 6-month historical values using completed food orders and bookings
  const addToMonth = (dateObj, amount) => {
    if (!dateObj) return;
    const d = new Date(dateObj);
    const monthDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (monthDiff >= 0 && monthDiff <= 5) {
      const idx = 5 - monthDiff;
      monthlyValues[idx] += amount;
    }
  };

  allFoodOrders.forEach(fo => {
    if (['COMPLETED', 'DELIVERED'].includes(String(fo.order_status || '').toUpperCase())) {
      const breakdown = calculateFoodPaymentBreakdown({ subtotal: Number(fo.subtotal || 0) });
      addToMonth(fo.created_at, Number(breakdown.platformFeeAmount || (fo.total_amount * 0.03)));
    }
  });

  allBookings.forEach(b => {
    if (['COMPLETED', 'CONFIRMED'].includes(String(b.booking_status || '').toUpperCase()) &&
        !['CANCELLED', 'REFUNDED'].includes(String(b.payment_status || '').toUpperCase())) {
      const fee = Number(b.fahara_service_charge || (b.subtotal * 0.03));
      addToMonth(b.created_at, fee);
    }
  });

  const formattedMonthlyValues = monthlyValues.map(v => round2(v));

  // Today, Month, YTD revenues
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  let todayRevenue = 0;
  let monthlyRevenue = 0;
  let ytdRevenue = 0;

  allFoodOrders.forEach(fo => {
    if (['COMPLETED', 'DELIVERED'].includes(String(fo.order_status || '').toUpperCase())) {
      const plat = round2(calculateFoodPaymentBreakdown({ subtotal: Number(fo.subtotal || 0) }).platformFeeAmount);
      const d = new Date(fo.created_at);
      if (d >= startOfDay) todayRevenue += plat;
      if (d >= startOfMonth) monthlyRevenue += plat;
      if (d >= startOfYear) ytdRevenue += plat;
    }
  });

  allBookings.forEach(b => {
    if (['COMPLETED', 'CONFIRMED'].includes(String(b.booking_status || '').toUpperCase()) &&
        !['CANCELLED', 'REFUNDED'].includes(String(b.payment_status || '').toUpperCase())) {
      const plat = round2(b.fahara_service_charge || (b.subtotal * 0.03));
      const d = new Date(b.created_at);
      if (d >= startOfDay) todayRevenue += plat;
      if (d >= startOfMonth) monthlyRevenue += plat;
      if (d >= startOfYear) ytdRevenue += plat;
    }
  });

  // Calculate Success / Refund rates
  const totalOrdersAndBookings = allFoodOrders.length + allBookings.length;
  const completedOrdersAndBookings = countFoodDelivered + countBookingCompleted + countBookingConfirmed;
  const successRate = totalOrdersAndBookings > 0 ? (completedOrdersAndBookings / totalOrdersAndBookings) * 100 : 0;
  const refundRate = totalOrdersAndBookings > 0 ? ((countFoodCancelled + countBookingCancelled) / totalOrdersAndBookings) * 100 : 0;

  return {
    // Gross values
    gross_booking_value: round2(totalGrossRevenue),
    grossBookingValue: round2(totalGrossRevenue),
    total_food_revenue: round2(foodGrossCompleted),
    food_revenue: round2(foodGrossCompleted),
    total_booking_revenue: round2(cafeGrossCompleted),
    cafe_revenue: round2(cafeGrossCompleted),
    event_revenue: round2(0),

    // Platform revenues
    fahara_platform_revenue: round2(totalPlatformRevenue),
    fahara_revenue: round2(totalPlatformRevenue),
    faharaRevenue: round2(totalPlatformRevenue),
    food_platform_revenue: round2(foodPlatformRevenue),
    food_fahara_revenue: round2(foodPlatformRevenue),
    cafe_platform_revenue: round2(cafePlatformRevenue),
    cafe_fahara_revenue: round2(cafePlatformRevenue),
    net_revenue: round2(netPlatformRevenue),
    netRevenue: round2(netPlatformRevenue),

    // Partner payouts
    total_partner_payout: round2(totalPartnerPayable),
    food_partner_revenue: round2(foodRestaurantPayable),
    food_partner_payout: round2(foodRestaurantPayable),
    cafe_partner_revenue: round2(cafePartnerPayable),
    cafe_payable: round2(cafePartnerPayable),
    cafePayable: round2(cafePartnerPayable),
    event_partner_revenue: round2(eventPartnerPayable),
    event_manager_payable: round2(eventPartnerPayable),
    eventManagerPayable: round2(eventPartnerPayable),

    // Deductions & taxes
    transaction_fee: round2(totalTxnFee),
    transactionFee: round2(totalTxnFee),
    gst_tax: round2(totalGst),
    gst_amount: round2(totalGst),
    gstAmount: round2(totalGst),
    discounts: round2(totalDiscount),

    // Refunds (Settled vs Pending)
    refunds: round2(refundsSettled),
    refund_amount: round2(refundsSettled),
    refunds_settled: round2(refundsSettled),
    refunds_pending: round2(refundsPending),
    count_refunds_settled: countRefundsSettled,
    count_refunds_pending: countRefundsPending,

    // Settlements
    pending_settlement: round2(pendingSettlementAmount),
    pending_payouts: round2(pendingSettlementAmount),
    completed_settlements: round2(completedSettlementAmount),

    // Counts
    counts: {
      total_food_orders: allFoodOrders.length,
      completed_food_orders: countFoodDelivered,
      paid_food_orders: countFoodPaid,
      cancelled_food_orders: countFoodCancelled,
      total_bookings: allBookings.length,
      completed_bookings: countBookingCompleted,
      confirmed_bookings: countBookingConfirmed,
      cancelled_bookings: countBookingCancelled
    },

    // Trending & Analytics
    today_revenue: round2(todayRevenue),
    monthly_revenue: round2(monthlyRevenue),
    ytd_revenue: round2(ytdRevenue),
    success_rate: round2(successRate),
    refund_rate: round2(refundRate),
    chart_data: {
      months,
      values: formattedMonthlyValues
    }
  };
}

module.exports = {
  getFinancialMetrics,
  parseDateRange,
  round2
};
