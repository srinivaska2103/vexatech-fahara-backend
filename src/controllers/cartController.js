const cartService = require('../services/cartService');

const cartController = {
  // GET /api/v1/customer/cart
  async getCart(req, res, next) {
    try {
      const customerId = req.user.id;
      const cart = await cartService.getCustomerCart(customerId);
      return res.status(200).json({
        success: true,
        data: cart
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/customer/cart/items
  async addItem(req, res, next) {
    try {
      const customerId = req.user.id;
      const { cafeId, menuItemId, quantity, forceReplace } = req.body;
      const result = await cartService.addItemToCart(customerId, {
        cafeId,
        menuItemId,
        quantity: quantity ? Number(quantity) : 1,
        forceReplace: Boolean(forceReplace)
      });

      if (result.requiresConfirmation) {
        return res.status(409).json({
          success: false,
          requiresConfirmation: true,
          existingCafe: result.existingCafe,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Item added to cart',
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/customer/cart/items/:id
  async updateItemQuantity(req, res, next) {
    try {
      const customerId = req.user.id;
      const { id } = req.params;
      const { quantity } = req.body;

      const updatedCart = await cartService.updateCartItemQuantity(customerId, id, quantity);
      return res.status(200).json({
        success: true,
        message: 'Cart updated',
        data: updatedCart
      });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/customer/cart/items/:id
  async removeItem(req, res, next) {
    try {
      const customerId = req.user.id;
      const { id } = req.params;

      const updatedCart = await cartService.removeCartItem(customerId, id);
      return res.status(200).json({
        success: true,
        message: 'Item removed from cart',
        data: updatedCart
      });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/customer/cart
  async clearCart(req, res, next) {
    try {
      const customerId = req.user.id;
      const result = await cartService.clearCart(customerId);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.cart
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = cartController;

