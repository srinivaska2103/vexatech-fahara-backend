const prisma = require('../config/prisma');
const crypto = require('crypto');

/**
 * Service managing Grab2Go Automatic Gift Rewards:
 * - Real-time cart threshold evaluation
 * - Automatic reward issuance on order confirmation / payment
 * - Reversal on order cancellation / refund
 * - Customer reward retrieval & redemption
 * - Admin reward configuration & audit logging
 */
class GiftRewardService {
  /**
   * Generate a unique, professional alphanumeric voucher code
   * e.g., G2G-MVI-7X8A9-2026
   */
  generateVoucherCode(category = 'GIFT') {
    const prefixMap = {
      MOVIE_TICKETS: 'G2G-MVI',
      FREE_FOOD: 'G2G-FOD',
      DISCOUNT_VOUCHER: 'G2G-VOU',
      FREE_DELIVERY: 'G2G-DEL',
      SHOPPING_CARD: 'G2G-SHP',
      SURPRISE_GIFT: 'G2G-GFT'
    };
    const prefix = prefixMap[category] || 'G2G-RWD';
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const timestamp = Date.now().toString().slice(-4);
    return `${prefix}-${rand}-${timestamp}`;
  }

  /**
   * 1. Evaluate Gift Reward Eligibility for a Cart / Order Subtotal
   * Returns:
   * - isEligible: boolean
   * - eligibleReward: best tier reward unlocked (or null)
   * - nextTier: next higher reward tier (or null)
   * - amountNeededForNext: number
   * - allTiers: array of active configs sorted by min_order_value
   */
  async evaluateRewardEligibility(subtotal) {
    const currentSubtotal = Math.max(0, Number(subtotal) || 0);

    const activeConfigs = await prisma.gift_reward_configs.findMany({
      where: {
        is_active: true,
        available_quantity: { gt: 0 }
      },
      orderBy: {
        min_order_value: 'asc'
      }
    });

    if (!activeConfigs || activeConfigs.length === 0) {
      return {
        isEligible: false,
        eligibleReward: null,
        nextTier: null,
        amountNeededForNext: 0,
        subtotal: currentSubtotal,
        allTiers: []
      };
    }

    // Find highest threshold unlocked
    const unlockedConfigs = activeConfigs.filter(
      (cfg) => currentSubtotal >= Number(cfg.min_order_value)
    );

    const eligibleReward = unlockedConfigs.length > 0
      ? unlockedConfigs[unlockedConfigs.length - 1]
      : null;

    // Find next locked tier
    const lockedConfigs = activeConfigs.filter(
      (cfg) => currentSubtotal < Number(cfg.min_order_value)
    );
    const nextTier = lockedConfigs.length > 0 ? lockedConfigs[0] : null;
    const amountNeededForNext = nextTier
      ? Math.max(0, Number(nextTier.min_order_value) - currentSubtotal)
      : 0;

    return {
      isEligible: Boolean(eligibleReward),
      eligibleReward,
      nextTier,
      amountNeededForNext,
      subtotal: currentSubtotal,
      allTiers: activeConfigs
    };
  }

  /**
   * 2. Automatically Issue Reward for a confirmed Order
   * Called upon successful checkout (or online payment verification).
   * Ensures idempotency: will not issue duplicates if order already has an assigned reward.
   */
  async issueRewardForOrder(orderId, customerId, tx = null) {
    const db = tx || prisma;

    if (!orderId || !customerId) {
      return { issued: false, reason: 'Missing orderId or customerId' };
    }

    // Check if a reward is already issued for this order
    const existing = await db.customer_gift_rewards.findFirst({
      where: { order_id: orderId }
    });

    if (existing) {
      return {
        issued: false,
        alreadyIssued: true,
        reward: existing,
        message: 'Reward already issued for this order'
      };
    }

    // Fetch order details
    const order = await db.food_orders.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return { issued: false, reason: 'Order not found' };
    }

    // Check order subtotal eligibility
    const orderSubtotal = Number(order.subtotal || 0);
    const evaluation = await this.evaluateRewardEligibility(orderSubtotal);

    if (!evaluation.isEligible || !evaluation.eligibleReward) {
      return {
        issued: false,
        reason: 'Order subtotal does not meet any active gift reward threshold',
        evaluation
      };
    }

    const config = evaluation.eligibleReward;
    const voucherCode = this.generateVoucherCode(config.category);

    // Calculate expiry (default 30 days from now, or config.valid_until)
    const expiresAt = config.valid_until
      ? new Date(config.valid_until)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const qrData = JSON.stringify({
      code: voucherCode,
      category: config.category,
      orderNumber: order.order_number,
      customer: customerId,
      validUntil: expiresAt.toISOString()
    });

    // Create customer gift reward
    const createdReward = await db.customer_gift_rewards.create({
      data: {
        reward_config_id: config.id,
        customer_id: customerId,
        order_id: orderId,
        voucher_code: voucherCode,
        status: 'AVAILABLE',
        reward_title: config.title,
        reward_category: config.category,
        reward_value: config.reward_value || 0,
        image_url: config.image_url,
        min_order_value: config.min_order_value,
        redemption_instructions: config.redemption_instructions,
        qr_code_data: qrData,
        issued_at: new Date(),
        expires_at: expiresAt
      }
    });

    // Decrement available quantity & increment claimed count on config
    await db.gift_reward_configs.update({
      where: { id: config.id },
      data: {
        available_quantity: { decrement: 1 },
        claimed_count: { increment: 1 }
      }
    });

    // Record audit log
    await db.gift_reward_audit_logs.create({
      data: {
        action: 'ISSUED',
        customer_id: customerId,
        order_id: orderId,
        reward_id: createdReward.id,
        reward_config_id: config.id,
        performed_by_id: null,
        performed_by_role: 'SYSTEM',
        notes: `Automatic gift reward unlocked for order #${order.order_number} (Subtotal: ₹${orderSubtotal.toFixed(2)})`,
        metadata: {
          voucherCode,
          tierName: config.tier_name,
          minOrderValue: Number(config.min_order_value)
        }
      }
    });

    // Check threshold: If customer purchase is >= 1500 (or unlocked reward tier), send reward won details email to Admin
    const orderTotalAmount = Number(order.total_amount || order.subtotal || 0);
    if (orderTotalAmount >= 1500 || orderSubtotal >= 1500) {
      try {
        const customer = await db.users.findUnique({
          where: { id: customerId },
          select: { name: true, email: true, phone: true }
        });

        const cafe = order.cafe_id ? await db.cafes.findUnique({
          where: { id: order.cafe_id },
          select: { name: true, city: true }
        }) : null;

        const emailService = require('../utils/emailService');
        const adminEmail = emailService.getAdminEmail ? emailService.getAdminEmail() : (process.env.ADMIN_EMAIL || 'vexatech.connect@gmail.com');

        const emailSubject = `🎁 High-Value Purchase Reward Unlocked (₹${orderTotalAmount.toFixed(2)}) - Order #${order.order_number}`;
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 16px; border: 1px solid #fee2e2;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="display: inline-block; padding: 8px 16px; background: #fef2f2; border: 1px solid #ef4444; border-radius: 9999px; color: #dc2626; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
                High-Value Customer Reward Alert
              </span>
              <h2 style="color: #1c1917; font-size: 22px; font-weight: 900; margin: 16px 0 6px;">Customer Won Reward on ₹1,500+ Order</h2>
              <p style="color: #78716c; font-size: 14px; margin: 0;">Order #${order.order_number} has qualified and automatically unlocked a gift reward.</p>
            </div>

            <div style="background: #fafaf9; border-radius: 12px; padding: 18px; margin-bottom: 20px; border: 1px solid #e7e5e4;">
              <h3 style="margin: 0 0 12px; font-size: 15px; color: #dc2626; text-transform: uppercase; letter-spacing: 0.03em;">Reward Won Details</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="padding: 6px 0; color: #78716c; width: 140px;">Reward Title:</td>
                  <td style="padding: 6px 0; color: #1c1917; font-weight: 700;">${config.title || 'Gift Reward'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #78716c;">Voucher Code:</td>
                  <td style="padding: 6px 0; color: #dc2626; font-weight: 800; font-family: monospace;">${voucherCode}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #78716c;">Category / Tier:</td>
                  <td style="padding: 6px 0; color: #1c1917; font-weight: 600;">${config.category || 'REWARD'} (${config.tier_name || 'Standard'})</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #78716c;">Reward Value:</td>
                  <td style="padding: 6px 0; color: #16a34a; font-weight: 800;">₹${Number(config.reward_value || 0).toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #78716c;">Expires At:</td>
                  <td style="padding: 6px 0; color: #1c1917;">${expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                </tr>
              </table>
            </div>

            <div style="background: #fafaf9; border-radius: 12px; padding: 18px; margin-bottom: 20px; border: 1px solid #e7e5e4;">
              <h3 style="margin: 0 0 12px; font-size: 15px; color: #1c1917; text-transform: uppercase; letter-spacing: 0.03em;">Customer & Order Information</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="padding: 6px 0; color: #78716c; width: 140px;">Customer Name:</td>
                  <td style="padding: 6px 0; color: #1c1917; font-weight: 700;">${customer?.name || order.customer_name || 'Valued Diner'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #78716c;">Customer Email:</td>
                  <td style="padding: 6px 0; color: #1c1917;">${customer?.email || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #78716c;">Customer Phone:</td>
                  <td style="padding: 6px 0; color: #1c1917;">${customer?.phone || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #78716c;">Restaurant / Cafe:</td>
                  <td style="padding: 6px 0; color: #1c1917; font-weight: 600;">${cafe?.name || 'Partner Restaurant'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #78716c;">Total Order Value:</td>
                  <td style="padding: 6px 0; color: #dc2626; font-weight: 900; font-size: 14px;">₹${orderTotalAmount.toLocaleString()}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin-top: 24px; padding-top: 18px; border-top: 1px solid #f5f5f4;">
              <p style="color: #a8a29e; font-size: 12px; margin: 0;">This is an automated notification from Grab2GO Admin Suite.</p>
            </div>
          </div>
        `;

        await emailService.sendEmail(
          adminEmail,
          emailSubject,
          `High-Value Order Alert: Order #${order.order_number} (₹${orderTotalAmount}) unlocked reward ${config.title} (Code: ${voucherCode}) for customer ${customer?.name || 'Customer'}.`,
          emailHtml,
          true,
          'Grab2GO Rewards Engine'
        );
      } catch (emailErr) {
        console.error('[GiftRewardService] Error notifying admin of high-value reward won:', emailErr.message || emailErr);
      }
    }

    return {
      issued: true,
      reward: createdReward,
      config
    };
  }

  /**
   * 3. Reverse / Cancel Reward when Order is Cancelled or Refunded
   */
  async handleOrderCancelledOrRefunded(orderId, reason = 'Order cancelled or refunded', tx = null) {
    const db = tx || prisma;

    const reward = await db.customer_gift_rewards.findFirst({
      where: {
        order_id: orderId,
        status: 'AVAILABLE'
      }
    });

    if (!reward) {
      return { reversed: false, message: 'No active reward found to cancel for this order' };
    }

    const updated = await db.customer_gift_rewards.update({
      where: { id: reward.id },
      data: {
        status: 'CANCELLED',
        cancelled_at: new Date(),
        revocation_reason: reason
      }
    });

    // Return stock back to pool
    await db.gift_reward_configs.update({
      where: { id: reward.reward_config_id },
      data: {
        available_quantity: { increment: 1 },
        claimed_count: { decrement: 1 }
      }
    }).catch(() => null);

    // Audit log
    await db.gift_reward_audit_logs.create({
      data: {
        action: 'CANCELLED',
        customer_id: reward.customer_id,
        order_id: orderId,
        reward_id: reward.id,
        reward_config_id: reward.reward_config_id,
        performed_by_role: 'SYSTEM',
        notes: `Reward ${reward.voucher_code} reversed: ${reason}`,
        metadata: { voucherCode: reward.voucher_code }
      }
    }).catch(() => null);

    return { reversed: true, reward: updated };
  }

  /**
   * 4. Get Customer's Rewards (grouped by AVAILABLE, REDEEMED, EXPIRED, CANCELLED)
   */
  async getCustomerRewards(customerId) {
    const now = new Date();

    // Check for expired available rewards and update lazily
    await prisma.customer_gift_rewards.updateMany({
      where: {
        customer_id: customerId,
        status: 'AVAILABLE',
        expires_at: { lt: now }
      },
      data: {
        status: 'EXPIRED'
      }
    }).catch(() => null);

    const rewards = await prisma.customer_gift_rewards.findMany({
      where: { customer_id: customerId },
      include: {
        order: {
          select: {
            id: true,
            order_number: true,
            total_amount: true,
            subtotal: true,
            created_at: true,
            cafes: { select: { id: true, name: true, city: true } }
          }
        },
        reward_config: {
          select: {
            id: true,
            tier_name: true,
            terms_conditions: true
          }
        },
        reward_claims: {
          include: {
            reward_tickets: {
              where: { status: 'ACTIVE' },
              orderBy: { created_at: 'desc' }
            }
          },
          orderBy: { created_at: 'desc' }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const summary = {
      total: rewards.length,
      available: rewards.filter(r => r.status === 'AVAILABLE').length,
      redeemed: rewards.filter(r => r.status === 'REDEEMED').length,
      expired: rewards.filter(r => r.status === 'EXPIRED').length,
      cancelled: rewards.filter(r => ['CANCELLED', 'REVOKED'].includes(r.status)).length
    };

    return {
      summary,
      rewards
    };
  }

  /**
   * 5. Customer Redeems a Voucher
   */
  async redeemReward(customerId, voucherCode) {
    if (!voucherCode?.trim()) {
      const err = new Error('Voucher code is required');
      err.statusCode = 400;
      throw err;
    }

    const reward = await prisma.customer_gift_rewards.findUnique({
      where: { voucher_code: voucherCode.trim().toUpperCase() }
    });

    if (!reward) {
      const err = new Error('Reward voucher not found');
      err.statusCode = 404;
      throw err;
    }

    if (reward.customer_id !== customerId) {
      const err = new Error('Unauthorized to redeem this reward voucher');
      err.statusCode = 403;
      throw err;
    }

    if (reward.status === 'REDEEMED') {
      const err = new Error(`This voucher was already redeemed on ${new Date(reward.redeemed_at).toLocaleDateString()}`);
      err.statusCode = 400;
      throw err;
    }

    if (reward.status === 'EXPIRED' || (reward.expires_at && new Date(reward.expires_at) < new Date())) {
      const err = new Error('This voucher has expired and is no longer valid');
      err.statusCode = 400;
      throw err;
    }

    if (reward.status === 'CANCELLED' || reward.status === 'REVOKED') {
      const err = new Error(`This voucher was ${reward.status.toLowerCase()}: ${reward.revocation_reason || 'N/A'}`);
      err.statusCode = 400;
      throw err;
    }

    const updated = await prisma.customer_gift_rewards.update({
      where: { id: reward.id },
      data: {
        status: 'REDEEMED',
        redeemed_at: new Date()
      }
    });

    await prisma.gift_reward_audit_logs.create({
      data: {
        action: 'REDEEMED',
        customer_id: customerId,
        order_id: reward.order_id,
        reward_id: reward.id,
        reward_config_id: reward.reward_config_id,
        performed_by_id: customerId,
        performed_by_role: 'CUSTOMER',
        notes: `Customer redeemed voucher ${reward.voucher_code}`,
        metadata: { voucherCode: reward.voucher_code }
      }
    });

    return {
      success: true,
      message: 'Reward redeemed successfully! Enjoy your gift!',
      reward: updated
    };
  }

  // ================= ADMIN FUNCTIONS =================

  /**
   * Admin: Get all reward configurations
   */
  async getAllConfigs() {
    return await prisma.gift_reward_configs.findMany({
      orderBy: { min_order_value: 'asc' }
    });
  }

  /**
   * Admin: Create new reward configuration
   */
  async createConfig(adminUserId, data) {
    const {
      title,
      description,
      category,
      image_url,
      min_order_value,
      reward_value,
      tier_name,
      tier_level,
      total_quantity,
      valid_from,
      valid_until,
      is_active,
      redemption_instructions,
      terms_conditions
    } = data;

    if (!title || !category || min_order_value === undefined) {
      const err = new Error('Title, category, and minimum order value are required');
      err.statusCode = 400;
      throw err;
    }

    const qty = total_quantity ? Number(total_quantity) : 1000;

    const created = await prisma.gift_reward_configs.create({
      data: {
        title: title.trim(),
        description: description?.trim(),
        category,
        image_url: image_url?.trim(),
        min_order_value: Number(min_order_value),
        reward_value: reward_value ? Number(reward_value) : 0,
        tier_name: tier_name?.trim() || `${title} Tier`,
        tier_level: tier_level ? Number(tier_level) : 1,
        total_quantity: qty,
        available_quantity: qty,
        claimed_count: 0,
        valid_from: valid_from ? new Date(valid_from) : new Date(),
        valid_until: valid_until ? new Date(valid_until) : null,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        redemption_instructions: redemption_instructions?.trim(),
        terms_conditions: terms_conditions?.trim()
      }
    });

    await prisma.gift_reward_audit_logs.create({
      data: {
        action: 'CONFIG_CREATED',
        reward_config_id: created.id,
        performed_by_id: adminUserId,
        performed_by_role: 'ADMIN',
        notes: `Created gift reward tier "${created.title}" (Min Order: ₹${Number(created.min_order_value)})`
      }
    }).catch(() => null);

    return created;
  }

  /**
   * Admin: Update existing reward configuration
   */

  /**
   * Admin: Delete a reward configuration tier
   */
  async deleteConfig(adminUserId, configId) {
    const existing = await prisma.gift_reward_configs.findUnique({
      where: { id: configId }
    });

    if (!existing) {
      const err = new Error('Reward config not found');
      err.statusCode = 404;
      throw err;
    }

    // Cascade delete any customer gift rewards under this tier
    await prisma.customer_gift_rewards.deleteMany({
      where: { reward_config_id: configId }
    });

    await prisma.gift_reward_configs.delete({
      where: { id: configId }
    });

    await prisma.gift_reward_audit_logs.create({
      data: {
        action: 'CONFIG_DELETED',
        performed_by_id: adminUserId,
        performed_by_role: 'ADMIN',
        notes: `Deleted gift reward tier "${existing.title}" (Min Order: ₹${Number(existing.min_order_value)})`
      }
    }).catch(() => null);

    return { success: true, message: 'Reward tier deleted successfully' };
  }

  async updateConfig(adminUserId, configId, data) {
    const existing = await prisma.gift_reward_configs.findUnique({
      where: { id: configId }
    });

    if (!existing) {
      const err = new Error('Reward config not found');
      err.statusCode = 404;
      throw err;
    }

    const updatePayload = {};
    if (data.title !== undefined) updatePayload.title = data.title.trim();
    if (data.description !== undefined) updatePayload.description = data.description?.trim();
    if (data.category !== undefined) updatePayload.category = data.category;
    if (data.image_url !== undefined) updatePayload.image_url = data.image_url?.trim();
    if (data.min_order_value !== undefined) updatePayload.min_order_value = Number(data.min_order_value);
    if (data.reward_value !== undefined) updatePayload.reward_value = Number(data.reward_value);
    if (data.tier_name !== undefined) updatePayload.tier_name = data.tier_name?.trim();
    if (data.tier_level !== undefined) updatePayload.tier_level = Number(data.tier_level);
    if (data.total_quantity !== undefined) {
      const newTotal = Number(data.total_quantity);
      const diff = newTotal - existing.total_quantity;
      updatePayload.total_quantity = newTotal;
      updatePayload.available_quantity = Math.max(0, existing.available_quantity + diff);
    }
    if (data.valid_from !== undefined) updatePayload.valid_from = data.valid_from ? new Date(data.valid_from) : null;
    if (data.valid_until !== undefined) updatePayload.valid_until = data.valid_until ? new Date(data.valid_until) : null;
    if (data.is_active !== undefined) updatePayload.is_active = Boolean(data.is_active);
    if (data.redemption_instructions !== undefined) updatePayload.redemption_instructions = data.redemption_instructions?.trim();
    if (data.terms_conditions !== undefined) updatePayload.terms_conditions = data.terms_conditions?.trim();

    const updated = await prisma.gift_reward_configs.update({
      where: { id: configId },
      data: updatePayload
    });

    await prisma.gift_reward_audit_logs.create({
      data: {
        action: 'CONFIG_UPDATED',
        reward_config_id: configId,
        performed_by_id: adminUserId,
        performed_by_role: 'ADMIN',
        notes: `Updated gift reward tier "${updated.title}"`
      }
    }).catch(() => null);

    return updated;
  }

  /**
   * Admin: Get Issued Customer Rewards with filters and search
   */
  async getAdminCustomerRewards({ status, search, page = 1, limit = 50 }) {
    const where = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { voucher_code: { contains: term, mode: 'insensitive' } },
        { reward_title: { contains: term, mode: 'insensitive' } },
        { customer: { name: { contains: term, mode: 'insensitive' } } },
        { customer: { email: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term, mode: 'insensitive' } } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, rewards, stats] = await Promise.all([
      prisma.customer_gift_rewards.count({ where }),
      prisma.customer_gift_rewards.findMany({
        where,
        skip,
        take,
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          },
          order: {
            select: { id: true, order_number: true, subtotal: true, total_amount: true, created_at: true }
          },
          reward_config: {
            select: { id: true, tier_name: true, min_order_value: true }
          }
        },
        orderBy: { created_at: 'desc' }
      }),
      prisma.customer_gift_rewards.groupBy({
        by: ['status'],
        _count: true
      })
    ]);

    const statSummary = {
      TOTAL: 0,
      AVAILABLE: 0,
      REDEEMED: 0,
      EXPIRED: 0,
      CANCELLED: 0,
      REVOKED: 0
    };

    stats.forEach(s => {
      statSummary[s.status] = s._count;
      statSummary.TOTAL += s._count;
    });

    return {
      rewards,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take)
      },
      stats: statSummary
    };
  }

  /**
   * Admin: Manually assign a reward to a customer
   */
  async manuallyAssignReward(adminUserId, { customerId, configId, reason = 'Admin Courtesy Reward' }) {
    const customer = await prisma.users.findUnique({
      where: { id: customerId }
    });
    if (!customer) {
      const err = new Error('Customer not found');
      err.statusCode = 404;
      throw err;
    }

    const config = await prisma.gift_reward_configs.findUnique({
      where: { id: configId }
    });
    if (!config) {
      const err = new Error('Reward config not found');
      err.statusCode = 404;
      throw err;
    }

    const voucherCode = this.generateVoucherCode(config.category);
    const expiresAt = config.valid_until
      ? new Date(config.valid_until)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const createdReward = await prisma.customer_gift_rewards.create({
      data: {
        reward_config_id: config.id,
        customer_id: customerId,
        voucher_code: voucherCode,
        status: 'AVAILABLE',
        reward_title: config.title,
        reward_category: config.category,
        reward_value: config.reward_value || 0,
        image_url: config.image_url,
        min_order_value: config.min_order_value,
        redemption_instructions: config.redemption_instructions,
        qr_code_data: JSON.stringify({ code: voucherCode, category: config.category }),
        issued_at: new Date(),
        expires_at: expiresAt
      }
    });

    // Record audit log
    await prisma.gift_reward_audit_logs.create({
      data: {
        action: 'MANUAL_ASSIGN',
        customer_id: customerId,
        reward_id: createdReward.id,
        reward_config_id: config.id,
        performed_by_id: adminUserId,
        performed_by_role: 'ADMIN',
        notes: `Admin manual assignment: ${reason}`,
        metadata: { voucherCode, reason }
      }
    });

    return createdReward;
  }

  /**
   * Admin: Revoke an issued reward
   */
  async revokeReward(adminUserId, rewardId, reason = 'Admin revoked reward') {
    const reward = await prisma.customer_gift_rewards.findUnique({
      where: { id: rewardId }
    });

    if (!reward) {
      const err = new Error('Reward not found');
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.customer_gift_rewards.update({
      where: { id: rewardId },
      data: {
        status: 'REVOKED',
        cancelled_at: new Date(),
        revocation_reason: reason
      }
    });

    await prisma.gift_reward_audit_logs.create({
      data: {
        action: 'REVOKED',
        customer_id: reward.customer_id,
        order_id: reward.order_id,
        reward_id: reward.id,
        reward_config_id: reward.reward_config_id,
        performed_by_id: adminUserId,
        performed_by_role: 'ADMIN',
        notes: `Reward revoked: ${reason}`,
        metadata: { voucherCode: reward.voucher_code, reason }
      }
    });

    return updated;
  }

  /**
   * Admin: Get Audit Logs
   */
  async getAuditLogs({ page = 1, limit = 50 }) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, logs] = await Promise.all([
      prisma.gift_reward_audit_logs.count(),
      prisma.gift_reward_audit_logs.findMany({
        skip,
        take,
        include: {
          customer: { select: { id: true, name: true, email: true } },
          performed_by: { select: { id: true, name: true, email: true } },
          reward: { select: { id: true, voucher_code: true, reward_title: true } },
          reward_config: { select: { id: true, title: true, min_order_value: true } },
          order: { select: { id: true, order_number: true } }
        },
        orderBy: { created_at: 'desc' }
      })
    ]);

    return {
      logs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take)
      }
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ADMIN MANAGED MOVIE TICKET DISTRIBUTION SYSTEM
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 6. Customer: Claim a Movie Ticket (or general gift) Reward
   * Transitions status to TICKET_PENDING and generates a unique claim ID
   */
  async claimMovieTicketReward(customerId, rewardId, notes = '') {
    const reward = await prisma.customer_gift_rewards.findFirst({
      where: {
        id: rewardId,
        customer_id: customerId
      },
      include: {
        order: true,
        reward_config: true,
        reward_claims: true
      }
    });

    if (!reward) {
      const err = new Error('Reward not found or does not belong to this customer');
      err.statusCode = 404;
      throw err;
    }

    if (reward.status === 'EXPIRED') {
      const err = new Error('This reward has expired and can no longer be claimed');
      err.statusCode = 400;
      throw err;
    }

    if (['CANCELLED', 'REVOKED'].includes(reward.status)) {
      const err = new Error('This reward has been cancelled or revoked');
      err.statusCode = 400;
      throw err;
    }

    // Check if an active claim already exists
    const existingClaim = reward.reward_claims?.find(
      c => ['TICKET_PENDING', 'TICKET_SENT', 'REDEEMED'].includes(c.status)
    );

    if (existingClaim) {
      return {
        alreadyClaimed: true,
        claim: existingClaim,
        message: 'Reward has already been claimed'
      };
    }

    // Generate unique professional claim number, e.g. CLM-MVI-9821-2026
    const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    const yearPart = new Date().getFullYear();
    const claimNumber = `CLM-${reward.reward_category === 'MOVIE_TICKETS' ? 'MVI' : 'GFT'}-${randPart}-${yearPart}`;

    // Determine orderId: check reward.order_id, or find customer's latest paid food order
    let resolvedOrderId = reward.order_id;
    if (!resolvedOrderId) {
      const latestOrder = await prisma.food_orders.findFirst({
        where: { customer_id: customerId, payment_status: { in: ['PAID', 'SUCCESS'] } },
        orderBy: { created_at: 'desc' },
        select: { id: true, order_number: true }
      });
      if (latestOrder) {
        resolvedOrderId = latestOrder.id;
        // Also persist to customer_gift_rewards
        await prisma.customer_gift_rewards.update({
          where: { id: reward.id },
          data: { order_id: latestOrder.id }
        }).catch(() => null);
      }
    }

    // Create the reward claim record
    const claim = await prisma.reward_claims.create({
      data: {
        claim_number: claimNumber,
        customer_id: customerId,
        order_id: resolvedOrderId,
        reward_id: reward.id,
        reward_type: reward.reward_category,
        reward_title: reward.reward_title,
        status: 'TICKET_PENDING',
        customer_notes: notes,
        claimed_at: new Date(),
        metadata: {
          voucherCode: reward.voucher_code,
          orderNumber: reward.order?.order_number
        }
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        order: { select: { id: true, order_number: true, total_amount: true, subtotal: true } },
        reward: true
      }
    });

    // Update parent customer_gift_reward status to CLAIMED
    await prisma.customer_gift_rewards.update({
      where: { id: reward.id },
      data: { status: 'CLAIMED' }
    });

    // Create In-App Notification for Customer confirming claim submission
    await prisma.notifications.create({
      data: {
        user_id: customerId,
        order_id: reward.order_id,
        category: 'REWARD',
        priority: 'MEDIUM',
        title: '🎟️ Movie Ticket Claim Submitted!',
        message: `Your claim #${claimNumber} for "${reward.reward_title}" is received! Our team is processing your seats and we'll notify you once your ticket is ready.`,
        notification_type: 'GIFT_TICKET_PENDING',
        channel: 'IN_APP',
        status: 'SENT',
        sent_at: new Date(),
        metadata: { claimId: claim.id, claimNumber }
      }
    }).catch(() => null);

    // Record audit log
    await prisma.gift_reward_audit_logs.create({
      data: {
        action: 'TICKET_CLAIMED',
        customer_id: customerId,
        order_id: reward.order_id,
        reward_id: reward.id,
        reward_config_id: reward.reward_config_id,
        performed_by_id: customerId,
        performed_by_role: 'CUSTOMER',
        notes: `Customer claimed movie ticket reward. Claim #${claimNumber} created (Status: TICKET_PENDING)`,
        metadata: { claimNumber, claimId: claim.id }
      }
    }).catch(() => null);

    return {
      success: true,
      claim,
      message: 'Movie ticket claimed successfully! Your ticket is being processed.'
    };
  }

  /**
   * 7. Admin: Get Claims with Filtering (ALL, PENDING, SENT, EXPIRED, CANCELLED)
   */
  async getAdminTicketClaims({ status, search, page = 1, limit = 50 }) {
    const where = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { claim_number: { contains: search, mode: 'insensitive' } },
        { reward_title: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
        { order: { order_number: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [total, rawClaims, statusCounts] = await Promise.all([
      prisma.reward_claims.count({ where }),
      prisma.reward_claims.findMany({
        where,
        skip,
        take,
        include: {
          customer: {
            select: { id: true, name: true, phone: true, email: true, created_at: true }
          },
          order: {
            select: {
              id: true,
              order_number: true,
              total_amount: true,
              subtotal: true,
              created_at: true,
              cafes: { select: { id: true, name: true } }
            }
          },
          reward: {
            select: {
              id: true,
              order_id: true,
              voucher_code: true,
              reward_category: true,
              reward_value: true,
              expires_at: true,
              image_url: true,
              order: {
                select: {
                  id: true,
                  order_number: true,
                  total_amount: true,
                  subtotal: true,
                  created_at: true,
                  cafes: { select: { id: true, name: true } }
                }
              }
            }
          },
          reward_tickets: {
            orderBy: { created_at: 'desc' }
          },
          distribution_history: {
            include: { admin: { select: { id: true, name: true } } },
            orderBy: { created_at: 'desc' },
            take: 3
          }
        },
        orderBy: { created_at: 'desc' }
      }),
      // Status breakdown
      prisma.reward_claims.groupBy({
        by: ['status'],
        _count: { id: true }
      })
    ]);

    // Reconcile and backfill order details if reward_claims.order_id was null or linked via customer_gift_rewards
    const claims = await Promise.all(
      rawClaims.map(async (claim) => {
        let order = claim.order || claim.reward?.order || null;

        // If still no order, but claim.order_id or claim.reward?.order_id exists
        const targetOrderId = claim.order_id || claim.reward?.order_id;
        if (!order && targetOrderId) {
          order = await prisma.food_orders.findUnique({
            where: { id: targetOrderId },
            select: {
              id: true,
              order_number: true,
              total_amount: true,
              subtotal: true,
              created_at: true,
              cafes: { select: { id: true, name: true } }
            }
          }).catch(() => null);
        }

        // If still no order, attempt fallback by customer's latest verified food order
        if (!order && claim.customer_id) {
          order = await prisma.food_orders.findFirst({
            where: {
              customer_id: claim.customer_id,
              payment_status: { in: ['PAID', 'SUCCESS'] }
            },
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              order_number: true,
              total_amount: true,
              subtotal: true,
              created_at: true,
              cafes: { select: { id: true, name: true } }
            }
          }).catch(() => null);
        }

        return {
          ...claim,
          order: order || claim.order
        };
      })
    );

    const counts = {
      ALL: 0,
      TICKET_PENDING: 0,
      TICKET_SENT: 0,
      REDEEMED: 0,
      EXPIRED: 0,
      CANCELLED: 0
    };

    statusCounts.forEach(s => {
      if (counts[s.status] !== undefined) {
        counts[s.status] = s._count.id;
      }
      counts.ALL += s._count.id;
    });

    return {
      claims,
      counts,
      pagination: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take)
      }
    };
  }

  /**
   * 8. Admin: Get Single Claim Details
   */
  async getAdminClaimDetails(claimId) {
    const claim = await prisma.reward_claims.findUnique({
      where: { id: claimId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        order: {
          select: {
            id: true,
            order_number: true,
            total_amount: true,
            subtotal: true,
            created_at: true,
            cafes: { select: { id: true, name: true } }
          }
        },
        reward: true,
        reward_tickets: {
          orderBy: { created_at: 'desc' }
        },
        distribution_history: {
          include: { admin: { select: { id: true, name: true, email: true } } },
          orderBy: { created_at: 'desc' }
        }
      }
    });

    if (!claim) {
      const err = new Error('Claim not found');
      err.statusCode = 404;
      throw err;
    }

    return claim;
  }

  /**
   * 9. Admin: Send Actual Movie Ticket to Customer
   * Uploads/links PDF, Image, Movie, Theatre, Show Time, Seats & notifies customer
   */
  async sendMovieTicketToCustomer(adminUserId, claimId, ticketData) {
    const claim = await prisma.reward_claims.findUnique({
      where: { id: claimId },
      include: {
        customer: true,
        order: true,
        reward: true
      }
    });

    if (!claim) {
      const err = new Error('Reward claim not found');
      err.statusCode = 404;
      throw err;
    }

    if (claim.status === 'CANCELLED') {
      const err = new Error('Cannot issue ticket for a cancelled claim');
      err.statusCode = 400;
      throw err;
    }

    const {
      movie_name,
      theatre_name,
      show_datetime,
      show_time_str,
      seat_details,
      booking_reference,
      instructions,
      pdf_url,
      image_url,
      additional_files = [],
      notify_email = true,
      notify_whatsapp = false,
      notes = ''
    } = ticketData;

    if (!movie_name || !theatre_name || !seat_details) {
      const err = new Error('Movie name, theatre name, and seat details are required');
      err.statusCode = 400;
      throw err;
    }

    // Generate unique Ticket ID
    const ticketRand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const ticketCode = `TCK-${ticketRand}-${Date.now().toString().slice(-4)}`;

    // 1. Create or Update Reward Ticket
    const ticket = await prisma.reward_tickets.create({
      data: {
        claim_id: claim.id,
        ticket_code: ticketCode,
        movie_name,
        theatre_name,
        show_datetime: show_datetime ? new Date(show_datetime) : null,
        show_time_str: show_time_str || null,
        seat_details,
        booking_reference: booking_reference || null,
        instructions: instructions || 'Show this ticket PDF or barcode at the theatre box office or entry gate.',
        pdf_url: pdf_url || null,
        image_url: image_url || null,
        additional_files: additional_files || [],
        status: 'ACTIVE'
      }
    });

    // 2. Update Claim Status to TICKET_SENT
    const isResend = claim.status === 'TICKET_SENT';
    const updatedClaim = await prisma.reward_claims.update({
      where: { id: claim.id },
      data: {
        status: 'TICKET_SENT',
        ticket_sent_at: new Date()
      }
    });

    // 3. Update parent customer_gift_reward status to TICKET_SENT
    if (claim.reward_id) {
      await prisma.customer_gift_rewards.update({
        where: { id: claim.reward_id },
        data: { status: 'TICKET_SENT' }
      }).catch(() => null);
    }

    // 4. Record Ticket Distribution History
    await prisma.ticket_distribution_history.create({
      data: {
        claim_id: claim.id,
        ticket_id: ticket.id,
        admin_id: adminUserId,
        action: isResend ? 'TICKET_RESENT' : 'TICKET_SENT',
        channel_in_app: true,
        channel_email: Boolean(notify_email && claim.customer?.email),
        channel_whatsapp: Boolean(notify_whatsapp && claim.customer?.phone),
        notes: notes || `Ticket ${ticketCode} sent for "${movie_name}" at ${theatre_name}`,
        metadata: {
          ticketCode,
          movie_name,
          theatre_name,
          seat_details,
          pdf_url,
          image_url,
          booking_reference
        }
      }
    });

    // 5. In-App Customer Notification (as explicitly requested)
    const notifMessage = `Congratulations! Your Grab2Go movie ticket for "${movie_name}" at ${theatre_name} (Seats: ${seat_details}) is ready. Open My Rewards to view and download your ticket.`;

    await prisma.notifications.create({
      data: {
        user_id: claim.customer_id,
        order_id: claim.order_id,
        category: 'REWARD',
        priority: 'HIGH',
        title: '🎬 Your Movie Ticket is Ready!',
        message: notifMessage,
        notification_type: 'MOVIE_TICKET_SENT',
        channel: 'IN_APP',
        status: 'SENT',
        sent_at: new Date(),
        metadata: {
          claimId: claim.id,
          ticketId: ticket.id,
          ticketCode,
          movie_name,
          theatre_name,
          pdf_url,
          image_url
        }
      }
    }).catch(() => null);

    // 6. Optional Email Notification record
    if (notify_email && claim.customer?.email) {
      await prisma.email_notifications.create({
        data: {
          recipient_email: claim.customer.email,
          template_type: 'MOVIE_TICKET_DELIVERED',
          status: 'PENDING',
          subject: `🎟️ Your Grab2Go Movie Ticket: ${movie_name}`,
          payload: {
            customerName: claim.customer.name,
            movieName: movie_name,
            theatreName: theatre_name,
            showTime: show_time_str,
            seats: seat_details,
            bookingRef: booking_reference,
            pdfUrl: pdf_url,
            imageUrl: image_url
          }
        }
      }).catch(() => null);
    }

    // 7. Audit Log
    await prisma.gift_reward_audit_logs.create({
      data: {
        action: isResend ? 'TICKET_RESENT' : 'TICKET_DISTRIBUTED',
        customer_id: claim.customer_id,
        order_id: claim.order_id,
        reward_id: claim.reward_id,
        performed_by_id: adminUserId,
        performed_by_role: 'ADMIN',
        notes: `Admin sent movie ticket ${ticketCode} (${movie_name} @ ${theatre_name}) to ${claim.customer?.name || 'Customer'}`,
        metadata: {
          claimId: claim.id,
          ticketId: ticket.id,
          ticketCode,
          movie_name
        }
      }
    }).catch(() => null);

    return {
      success: true,
      ticket,
      claim: updatedClaim,
      message: 'Movie ticket sent to customer successfully! 🎬🎟️'
    };
  }

  /**
   * 10. Admin: Cancel a Ticket Claim
   */
  async cancelTicketClaim(adminUserId, claimId, reason = 'Cancelled by Admin') {
    const claim = await prisma.reward_claims.findUnique({
      where: { id: claimId },
      include: { reward: true }
    });

    if (!claim) {
      const err = new Error('Claim not found');
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.reward_claims.update({
      where: { id: claimId },
      data: {
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancellation_reason: reason
      }
    });

    if (claim.reward_id) {
      await prisma.customer_gift_rewards.update({
        where: { id: claim.reward_id },
        data: { status: 'CANCELLED' }
      }).catch(() => null);
    }

    await prisma.ticket_distribution_history.create({
      data: {
        claim_id: claim.id,
        admin_id: adminUserId,
        action: 'TICKET_CANCELLED',
        notes: reason,
        metadata: { reason }
      }
    }).catch(() => null);

    return updated;
  }

}

module.exports = new GiftRewardService();
