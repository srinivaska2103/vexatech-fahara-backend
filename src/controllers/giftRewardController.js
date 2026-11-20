const giftRewardService = require('../services/giftRewardService');

const giftRewardController = {
  // GET /api/v1/gift-rewards/cart-eligibility?subtotal=1500
  async checkCartEligibility(req, res, next) {
    try {
      const { subtotal } = req.query;
      const evaluation = await giftRewardService.evaluateRewardEligibility(subtotal);
      return res.status(200).json({
        success: true,
        data: evaluation
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/customer/rewards
  async getCustomerRewards(req, res, next) {
    try {
      const customerId = req.user.id;
      const data = await giftRewardService.getCustomerRewards(customerId);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/customer/rewards/redeem
  async redeemReward(req, res, next) {
    try {
      const customerId = req.user.id;
      const { voucherCode } = req.body;
      const result = await giftRewardService.redeemReward(customerId, voucherCode);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // ================= ADMIN ENDPOINTS =================

  // GET /api/v1/admin/gift-rewards/configs
  async getAdminConfigs(req, res, next) {
    try {
      const configs = await giftRewardService.getAllConfigs();
      return res.status(200).json({
        success: true,
        data: configs
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/gift-rewards/configs
  async createConfig(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const created = await giftRewardService.createConfig(adminUserId, req.body);
      return res.status(201).json({
        success: true,
        message: 'Gift reward tier created successfully',
        data: created
      });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/v1/admin/gift-rewards/configs/:id
  async updateConfig(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const { id } = req.params;
      const updated = await giftRewardService.updateConfig(adminUserId, id, req.body);
      return res.status(200).json({
        success: true,
        message: 'Gift reward tier updated successfully',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },


  // DELETE /api/v1/admin/gift-rewards/configs/:id
  async deleteConfig(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const { id } = req.params;
      const result = await giftRewardService.deleteConfig(adminUserId, id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/gift-rewards/issued
  async getAdminIssuedRewards(req, res, next) {
    try {
      const { status, search, page, limit } = req.query;
      const data = await giftRewardService.getAdminCustomerRewards({
        status,
        search,
        page,
        limit
      });
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/gift-rewards/manual-assign
  async manualAssignReward(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const { customerId, configId, reason } = req.body;
      const reward = await giftRewardService.manuallyAssignReward(adminUserId, {
        customerId,
        configId,
        reason
      });
      return res.status(201).json({
        success: true,
        message: 'Gift reward assigned to customer successfully',
        data: reward
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/gift-rewards/revoke/:id
  async revokeReward(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const { id } = req.params;
      const { reason } = req.body;
      const revoked = await giftRewardService.revokeReward(adminUserId, id, reason);
      return res.status(200).json({
        success: true,
        message: 'Gift reward revoked successfully',
        data: revoked
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/gift-rewards/audit-logs
  async getAuditLogs(req, res, next) {
    try {
      const { page, limit } = req.query;
      const data = await giftRewardService.getAuditLogs({ page, limit });
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  },

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

module.exports = giftRewardController;
