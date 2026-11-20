const express = require('express');
const router = express.Router();
const giftRewardController = require('../controllers/giftRewardController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// ── CUSTOMER & PUBLIC ENDPOINTS ──

// Public / Customer: Live cart threshold eligibility evaluation
router.get('/cart-eligibility', giftRewardController.checkCartEligibility);

// Customer: My Rewards management
router.get('/my-rewards', protect, giftRewardController.getCustomerRewards);
router.post('/redeem', protect, giftRewardController.redeemReward);
router.post('/claim-ticket', protect, giftRewardController.claimMovieTicket);

// ── ADMIN REWARD MANAGEMENT ──

router.use('/admin', protect, authorizeRoles('ADMIN'));
router.get('/admin/configs', giftRewardController.getAdminConfigs);
router.post('/admin/configs', giftRewardController.createConfig);
router.put('/admin/configs/:id', giftRewardController.updateConfig);
router.delete('/admin/configs/:id', giftRewardController.deleteConfig);
router.get('/admin/issued', giftRewardController.getAdminIssuedRewards);
router.post('/admin/manual-assign', giftRewardController.manualAssignReward);
router.post('/admin/revoke/:id', giftRewardController.revokeReward);
router.get('/admin/audit-logs', giftRewardController.getAuditLogs);
router.get('/admin/claims', giftRewardController.getAdminClaims);
router.get('/admin/claims/:id', giftRewardController.getAdminClaimDetails);
router.post('/admin/claims/:id/send-ticket', giftRewardController.sendMovieTicket);
router.post('/admin/claims/:id/cancel', giftRewardController.cancelTicketClaim);

module.exports = router;
