const prisma = require('../config/prisma');

class MarketingService {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. BANNER MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get Active Banners for Customers (Homepage / Food / Cafe)
   * Validates scheduling & active state
   */
  async getActivePublicBanners(position = 'HOMEPAGE_HERO') {
    const now = new Date();

    // If requesting FOOD_HERO, HOMEPAGE_HERO, etc., support matching the requested position
    // or if none found for a specific sub-hero like FOOD_HERO, we can query position OR HOMEPAGE_HERO
    const wherePosition = (position && position !== 'ALL') ? position : undefined;

    let banners = await prisma.banners.findMany({
      where: {
        ...(wherePosition ? { position: wherePosition } : {}),
        is_active: true,
        OR: [
          {
            AND: [
              { start_date: null },
              { end_date: null }
            ]
          },
          {
            AND: [
              { start_date: { lte: now } },
              { OR: [{ end_date: null }, { end_date: { gte: now } }] }
            ]
          },
          {
            AND: [
              { start_date: null },
              { end_date: { gte: now } }
            ]
          }
        ]
      },
      include: {
        offer: {
          select: {
            id: true,
            title: true,
            offer_code: true,
            offer_type: true,
            discount_value: true
          }
        }
      },
      orderBy: { display_order: 'asc' }
    });

    // If looking for FOOD_HERO and no specific FOOD_HERO banners exist, check for general HOMEPAGE_HERO banners
    if ((!banners || banners.length === 0) && position === 'FOOD_HERO') {
      banners = await prisma.banners.findMany({
        where: {
          position: 'HOMEPAGE_HERO',
          is_active: true,
          OR: [
            {
              AND: [
                { start_date: null },
                { end_date: null }
              ]
            },
            {
              AND: [
                { start_date: { lte: now } },
                { OR: [{ end_date: null }, { end_date: { gte: now } }] }
              ]
            },
            {
              AND: [
                { start_date: null },
                { end_date: { gte: now } }
              ]
            }
          ]
        },
        include: {
          offer: {
            select: {
              id: true,
              title: true,
              offer_code: true,
              offer_type: true,
              discount_value: true
            }
          }
        },
        orderBy: { display_order: 'asc' }
      });
    }

    return banners;
  }

  /**
   * Record Banner Impression / Click Analytics
   */
  async recordBannerAnalytics(bannerId, type = 'impression') {
    if (!bannerId) return;

    if (type === 'click') {
      await prisma.banners.update({
        where: { id: bannerId },
        data: { clicks_count: { increment: 1 } }
      }).catch(() => null);
    } else {
      await prisma.banners.update({
        where: { id: bannerId },
        data: { impressions_count: { increment: 1 } }
      }).catch(() => null);
    }
  }

  /**
   * Admin: List All Banners with Filters
   */
  async getAdminBanners({ search, status, position }) {
    const where = {};

    if (position && position !== 'ALL') {
      where.position = position;
    }

    if (status && status !== 'ALL') {
      if (status === 'ACTIVE') where.is_active = true;
      if (status === 'INACTIVE') where.is_active = false;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { highlight_text: { contains: search, mode: 'insensitive' } }
      ];
    }

    const banners = await prisma.banners.findMany({
      where,
      include: {
        campaign: { select: { id: true, name: true, campaign_code: true } },
        offer: { select: { id: true, title: true, offer_code: true } }
      },
      orderBy: { display_order: 'asc' }
    });

    // Compute live computed status (ACTIVE, INACTIVE, SCHEDULED, EXPIRED)
    const now = new Date();
    const enriched = banners.map(b => {
      let computedStatus = b.is_active ? 'ACTIVE' : 'INACTIVE';
      if (b.is_active) {
        if (b.start_date && new Date(b.start_date) > now) {
          computedStatus = 'SCHEDULED';
        } else if (b.end_date && new Date(b.end_date) < now) {
          computedStatus = 'EXPIRED';
        }
      }
      return {
        ...b,
        computed_status: computedStatus,
        ctr: b.impressions_count > 0 ? ((b.clicks_count / b.impressions_count) * 100).toFixed(1) : '0.0'
      };
    });

    return enriched;
  }

  /**
   * Admin: Create Banner
   */
  async createBanner(data) {
    const maxOrder = await prisma.banners.aggregate({
      _max: { display_order: true },
      where: { position: data.position || 'HOMEPAGE_HERO' }
    });
    const nextOrder = (maxOrder._max.display_order || 0) + 1;

    const banner = await prisma.banners.create({
      data: {
        name: data.name,
        title: data.title,
        highlight_text: data.highlight_text || null,
        subtitle: data.subtitle || null,
        desktop_image_url: data.desktop_image_url || null,
        mobile_image_url: data.mobile_image_url || null,
        bg_color: data.bg_color || '#FFFFFF',
        text_color: data.text_color || '#252525',
        badge_bg: data.badge_bg || '#E50914',
        cta_text: data.cta_text || 'ORDER NOW',
        cta_link: data.cta_link || '/customer/food',
        cta_bg_color: data.cta_bg_color || '#E50914',
        cta_text_color: data.cta_text_color || '#FFFFFF',
        banner_layout: data.banner_layout || 'THREE_PART_HERO',
        promotional_label: data.promotional_label || 'BEST DEAL',
        center_image_url: data.center_image_url || null,
        mobile_center_image_url: data.mobile_center_image_url || null,
        center_image_size: data.center_image_size || 'contain',
        center_image_position: data.center_image_position || 'center',
        discount_value: data.discount_value || '50',
        discount_symbol: data.discount_symbol || '%',
        offer_heading: data.offer_heading || 'OFF',
        offer_subtitle: data.offer_subtitle || null,
        offer_text_color: data.offer_text_color || '#E50914',
        offer_bg_color: data.offer_bg_color || '#FFFFFF',
        position: data.position || 'HOMEPAGE_HERO',
        display_order: data.display_order ? Number(data.display_order) : nextOrder,
        is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
        status: data.is_active ? 'ACTIVE' : 'INACTIVE',
        start_date: data.start_date ? new Date(data.start_date) : null,
        end_date: data.end_date ? new Date(data.end_date) : null,
        campaign_id: data.campaign_id || null,
        offer_id: data.offer_id || null
      }
    });

    return banner;
  }

  /**
   * Admin: Update Banner
   */
  async updateBanner(id, data) {
    const banner = await prisma.banners.update({
      where: { id },
      data: {
        name: data.name,
        title: data.title,
        highlight_text: data.highlight_text || null,
        subtitle: data.subtitle || null,
        desktop_image_url: data.desktop_image_url || null,
        mobile_image_url: data.mobile_image_url || null,
        bg_color: data.bg_color || undefined,
        text_color: data.text_color || undefined,
        badge_bg: data.badge_bg || undefined,
        cta_text: data.cta_text || undefined,
        cta_link: data.cta_link || undefined,
        cta_bg_color: data.cta_bg_color || undefined,
        cta_text_color: data.cta_text_color || undefined,
        banner_layout: data.banner_layout || undefined,
        promotional_label: data.promotional_label !== undefined ? (data.promotional_label || null) : undefined,
        center_image_url: data.center_image_url !== undefined ? (data.center_image_url || null) : undefined,
        mobile_center_image_url: data.mobile_center_image_url !== undefined ? (data.mobile_center_image_url || null) : undefined,
        center_image_size: data.center_image_size || undefined,
        center_image_position: data.center_image_position || undefined,
        discount_value: data.discount_value !== undefined ? data.discount_value : undefined,
        discount_symbol: data.discount_symbol !== undefined ? data.discount_symbol : undefined,
        offer_heading: data.offer_heading !== undefined ? data.offer_heading : undefined,
        offer_subtitle: data.offer_subtitle !== undefined ? (data.offer_subtitle || null) : undefined,
        offer_text_color: data.offer_text_color || undefined,
        offer_bg_color: data.offer_bg_color || undefined,
        position: data.position || undefined,
        display_order: data.display_order !== undefined ? Number(data.display_order) : undefined,
        is_active: data.is_active !== undefined ? Boolean(data.is_active) : undefined,
        status: data.is_active !== undefined ? (data.is_active ? 'ACTIVE' : 'INACTIVE') : undefined,
        start_date: data.start_date !== undefined ? (data.start_date ? new Date(data.start_date) : null) : undefined,
        end_date: data.end_date !== undefined ? (data.end_date ? new Date(data.end_date) : null) : undefined,
        campaign_id: data.campaign_id !== undefined ? (data.campaign_id || null) : undefined,
        offer_id: data.offer_id !== undefined ? (data.offer_id || null) : undefined
      }
    });

    return banner;
  }

  /**
   * Admin: Reorder Banners (Drag & Drop)
   */
  async reorderBanners(orderedIds) {
    if (!Array.isArray(orderedIds)) return;

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.banners.update({
          where: { id },
          data: { display_order: index + 1 }
        })
      )
    );

    return { success: true };
  }

  /**
   * Admin: Delete Banner
   */
  async deleteBanner(id) {
    return await prisma.banners.delete({ where: { id } });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PROMOTIONAL OFFERS MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  async getAdminPromotionalOffers({ search, status, type }) {
    const where = {};

    if (type && type !== 'ALL') {
      where.offer_type = type;
    }

    if (status && status !== 'ALL') {
      if (status === 'ACTIVE') where.is_active = true;
      if (status === 'INACTIVE') where.is_active = false;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { offer_code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const offers = await prisma.promotional_offers.findMany({
      where,
      include: {
        _count: { select: { banners: true, campaigns: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    return offers;
  }

  async createPromotionalOffer(data) {
    const offer = await prisma.promotional_offers.create({
      data: {
        title: data.title,
        offer_code: data.offer_code.trim().toUpperCase(),
        description: data.description || null,
        offer_type: data.offer_type || 'PERCENTAGE_DISCOUNT',
        discount_value: data.discount_value || 0,
        min_order_value: data.min_order_value || 0,
        max_discount_amount: data.max_discount_amount ? Number(data.max_discount_amount) : null,
        applicable_type: data.applicable_type || 'ALL',
        applicable_ids: data.applicable_ids || [],
        customer_eligibility: data.customer_eligibility || 'ALL_CUSTOMERS',
        total_usage_limit: data.total_usage_limit ? Number(data.total_usage_limit) : null,
        usage_per_customer: Number(data.usage_per_customer) || 1,
        is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
        status: data.is_active ? 'ACTIVE' : 'INACTIVE',
        start_date: data.start_date ? new Date(data.start_date) : null,
        end_date: data.end_date ? new Date(data.end_date) : null
      }
    });

    return offer;
  }

  async updatePromotionalOffer(id, data) {
    const offer = await prisma.promotional_offers.update({
      where: { id },
      data: {
        title: data.title,
        offer_code: data.offer_code ? data.offer_code.trim().toUpperCase() : undefined,
        description: data.description,
        offer_type: data.offer_type,
        discount_value: data.discount_value !== undefined ? data.discount_value : undefined,
        min_order_value: data.min_order_value !== undefined ? data.min_order_value : undefined,
        max_discount_amount: data.max_discount_amount !== undefined ? (data.max_discount_amount ? Number(data.max_discount_amount) : null) : undefined,
        applicable_type: data.applicable_type,
        applicable_ids: data.applicable_ids,
        customer_eligibility: data.customer_eligibility,
        total_usage_limit: data.total_usage_limit !== undefined ? (data.total_usage_limit ? Number(data.total_usage_limit) : null) : undefined,
        usage_per_customer: data.usage_per_customer !== undefined ? Number(data.usage_per_customer) : undefined,
        is_active: data.is_active !== undefined ? Boolean(data.is_active) : undefined,
        status: data.is_active ? 'ACTIVE' : 'INACTIVE',
        start_date: data.start_date !== undefined ? (data.start_date ? new Date(data.start_date) : null) : undefined,
        end_date: data.end_date !== undefined ? (data.end_date ? new Date(data.end_date) : null) : undefined
      }
    });

    return offer;
  }

  async deletePromotionalOffer(id) {
    return await prisma.promotional_offers.delete({ where: { id } });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. CAMPAIGN MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────

  async getAdminCampaigns({ search, status }) {
    const where = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { campaign_code: { contains: search, mode: 'insensitive' } }
      ];
    }

    const campaigns = await prisma.marketing_campaigns.findMany({
      where,
      include: {
        offer: true,
        banners: true
      },
      orderBy: { created_at: 'desc' }
    });

    return campaigns;
  }

  async createCampaign(data) {
    const campaign = await prisma.marketing_campaigns.create({
      data: {
        name: data.name,
        description: data.description || null,
        campaign_code: data.campaign_code ? data.campaign_code.trim().toUpperCase() : `CMP-${Date.now().toString().slice(-6)}`,
        offer_id: data.offer_id || null,
        status: data.status || 'ACTIVE',
        is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
        start_date: data.start_date ? new Date(data.start_date) : null,
        end_date: data.end_date ? new Date(data.end_date) : null,
        channel_homepage: data.channel_homepage !== undefined ? Boolean(data.channel_homepage) : true,
        channel_food_page: data.channel_food_page !== undefined ? Boolean(data.channel_food_page) : true,
        channel_push_notify: data.channel_push_notify !== undefined ? Boolean(data.channel_push_notify) : false
      }
    });

    return campaign;
  }

  async updateCampaign(id, data) {
    const campaign = await prisma.marketing_campaigns.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        campaign_code: data.campaign_code ? data.campaign_code.trim().toUpperCase() : undefined,
        offer_id: data.offer_id !== undefined ? (data.offer_id || null) : undefined,
        status: data.status,
        is_active: data.is_active !== undefined ? Boolean(data.is_active) : undefined,
        start_date: data.start_date !== undefined ? (data.start_date ? new Date(data.start_date) : null) : undefined,
        end_date: data.end_date !== undefined ? (data.end_date ? new Date(data.end_date) : null) : undefined,
        channel_homepage: data.channel_homepage !== undefined ? Boolean(data.channel_homepage) : undefined,
        channel_food_page: data.channel_food_page !== undefined ? Boolean(data.channel_food_page) : undefined,
        channel_push_notify: data.channel_push_notify !== undefined ? Boolean(data.channel_push_notify) : undefined
      }
    });

    return campaign;
  }

  async deleteCampaign(id) {
    return await prisma.marketing_campaigns.delete({ where: { id } });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. OVERALL MARKETING ANALYTICS
  // ───────────────────────────────────────────────────────────────────────────

  async getMarketingAnalytics() {
    const [
      totalBanners,
      activeBanners,
      bannerAggregates,
      totalOffers,
      activeOffers,
      totalCampaigns,
      recentBanners
    ] = await Promise.all([
      prisma.banners.count(),
      prisma.banners.count({ where: { is_active: true } }),
      prisma.banners.aggregate({
        _sum: { impressions_count: true, clicks_count: true }
      }),
      prisma.promotional_offers.count(),
      prisma.promotional_offers.count({ where: { is_active: true } }),
      prisma.marketing_campaigns.count(),
      prisma.banners.findMany({
        take: 5,
        orderBy: { clicks_count: 'desc' },
        select: {
          id: true,
          name: true,
          title: true,
          impressions_count: true,
          clicks_count: true,
          position: true
        }
      })
    ]);

    const totalImpressions = bannerAggregates._sum.impressions_count || 0;
    const totalClicks = bannerAggregates._sum.clicks_count || 0;
    const overallCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

    return {
      banners: {
        total: totalBanners,
        active: activeBanners,
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr: `${overallCtr}%`,
        topPerforming: recentBanners
      },
      offers: {
        total: totalOffers,
        active: activeOffers
      },
      campaigns: {
        total: totalCampaigns
      }
    };
  }
}

module.exports = new MarketingService();
