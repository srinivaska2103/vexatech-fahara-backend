const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { protect } = require('../middlewares/authMiddleware');

// Customer protected cart routes
router.use(protect);

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.patch('/items/:id', cartController.updateItemQuantity);
router.delete('/items/:id', cartController.removeItem);
router.delete('/', cartController.clearCart);

module.exports = router;

