const restaurantAvailabilityService = require('./restaurantAvailabilityService');
const fulfilmentRepository = require('../repositories/fulfilmentRepository');
const cartRepository = require('../repositories/cartRepository');
const offerRepository = require('../repositories/offerRepository');
const { calculateDiscountForItem } = require('./offerService');
const prisma = require('../config/prisma');

const cartService = {
  // Get active cart with live-calculated discounts and prices
  async getCustomerCart(customerId) {
    const cart = await cartRepository.findCartByCustomerId(customerId);
    if (!cart) {
      return {
        id: null,
        cafe: null,
        items: [],
        itemCount: 0,
        subtotal: 0,
        totalSavings: 0,
        finalPayableAmount: 0
      };
    }

    // 1. Fetch active offers for this cafe to calculate live discounts
    const activeOffers = await offerRepository.getActiveOffersForCafe(cart.cafe_id, new Date());

    // 2. Map and re-calculate every item
    let subtotal = 0;
    let totalSavings = 0;

    const mappedItems = cart.items.map((cartItem) => {
      const item = cartItem.menu_item;
      const originalPrice = Number(item.price);
      
      // Calculate active Phase 2 discount
      const discountCalc = calculateDiscountForItem(item, activeOffers);
      const finalUnitPrice = discountCalc.discountedPrice;
      const discountPerUnit = discountCalc.discountAmount;
      const quantity = cartItem.quantity;

      const itemLineOriginal = originalPrice * quantity;
      const itemLineTotal = finalUnitPrice * quantity;
      const itemLineSavings = discountPerUnit * quantity;

      subtotal += itemLineOriginal;
      totalSavings += itemLineSavings;

      return {
        id: cartItem.id,
        menuItemId: item.id,
        name: item.name,
        imageUrl: item.image_url,
        foodType: item.food_type,
        isAvailable: item.is_available,
        preparationTime: item.preparation_time,
        categoryName: item.menu_categories?.name || null,
        quantity,
        originalUnitPrice: originalPrice,
        unitPrice: finalUnitPrice,
        discountAmount: discountPerUnit,
        hasDiscount: discountCalc.hasDiscount,
        appliedOffer: discountCalc.appliedOffer,
        lineOriginalTotal: Math.round(itemLineOriginal * 100) / 100,
        lineTotal: Math.round(itemLineTotal * 100) / 100,
        lineSavings: Math.round(itemLineSavings * 100) / 100
      };
    });

    const finalPayableAmount = Math.max(0, Math.round((subtotal - totalSavings) * 100) / 100);

    return {
      id: cart.id,
      cafe: {
        id: cart.cafes.id,
        name: cart.cafes.name,
        address: cart.cafes.address,
        city: cart.cafes.city,
        coverImage: cart.cafes.cover_image,
        fulfilmentSettings: cart.cafes.cafe_fulfilment_settings
      },
      items: mappedItems,
      itemCount: mappedItems.reduce((acc, curr) => acc + curr.quantity, 0),
      subtotal: Math.round(subtotal * 100) / 100,
      totalSavings: Math.round(totalSavings * 100) / 100,
      finalPayableAmount
    };
  },

  // Add item to cart with cross-restaurant check
  async addItemToCart(customerId, { cafeId, menuItemId, quantity = 1, forceReplace = false }) {
    if (!cafeId || !menuItemId) {
      const error = new Error('cafeId and menuItemId are required');
      error.statusCode = 400;
      throw error;
    }

    // 0. Server-side Restaurant Business Hours & Ordering Availability Check
    const fulfilmentSettings = await fulfilmentRepository.getOrCreateFulfilmentSettings(cafeId);
    const availability = restaurantAvailabilityService.evaluateOrderingAvailability(fulfilmentSettings);
    if (!availability.canPlaceOrder) {
      const error = new Error(availability.message || 'Restaurant is currently closed for online ordering.');
      error.statusCode = 400;
      error.availability = availability;
      throw error;
    }

    // Verify menuItem exists and belongs to cafe
    const menuItem = await prisma.menu_items.findUnique({
      where: { id: menuItemId }
    });

    if (!menuItem || menuItem.cafe_id !== cafeId) {
      const error = new Error('Menu item not found for this cafe');
      error.statusCode = 404;
      throw error;
    }

    if (!menuItem.is_available) {
      const error = new Error(`"${menuItem.name}" is currently sold out and cannot be added to cart`);
      error.statusCode = 400;
      throw error;
    }

    // Check existing cart
    const existingCart = await cartRepository.findCartByCustomerId(customerId);

    if (existingCart && existingCart.cafe_id !== cafeId) {
      if (!forceReplace) {
        // Return a structured conflict requiring customer confirmation
        return {
          requiresConfirmation: true,
          existingCafe: {
            id: existingCart.cafes.id,
            name: existingCart.cafes.name
          },
          message: `Your cart already contains items from "${existingCart.cafes.name}". Would you like to clear your current cart and start a new order from this restaurant?`
        };
      }

      // If forceReplace is confirmed, clear old items and assign to new cafe
      await cartRepository.clearCartItems(existingCart.id);
      await cartRepository.upsertCart(customerId, cafeId);
    }

    // Ensure cart exists
    const cart = await cartRepository.upsertCart(customerId, cafeId);

    // Add or increment item
    await cartRepository.addItem(cart.id, menuItemId, quantity);

    // Return full updated cart
    return this.getCustomerCart(customerId);
  },

  // Update item quantity
  async updateCartItemQuantity(customerId, cartItemId, quantity) {
    const item = await cartRepository.findItemById(cartItemId);
    if (!item || item.cart.customer_id !== customerId) {
      const error = new Error('Cart item not found');
      error.statusCode = 404;
      throw error;
    }

    await cartRepository.updateItemQuantity(cartItemId, Number(quantity));
    return this.getCustomerCart(customerId);
  },

  // Remove single item from cart
  async removeCartItem(customerId, cartItemId) {
    const item = await cartRepository.findItemById(cartItemId);
    if (!item || item.cart.customer_id !== customerId) {
      const error = new Error('Cart item not found');
      error.statusCode = 404;
      throw error;
    }

    await cartRepository.removeItem(cartItemId);
    return this.getCustomerCart(customerId);
  },

  // Clear entire cart
  async clearCart(customerId) {
    const cart = await cartRepository.findCartByCustomerId(customerId);
    if (cart) {
      await cartRepository.clearCartItems(cart.id);
    }
    return {
      message: 'Cart cleared successfully',
      cart: {
        id: cart?.id || null,
        items: [],
        itemCount: 0,
        subtotal: 0,
        totalSavings: 0,
        finalPayableAmount: 0
      }
    };
  }
};

module.exports = cartService;
