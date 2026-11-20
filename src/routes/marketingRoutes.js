const express = require('express');
const router = express.Router();
const marketingController = require('../controllers/marketingController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// ── PUBLIC ENDPOINTS (Customers) ──
router.get('/public/banners', marketingController.getPublicBanners);
router.post('/public/banners/:id/analytics', marketingController.recordBannerAction);

// ── ADMIN ENDPOINTS ──
const adminAuth = [protect, authorizeRoles('ADMIN')];

// Banners
router.get('/admin/banners', ...adminAuth, marketingController.getAdminBanners);
router.post('/admin/banners', ...adminAuth, marketingController.createBanner);
router.put('/admin/banners/:id', ...adminAuth, marketingController.updateBanner);
router.delete('/admin/banners/:id', ...adminAuth, marketingController.deleteBanner);
router.post('/admin/banners/reorder', ...adminAuth, marketingController.reorderBanners);

// Promotional Offers
router.get('/admin/promotional-offers', ...adminAuth, marketingController.getAdminOffers);
router.post('/admin/promotional-offers', ...adminAuth, marketingController.createOffer);
router.put('/admin/promotional-offers/:id', ...adminAuth, marketingController.updateOffer);
router.delete('/admin/promotional-offers/:id', ...adminAuth, marketingController.deleteOffer);

// Campaigns
router.get('/admin/campaigns', ...adminAuth, marketingController.getAdminCampaigns);
router.post('/admin/campaigns', ...adminAuth, marketingController.createCampaign);
router.put('/admin/campaigns/:id', ...adminAuth, marketingController.updateCampaign);
router.delete('/admin/campaigns/:id', ...adminAuth, marketingController.deleteCampaign);

// Marketing Analytics
router.get('/admin/analytics', ...adminAuth, marketingController.getAnalytics);

module.exports = router;
