const prisma = require('../config/prisma');
const { calculateFoodPaymentBreakdown } = require('../services/foodPaymentCalculationService');

class AdminFoodService {
  /**
   * 1. Overview Statistics for Admin Dashboard
   */
  async getFoodOverviewStats() {
    const [
      totalOrders,
      paidOrders,
      pendingOrdersCount,
      completedOrdersCount,
      cancelledOrdersCount,
      totalMenuItems,
      distinctCustomerRecords,
      activeFoodCafesCount
    ] = await Promise.all([
      prisma.food_orders.count(),
      prisma.food_orders.findMany({
        where: { payment_status: 'PAID' },
        select: { total_amount: true, subtotal: true, discount_amount: true, delivery_charge: true }
      }),
      prisma.food_orders.count({
        where: { order_status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] } }
      }),
      prisma.food_orders.count({
        where: { order_status: { in: ['COMPLETED', 'DELIVERED'] } }
      }),
      prisma.food_orders.count({
        where: { order_status: { in: ['CANCELLED', 'REJECTED'] } }
      }),
      prisma.menu_items.count(),
      prisma.food_orders.findMany({
        distinct: ['customer_id'],
        select: { customer_id: true }
      }),
      prisma.cafes.count({
        where: {
          status: { in: ['ACTIVE', 'APPROVED'] },
          menu_items: { some: {} }
        }
      })
    ]);

    // Calculate authoritative revenue using ONLY successfully PAID orders
    let totalGrossRevenue = 0;
    let totalPlatformRevenue = 0;
    let totalPlatformFeeOnly = 0;
    let totalTransactionFee = 0;
    let totalGstAmount = 0;
    let totalCafeRevenue = 0;

    for (const order of paidOrders) {
      const breakdown = calculateFoodPaymentBreakdown({
        subtotal: Number(order.subtotal || 0),
        discountAmount: Number(order.discount_amount || 0),
        deliveryCharge: Number(order.delivery_charge || 0)
      });
      totalGrossRevenue += Number(order.total_amount || breakdown.totalPayableAmount || 0);
      totalPlatformRevenue += Number(breakdown.platformRetainedAmount || 0);
      totalPlatformFeeOnly += Number(breakdown.platformFeeAmount || 0);
      totalTransactionFee += Number(breakdown.transactionFeeAmount || 0);
      totalGstAmount += Number(breakdown.transactionFeeGstAmount || 0);
      totalCafeRevenue += Number(breakdown.restaurantSettlementAmount || 0);
    }

    return {
      totalFoodOrders: totalOrders,
      totalFoodRevenue: Number(totalGrossRevenue.toFixed(2)),
      totalPlatformRevenue: Number(totalPlatformRevenue.toFixed(2)),
      totalPlatformFeeOnly: Number(totalPlatformFeeOnly.toFixed(2)),
      totalTransactionFee: Number(totalTransactionFee.toFixed(2)),
      totalGstAmount: Number(totalGstAmount.toFixed(2)),
      totalCafeRevenue: Number(totalCafeRevenue.toFixed(2)),
      totalFoodCustomers: distinctCustomerRecords.length,
      totalFoodItems: totalMenuItems,
      totalActiveFoodCafes: activeFoodCafesCount,
      pendingFoodOrders: pendingOrdersCount,
      completedFoodOrders: completedOrdersCount,
      cancelledFoodOrders: cancelledOrdersCount
    };
  }

  /**
   * 2. Paginated Food Orders with Search and Filters
   */
  async getFoodOrders({ page = 1, limit = 20, status, orderType, search, startDate, endDate }) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};

    if (status && status !== 'ALL') {
      const s = status.toUpperCase();
      if (s === 'PENDING') {
        where.order_status = { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'] };
      } else if (s === 'COMPLETED') {
        where.order_status = { in: ['COMPLETED', 'DELIVERED'] };
      } else if (s === 'CANCELLED') {
        where.order_status = { in: ['CANCELLED', 'REJECTED'] };
      } else {
        where.order_status = s;
      }
    }

    if (orderType && orderType !== 'ALL') {
      where.order_type = orderType.toUpperCase();
    }

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate);
      if (endDate) where.created_at.lte = new Date(endDate);
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { order_number: { contains: q, mode: 'insensitive' } },
        { customer_name: { contains: q, mode: 'insensitive' } },
        { customer_phone: { contains: q, mode: 'insensitive' } },
        { cafes: { name: { contains: q, mode: 'insensitive' } } }
      ];
    }

    const [total, orders] = await Promise.all([
      prisma.food_orders.count({ where }),
      prisma.food_orders.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          cafes: {
            select: { id: true, name: true, city: true, address: true, owner_id: true }
          },
          users: {
            select: { id: true, name: true, email: true, phone: true, profile_image: true }
          },
          order_items: true,
          assigned_employee: {
            select: { id: true, name: true, phone: true, vehicle_type: true }
          },
          reviews: {
            select: { id: true, rating: true, review: true, reply: true }
          }
        }
      })
    ]);

    // Format orders with breakdown
    const formattedOrders = orders.map(order => {
      const breakdown = calculateFoodPaymentBreakdown({
        subtotal: Number(order.subtotal || 0),
        discountAmount: Number(order.discount_amount || 0),
        deliveryCharge: Number(order.delivery_charge || 0)
      });

      return {
        id: order.id,
        orderNumber: order.order_number,
        orderType: order.order_type,
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        subtotal: Number(order.subtotal || 0),
        discountAmount: Number(order.discount_amount || 0),
        deliveryCharge: Number(order.delivery_charge || 0),
        taxAmount: Number(order.tax_amount || breakdown.transactionFeeGstAmount || 0),
        gstAmount: Number(breakdown.transactionFeeGstAmount || 0),
        totalAmount: Number(order.total_amount || 0),
        platformFee: breakdown.platformFeeAmount,
        transactionFee: breakdown.transactionFeeAmount,
        platformRetainedAmount: breakdown.platformRetainedAmount,
        restaurantSettlementAmount: breakdown.restaurantSettlementAmount,
        customerName: order.customer_name || order.users?.name || 'Customer',
        customerPhone: order.customer_phone || order.users?.phone || '',
        customerEmail: order.users?.email || '',
        cafeId: order.cafe_id,
        cafeName: order.cafes?.name || 'Cafe',
        cafeCity: order.cafes?.city || '',
        itemsCount: order.order_items.reduce((sum, item) => sum + (item.quantity || 1), 0),
        items: order.order_items.map(i => ({
          id: i.id,
          name: i.item_name_snapshot,
          quantity: i.quantity,
          unitPrice: Number(i.unit_price_snapshot),
          lineTotal: Number(i.line_total),
          image: i.item_image_snapshot
        })),
        fulfilmentAddress: order.fulfilment_address,
        pickupDate: order.pickup_date,
        pickupTime: order.pickup_time,
        deliveryInstructions: order.delivery_instructions,
        cancellationReason: order.cancellation_reason,
        review: order.reviews?.[0] || null,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      };
    });

    return {
      orders: formattedOrders,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    };
  }

  /**
   * 3. Single Order Details
   */
  async getFoodOrderById(orderId) {
    const order = await prisma.food_orders.findUnique({
      where: { id: orderId },
      include: {
        cafes: true,
        users: {
          select: { id: true, name: true, email: true, phone: true, profile_image: true, created_at: true }
        },
        order_items: true,
        order_status_history: {
          orderBy: { created_at: 'desc' }
        },
        assigned_employee: true,
        reviews: true
      }
    });

    if (!order) return null;

    const breakdown = calculateFoodPaymentBreakdown({
      subtotal: Number(order.subtotal || 0),
      discountAmount: Number(order.discount_amount || 0),
      deliveryCharge: Number(order.delivery_charge || 0)
    });

    return {
      ...order,
      breakdown
    };
  }

  /**
   * 4. Comprehensive Food Revenue Analytics
   */
  async getFoodAnalytics({ period = 'month', startDate, endDate }) {
    // Determine date range
    const now = new Date();
    let fromDate = new Date();

    if (startDate && endDate) {
      fromDate = new Date(startDate);
    } else {
      if (period === 'day' || period === 'today') {
        fromDate.setHours(0, 0, 0, 0);
      } else if (period === 'week') {
        fromDate.setDate(now.getDate() - 7);
      } else if (period === 'year') {
        fromDate.setFullYear(now.getFullYear() - 1);
      } else {
        // month default
        fromDate.setDate(now.getDate() - 30);
      }
    }

    const [allOrders, paidOrders, cancelledPaidOrders, topCafesRaw, mostOrderedItemsRaw] = await Promise.all([
      // All orders in window
      prisma.food_orders.findMany({
        where: { created_at: { gte: fromDate } },
        select: { id: true, order_status: true, payment_status: true, total_amount: true, created_at: true }
      }),
      // Successful paid orders in window
      prisma.food_orders.findMany({
        where: {
          payment_status: 'PAID',
          order_status: { notIn: ['CANCELLED', 'REJECTED'] },
          created_at: { gte: fromDate }
        },
        select: {
          id: true,
          total_amount: true,
          subtotal: true,
          discount_amount: true,
          delivery_charge: true,
          created_at: true
        }
      }),
      // Cancelled paid orders (refund candidates)
      prisma.food_orders.findMany({
        where: {
          payment_status: 'PAID',
          order_status: { in: ['CANCELLED', 'REJECTED'] },
          created_at: { gte: fromDate }
        },
        select: { total_amount: true }
      }),
      // Top performing cafes
      prisma.food_orders.groupBy({
        by: ['cafe_id'],
        where: {
          payment_status: 'PAID',
          order_status: { notIn: ['CANCELLED', 'REJECTED'] }
        },
        _count: { id: true },
        _sum: { total_amount: true },
        orderBy: { _sum: { total_amount: 'desc' } },
        take: 5
      }),
      // Most ordered food items
      prisma.food_order_items.groupBy({
        by: ['item_name_snapshot'],
        _count: { id: true },
        _sum: { quantity: true, line_total: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 6
      })
    ]);

    // Aggregate revenue figures
    let totalSales = 0;
    let totalPlatformRevenue = 0;
    let totalPlatformFeeOnly = 0;
    let totalTransactionFee = 0;
    let totalGstAmount = 0;
    let totalCafeSettlement = 0;

    paidOrders.forEach(o => {
      const breakdown = calculateFoodPaymentBreakdown({
        subtotal: Number(o.subtotal || 0),
        discountAmount: Number(o.discount_amount || 0),
        deliveryCharge: Number(o.delivery_charge || 0)
      });
      totalSales += Number(o.total_amount || breakdown.totalPayableAmount || 0);
      totalPlatformRevenue += Number(breakdown.platformRetainedAmount || 0);
      totalPlatformFeeOnly += Number(breakdown.platformFeeAmount || 0);
      totalTransactionFee += Number(breakdown.transactionFeeAmount || 0);
      totalGstAmount += Number(breakdown.transactionFeeGstAmount || 0);
      totalCafeSettlement += Number(breakdown.restaurantSettlementAmount || 0);
    });

    const pendingPaymentsCount = allOrders.filter(o => o.payment_status === 'UNPAID' && !['CANCELLED', 'REJECTED'].includes(o.order_status)).length;
    const pendingPaymentsAmount = allOrders
      .filter(o => o.payment_status === 'UNPAID' && !['CANCELLED', 'REJECTED'].includes(o.order_status))
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    const refundedAmount = cancelledPaidOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    // Populate top cafes details
    const topCafeIds = topCafesRaw.map(t => t.cafe_id);
    const cafeDetails = await prisma.cafes.findMany({
      where: { id: { in: topCafeIds } },
      select: { id: true, name: true, city: true, average_rating: true }
    });
    const cafeMap = {};
    cafeDetails.forEach(c => { cafeMap[c.id] = c; });

    const topPerformingCafes = topCafesRaw.map(t => ({
      cafeId: t.cafe_id,
      name: cafeMap[t.cafe_id]?.name || 'Cafe',
      city: cafeMap[t.cafe_id]?.city || '',
      rating: cafeMap[t.cafe_id]?.average_rating || 5.0,
      totalOrders: t._count.id,
      totalRevenue: Number(t._sum.total_amount || 0)
    }));

    // Most ordered items
    const mostOrderedItems = mostOrderedItemsRaw.map(m => ({
      itemName: m.item_name_snapshot,
      totalOrdered: m._sum.quantity || 0,
      orderCount: m._count.id,
      totalRevenue: Number(m._sum.line_total || 0)
    }));

    // Time-series timeline chart (grouped by date)
    const dateMap = {};
    const today = new Date();
    // Pre-populate last 14 days or intervals
    const daysCount = period === 'week' ? 7 : period === 'today' ? 1 : 14;
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dateMap[key] = { date: key, orders: 0, revenue: 0, platformEarnings: 0 };
    }

    paidOrders.forEach(o => {
      const key = o.created_at.toISOString().slice(0, 10);
      if (dateMap[key]) {
        dateMap[key].orders += 1;
        dateMap[key].revenue += Number(o.total_amount || 0);
        const breakdown = calculateFoodPaymentBreakdown({
          subtotal: Number(o.subtotal || 0),
          discountAmount: Number(o.discount_amount || 0),
          deliveryCharge: Number(o.delivery_charge || 0)
        });
        dateMap[key].platformEarnings += Number(breakdown.platformRetainedAmount || 0);
      }
    });

    const timeSeriesData = Object.values(dateMap).map(d => ({
      ...d,
      revenue: Number(d.revenue.toFixed(2)),
      platformEarnings: Number(d.platformEarnings.toFixed(2))
    }));

    return {
      totalSales: Number(totalSales.toFixed(2)),
      platformRevenue: Number(totalPlatformRevenue.toFixed(2)),
      platformFeeOnly: Number(totalPlatformFeeOnly.toFixed(2)),
      transactionFee: Number(totalTransactionFee.toFixed(2)),
      gstAmount: Number(totalGstAmount.toFixed(2)),
      cafeSettlement: Number(totalCafeSettlement.toFixed(2)),
      successfulPaymentsCount: paidOrders.length,
      pendingPaymentsCount,
      pendingPaymentsAmount: Number(pendingPaymentsAmount.toFixed(2)),
      refundedAmount: Number(refundedAmount.toFixed(2)),
      timeSeriesData,
      topPerformingCafes,
      mostOrderedItems
    };
  }

  /**
   * 5. Cafe Food Performance Detailed Profile
   */
  async getCafeFoodPerformance(cafeId) {
    const [cafe, orders, menuItemsCount, reviews] = await Promise.all([
      prisma.cafes.findUnique({
        where: { id: cafeId },
        select: { id: true, name: true, city: true, average_rating: true, total_reviews: true, users: { select: { name: true, email: true } } }
      }),
      prisma.food_orders.findMany({
        where: { cafe_id: cafeId },
        select: { id: true, total_amount: true, payment_status: true, order_status: true, created_at: true }
      }),
      prisma.menu_items.count({ where: { cafe_id: cafeId } }),
      prisma.reviews.findMany({
        where: { cafe_id: cafeId, review_type: 'FOOD_ORDER' },
        orderBy: { created_at: 'desc' },
        take: 5,
        include: { users: { select: { name: true } } }
      })
    ]);

    if (!cafe) return null;

    const paidOrders = orders.filter(o => o.payment_status === 'PAID' && !['CANCELLED', 'REJECTED'].includes(o.order_status));
    const totalFoodRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const completedOrders = orders.filter(o => ['COMPLETED', 'DELIVERED'].includes(o.order_status)).length;
    const cancelledOrders = orders.filter(o => ['CANCELLED', 'REJECTED'].includes(o.order_status)).length;
    const aov = paidOrders.length > 0 ? Number((totalFoodRevenue / paidOrders.length).toFixed(2)) : 0;

    // Popular items
    const popularItemsRaw = await prisma.food_order_items.groupBy({
      by: ['item_name_snapshot'],
      where: { order: { cafe_id: cafeId } },
      _sum: { quantity: true, line_total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5
    });

    return {
      cafe,
      metrics: {
        totalOrders: orders.length,
        totalFoodRevenue: Number(totalFoodRevenue.toFixed(2)),
        averageOrderValue: aov,
        completedOrders,
        cancelledOrders,
        totalMenuItems: menuItemsCount,
        rating: cafe.average_rating || 5.0,
        reviewsCount: cafe.total_reviews || 0
      },
      popularItems: popularItemsRaw.map(p => ({
        name: p.item_name_snapshot,
        quantitySold: p._sum.quantity || 0,
        revenue: Number(p._sum.line_total || 0)
      })),
      recentFoodReviews: reviews
    };
  }
}

module.exports = new AdminFoodService();
