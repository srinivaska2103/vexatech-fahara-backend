const prisma = require('../config/prisma');

const orderRepository = {
  // Find order by ID with all relations
  async findOrderById(orderId) {
    return prisma.food_orders.findUnique({
      where: { id: orderId },
      include: {
        cafes: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            cover_image: true,
            latitude: true,
            longitude: true
          }
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        assigned_employee: {
          select: {
            id: true,
            name: true,
            phone: true,
            vehicle_type: true,
            vehicle_number: true,
            availability_status: true
          }
        },
        order_items: true,
        order_status_history: {
          orderBy: { created_at: 'desc' }
        },
        order_cancellations: {
          orderBy: { created_at: 'desc' },
          take: 1
        },
        payment_refunds: {
          include: {
            refund_timelines: {
              orderBy: { created_at: 'asc' }
            }
          },
          orderBy: { created_at: 'desc' }
        },
        order_assignments: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                phone: true,
                vehicle_type: true,
                vehicle_number: true
              }
            }
          },
          orderBy: { assigned_at: 'desc' }
        }
      }
    });
  },

  // Find order by Order Number
  async findOrderByNumber(orderNumber) {
    return prisma.food_orders.findUnique({
      where: { order_number: orderNumber },
      include: {
        cafes: true,
        order_items: true,
        order_status_history: { orderBy: { created_at: 'desc' } },
        assigned_employee: true
      }
    });
  },

  // Create order with items & history snapshot inside transaction
  async createFoodOrder(orderData, itemsData, historyNote, tx = prisma) {
    return tx.food_orders.create({
      data: {
        ...orderData,
        order_items: {
          create: itemsData
        },
        order_status_history: {
          create: {
            previous_status: null,
            new_status: 'NEW',
            changed_by: orderData.customer_name,
            changed_by_user_id: orderData.customer_id,
            note: historyNote || 'Order placed by customer'
          }
        }
      },
      include: {
        order_items: true,
        order_status_history: true
      }
    });
  },

  // Update order status with history log
  async updateOrderStatus(orderId, newStatus, changedBy, changedByUserId, note, tx = prisma) {
    const currentOrder = await tx.food_orders.findUnique({
      where: { id: orderId },
      select: { order_status: true, assigned_employee_id: true }
    });

    if (!currentOrder) {
      throw new Error('Order not found');
    }

    const previousStatus = currentOrder.order_status;

    const updated = await tx.food_orders.update({
      where: { id: orderId },
      data: {
        order_status: newStatus,
        updated_at: new Date()
      }
    });

    await tx.order_status_history.create({
      data: {
        order_id: orderId,
        previous_status: previousStatus,
        new_status: newStatus,
        changed_by: changedBy,
        changed_by_user_id: changedByUserId,
        note: note || `Status updated to ${newStatus}`
      }
    });

    return updated;
  },

  // Assign delivery employee to order
  async assignDeliveryEmployee(orderId, employeeId, notes, tx = prisma) {
    // 1. Update order assigned_employee_id
    const updatedOrder = await tx.food_orders.update({
      where: { id: orderId },
      data: {
        assigned_employee_id: employeeId,
        order_status: 'ASSIGNED'
      }
    });

    // 2. Mark any previous assignment as REASSIGNED
    await tx.order_assignments.updateMany({
      where: {
        order_id: orderId,
        assignment_status: 'ASSIGNED'
      },
      data: {
        assignment_status: 'REASSIGNED'
      }
    });

    // 3. Create new assignment record
    await tx.order_assignments.create({
      data: {
        order_id: orderId,
        employee_id: employeeId,
        assignment_status: 'ASSIGNED',
        notes
      }
    });

    // 4. Update employee availability status to ON_DELIVERY
    await tx.delivery_employees.update({
      where: { id: employeeId },
      data: { availability_status: 'ON_DELIVERY' }
    });

    return updatedOrder;
  },

  // Customer's order list
  async findCustomerOrders(customerId, { page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      prisma.food_orders.findMany({
        where: { customer_id: customerId },
        include: {
          cafes: {
            select: {
              id: true,
              name: true,
              address: true,
              cover_image: true
            }
          },
          order_items: true,
          assigned_employee: {
            select: {
              name: true,
              phone: true,
              vehicle_type: true
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.food_orders.count({ where: { customer_id: customerId } })
    ]);

    return { orders, total, page, limit };
  },

  // Cafe's order list with extensive filters
  async findCafeOrders(cafeId, filters = {}) {
    const {
      status,
      orderType,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 30
    } = filters;

    const where = { cafe_id: cafeId };

    if (status && status !== 'ALL') {
      where.order_status = status;
    }
    if (orderType && orderType !== 'ALL') {
      where.order_type = orderType;
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
        { customer_phone: { contains: q, mode: 'insensitive' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.food_orders.findMany({
        where,
        include: {
          order_items: true,
          assigned_employee: {
            select: {
              id: true,
              name: true,
              phone: true,
              vehicle_type: true,
              vehicle_number: true
            }
          },
          order_status_history: {
            orderBy: { created_at: 'desc' },
            take: 1
          },
          order_cancellations: {
            orderBy: { created_at: 'desc' },
            take: 1
          },
          payment_refunds: {
            orderBy: { created_at: 'desc' },
            take: 1
          }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.food_orders.count({ where })
    ]);

    return { orders, total, page, limit };
  },

  // Cafe order statistics
  async getCafeOrderStats(cafeId, { startDate, endDate } = {}) {
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const baseWhere = { cafe_id: cafeId };
    if (startDate || endDate) baseWhere.created_at = dateFilter;

    const [
      totalOrders,
      takeawayOrders,
      deliveryOrders,
      newOrders,
      preparingOrders,
      readyOrders,
      outForDeliveryOrders,
      completedOrders,
      cancelledOrders,
      revenueResult
    ] = await Promise.all([
      prisma.food_orders.count({ where: baseWhere }),
      prisma.food_orders.count({ where: { ...baseWhere, order_type: 'TAKEAWAY' } }),
      prisma.food_orders.count({ where: { ...baseWhere, order_type: 'RESTAURANT_DELIVERY' } }),
      prisma.food_orders.count({ where: { ...baseWhere, order_status: 'NEW' } }),
      prisma.food_orders.count({ where: { ...baseWhere, order_status: 'PREPARING' } }),
      prisma.food_orders.count({ where: { ...baseWhere, order_status: 'READY_FOR_PICKUP' } }),
      prisma.food_orders.count({ where: { ...baseWhere, order_status: 'OUT_FOR_DELIVERY' } }),
      prisma.food_orders.count({ where: { ...baseWhere, order_status: 'COMPLETED' } }),
      prisma.food_orders.count({
        where: {
          ...baseWhere,
          order_status: { in: ['CANCELLED', 'REJECTED'] }
        }
      }),
      prisma.food_orders.aggregate({
        where: { ...baseWhere, order_status: 'COMPLETED' },
        _sum: { total_amount: true }
      })
    ]);

    return {
      totalOrders,
      takeawayOrders,
      deliveryOrders,
      newOrders,
      preparingOrders,
      readyOrders,
      outForDeliveryOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue: Number(revenueResult._sum?.total_amount || 0)
    };
  },

  // Assigned orders for a delivery employee
  async findAssignedOrdersForEmployee(employeeId, statusFilter) {
    const where = {
      assigned_employee_id: employeeId
    };

    if (statusFilter && statusFilter !== 'ALL') {
      where.order_status = statusFilter;
    } else {
      // By default show active orders (ASSIGNED, PICKED_UP, OUT_FOR_DELIVERY) or COMPLETED
      where.order_status = {
        in: ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']
      };
    }

    return prisma.food_orders.findMany({
      where,
      include: {
        cafes: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true
          }
        },
        order_items: true,
        order_status_history: {
          orderBy: { created_at: 'desc' }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }
};

module.exports = orderRepository;

