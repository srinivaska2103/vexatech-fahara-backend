const prisma = require('../config/prisma');

const cartRepository = {
  // Find cart for customer including items, menu items, cafe and active offers
  async findCartByCustomerId(customerId) {
    return prisma.customer_carts.findUnique({
      where: { customer_id: customerId },
      include: {
        cafes: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            cover_image: true,
            latitude: true,
            longitude: true,
            cafe_fulfilment_settings: true
          }
        },
        items: {
          include: {
            menu_item: {
              include: {
                menu_categories: {
                  select: { id: true, name: true }
                }
              }
            }
          },
          orderBy: { created_at: 'asc' }
        }
      }
    });
  },

  // Create or update cart for customer
  async upsertCart(customerId, cafeId) {
    return prisma.customer_carts.upsert({
      where: { customer_id: customerId },
      create: {
        customer_id: customerId,
        cafe_id: cafeId
      },
      update: {
        cafe_id: cafeId
      }
    });
  },

  // Clear all items from a cart
  async clearCartItems(cartId) {
    return prisma.customer_cart_items.deleteMany({
      where: { cart_id: cartId }
    });
  },

  // Delete cart completely
  async deleteCart(cartId) {
    return prisma.customer_carts.delete({
      where: { id: cartId }
    });
  },

  // Add item or increment quantity
  async addItem(cartId, menuItemId, quantity = 1) {
    const existing = await prisma.customer_cart_items.findUnique({
      where: {
        cart_id_menu_item_id: {
          cart_id: cartId,
          menu_item_id: menuItemId
        }
      }
    });

    if (existing) {
      return prisma.customer_cart_items.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + quantity
        }
      });
    }

    return prisma.customer_cart_items.create({
      data: {
        cart_id: cartId,
        menu_item_id: menuItemId,
        quantity: Math.max(1, quantity)
      }
    });
  },

  // Update item quantity
  async updateItemQuantity(itemId, quantity) {
    if (quantity <= 0) {
      return prisma.customer_cart_items.delete({
        where: { id: itemId }
      });
    }
    return prisma.customer_cart_items.update({
      where: { id: itemId },
      data: { quantity }
    });
  },

  // Delete specific cart item
  async removeItem(itemId) {
    return prisma.customer_cart_items.delete({
      where: { id: itemId }
    });
  },

  // Find single cart item by id
  async findItemById(itemId) {
    return prisma.customer_cart_items.findUnique({
      where: { id: itemId },
      include: { cart: true }
    });
  }
};

module.exports = cartRepository;

