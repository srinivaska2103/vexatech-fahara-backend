const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/routes/giftRewardRoutes.js');
let s = fs.readFileSync(filePath, 'utf8');

// 1. Add Customer Claim route
if (!s.includes('/claim-ticket')) {
  s = s.replace(
    "router.post('/redeem', protect, giftRewardController.redeemReward);",
    "router.post('/redeem', protect, giftRewardController.redeemReward);\nrouter.post('/claim-ticket', protect, giftRewardController.claimMovieTicket);"
  );
}

// 2. Add Admin Claims routes
const adminClaimRoutes = `router.get('/admin/claims', giftRewardController.getAdminClaims);
router.get('/admin/claims/:id', giftRewardController.getAdminClaimDetails);
router.post('/admin/claims/:id/send-ticket', giftRewardController.sendMovieTicket);
router.post('/admin/claims/:id/cancel', giftRewardController.cancelTicketClaim);`;

if (!s.includes('/admin/claims')) {
  s = s.replace(
    "router.get('/admin/audit-logs', giftRewardController.getAuditLogs);",
    `router.get('/admin/audit-logs', giftRewardController.getAuditLogs);\n${adminClaimRoutes}`
  );
}

fs.writeFileSync(filePath, s, 'utf8');
console.log('giftRewardRoutes updated! 🛣️✅');
