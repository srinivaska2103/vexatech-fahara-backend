const marketingService = require('../services/marketingService');

const marketingController = {
  // ── PUBLIC CUSTOMER APIS ──

  // GET /api/v1/public/banners
  async getPublicBanners(req, res, next) {
    try {
      const { position } = req.query;
      const banners = await marketingService.getActivePublicBanners(position || 'HOMEPAGE_HERO');
      return res.status(200).json({
        success: true,
        data: banners
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/public/banners/:id/analytics
  async recordBannerAction(req, res, next) {
    try {
      const { id } = req.params;
      const { type } = req.body; // 'impression' | 'click'
      await marketingService.recordBannerAnalytics(id, type);
      return res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // ── ADMIN BANNERS ──

  // GET /api/v1/admin/marketing/banners
  async getAdminBanners(req, res, next) {
    try {
      const { search, status, position } = req.query;
      const banners = await marketingService.getAdminBanners({ search, status, position });
      return res.status(200).json({
        success: true,
        data: banners
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/marketing/banners
  async createBanner(req, res, next) {
    try {
      const banner = await marketingService.createBanner(req.body);
      return res.status(201).json({
        success: true,
        message: 'Banner created successfully',
        data: banner
      });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/v1/admin/marketing/banners/:id
  async updateBanner(req, res, next) {
    try {
      const { id } = req.params;
      const banner = await marketingService.updateBanner(id, req.body);
      return res.status(200).json({
        success: true,
        message: 'Banner updated successfully',
        data: banner
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/marketing/banners/reorder
  async reorderBanners(req, res, next) {
    try {
      const { orderedIds } = req.body;
      const result = await marketingService.reorderBanners(orderedIds);
      return res.status(200).json({
        success: true,
        message: 'Banners reordered successfully',
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/admin/marketing/banners/:id
  async deleteBanner(req, res, next) {
    try {
      const { id } = req.params;
      await marketingService.deleteBanner(id);
      return res.status(200).json({
        success: true,
        message: 'Banner deleted successfully'
      });
    } catch (err) {
      next(err);
    }
  },

  // ── ADMIN PROMOTIONAL OFFERS ──

  // GET /api/v1/admin/marketing/promotional-offers
  async getAdminOffers(req, res, next) {
    try {
      const { search, status, type } = req.query;
      const offers = await marketingService.getAdminPromotionalOffers({ search, status, type });
      return res.status(200).json({
        success: true,
        data: offers
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/marketing/promotional-offers
  async createOffer(req, res, next) {
    try {
      const offer = await marketingService.createPromotionalOffer(req.body);
      return res.status(201).json({
        success: true,
        message: 'Promotional offer created successfully',
        data: offer
      });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/v1/admin/marketing/promotional-offers/:id
  async updateOffer(req, res, next) {
    try {
      const { id } = req.params;
      const offer = await marketingService.updatePromotionalOffer(id, req.body);
      return res.status(200).json({
        success: true,
        message: 'Promotional offer updated successfully',
        data: offer
      });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/admin/marketing/promotional-offers/:id
  async deleteOffer(req, res, next) {
    try {
      const { id } = req.params;
      await marketingService.deletePromotionalOffer(id);
      return res.status(200).json({
        success: true,
        message: 'Promotional offer deleted successfully'
      });
    } catch (err) {
      next(err);
    }
  },

  // ── ADMIN CAMPAIGNS ──

  // GET /api/v1/admin/marketing/campaigns
  async getAdminCampaigns(req, res, next) {
    try {
      const { search, status } = req.query;
      const campaigns = await marketingService.getAdminCampaigns({ search, status });
      return res.status(200).json({
        success: true,
        data: campaigns
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/marketing/campaigns
  async createCampaign(req, res, next) {
    try {
      const campaign = await marketingService.createCampaign(req.body);
      return res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        data: campaign
      });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/v1/admin/marketing/campaigns/:id
  async updateCampaign(req, res, next) {
    try {
      const { id } = req.params;
      const campaign = await marketingService.updateCampaign(id, req.body);
      return res.status(200).json({
        success: true,
        message: 'Campaign updated successfully',
        data: campaign
      });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/admin/marketing/campaigns/:id
  async deleteCampaign(req, res, next) {
    try {
      const { id } = req.params;
      await marketingService.deleteCampaign(id);
      return res.status(200).json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (err) {
      next(err);
    }
  },

  // ── ANALYTICS ──

  // GET /api/v1/admin/marketing/analytics
  async getAnalytics(req, res, next) {
    try {
      const data = await marketingService.getMarketingAnalytics();
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = marketingController;
