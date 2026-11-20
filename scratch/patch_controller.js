const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/controllers/giftRewardController.js');
let s = fs.readFileSync(filePath, 'utf8');

const newControllerMethods = `
  // ── MOVIE TICKET CLAIMS & DISTRIBUTION ───────────────────────────────────

  // POST /api/v1/gift-rewards/claim-ticket
  async claimMovieTicket(req, res, next) {
    try {
      const customerId = req.user.id;
      const { rewardId, notes } = req.body;
      if (!rewardId) {
        return res.status(400).json({
          success: false,
          message: 'rewardId is required to claim a movie ticket'
        });
      }
      const result = await giftRewardService.claimMovieTicketReward(customerId, rewardId, notes);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/gift-rewards/admin/claims
  async getAdminClaims(req, res, next) {
    try {
      const { status, search, page, limit } = req.query;
      const data = await giftRewardService.getAdminTicketClaims({ status, search, page, limit });
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/gift-rewards/admin/claims/:id
  async getAdminClaimDetails(req, res, next) {
    try {
      const { id } = req.params;
      const data = await giftRewardService.getAdminClaimDetails(id);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/gift-rewards/admin/claims/:id/send-ticket
  async sendMovieTicket(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const { id } = req.params;
      const result = await giftRewardService.sendMovieTicketToCustomer(adminUserId, id, req.body);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/gift-rewards/admin/claims/:id/cancel
  async cancelTicketClaim(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const { id } = req.params;
      const { reason } = req.body;
      const result = await giftRewardService.cancelTicketClaim(adminUserId, id, reason);
      return res.status(200).json({
        success: true,
        message: 'Claim cancelled successfully',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
};
`;

s = s.replace('};\n\nmodule.exports = giftRewardController;', `${newControllerMethods}\nmodule.exports = giftRewardController;`);
fs.writeFileSync(filePath, s, 'utf8');
console.log('giftRewardController methods added! 🎬✅');
