const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favoriteController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', favoriteController.getFavorites);
router.get('/ids', favoriteController.getFavoriteIds);
router.post('/toggle', favoriteController.toggleFavorite);
router.post('/:cafeId', favoriteController.toggleFavorite);

module.exports = router;
