const prisma = require('../config/prisma');

const fulfilmentRepository = {
  // Get or initialize cafe fulfilment settings
  async getOrCreateFulfilmentSettings(cafeId) {
    let settings = await prisma.cafe_fulfilment_settings.findUnique({
      where: { cafe_id: cafeId }
    });

    if (!settings) {
      settings = await prisma.cafe_fulfilment_settings.create({
        data: {
          cafe_id: cafeId,
          is_takeaway_enabled: true,
          takeaway_min_order_amount: 0.00,
          estimated_pickup_time_minutes: 20,
          is_delivery_enabled: false,
          delivery_radius_km: 5.00,
          min_delivery_order_amount: 100.00,
          delivery_charge: 30.00,
          estimated_delivery_time_minutes: 40
        }
      });
    }

    return settings;
  },

  // Update cafe fulfilment settings
  async updateFulfilmentSettings(cafeId, data) {
    return prisma.cafe_fulfilment_settings.upsert({
      where: { cafe_id: cafeId },
      create: {
        cafe_id: cafeId,
        ...data
      },
      update: {
        ...data,
        updated_at: new Date()
      }
    });
  },

  // List delivery employees for a cafe
  async findDeliveryEmployees(cafeId) {
    return prisma.delivery_employees.findMany({
      where: { cafe_id: cafeId },
      include: {
        _count: {
          select: {
            food_orders: {
              where: {
                order_status: {
                  in: ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY']
                }
              }
            }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  },

  // Find single employee
  async findDeliveryEmployeeById(employeeId) {
    return prisma.delivery_employees.findUnique({
      where: { id: employeeId },
      include: {
        cafes: {
          select: { id: true, name: true, owner_id: true }
        }
      }
    });
  },

  // Find employee by phone and cafe (for authentication)
  async findDeliveryEmployeeByPhone(cafeId, phone) {
    return prisma.delivery_employees.findFirst({
      where: {
        cafe_id: cafeId,
        phone: phone.trim()
      }
    });
  },

  // Create delivery employee
  async createDeliveryEmployee(cafeId, data) {
    return prisma.delivery_employees.create({
      data: {
        cafe_id: cafeId,
        ...data
      }
    });
  },

  // Update delivery employee
  async updateDeliveryEmployee(employeeId, data) {
    return prisma.delivery_employees.update({
      where: { id: employeeId },
      data: {
        ...data,
        updated_at: new Date()
      }
    });
  },

  // Delete delivery employee (if no active orders)
  async deleteDeliveryEmployee(employeeId) {
    return prisma.delivery_employees.delete({
      where: { id: employeeId }
    });
  }
};

module.exports = fulfilmentRepository;

