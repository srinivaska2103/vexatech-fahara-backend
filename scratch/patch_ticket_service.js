const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/giftRewardService.js');
let s = fs.readFileSync(filePath, 'utf8');

// 1. Update getCustomerRewards to include reward_claims and tickets
const oldGetRewardsInclude = `      include: {
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
        }
      },`;

const newGetRewardsInclude = `      include: {
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
      },`;

if (s.includes(oldGetRewardsInclude)) {
  s = s.replace(oldGetRewardsInclude, newGetRewardsInclude);
}

// 2. Add movie ticket claiming & distribution methods to GiftRewardService
const newMethods = `
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
    const claimNumber = \`CLM-\${reward.reward_category === 'MOVIE_TICKETS' ? 'MVI' : 'GFT'}-\${randPart}-\${yearPart}\`;

    // Create the reward claim record
    const claim = await prisma.reward_claims.create({
      data: {
        claim_number: claimNumber,
        customer_id: customerId,
        order_id: reward.order_id,
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
        message: \`Your claim #\${claimNumber} for "\${reward.reward_title}" is received! Our team is processing your seats and we'll notify you once your ticket is ready.\`,
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
        notes: \`Customer claimed movie ticket reward. Claim #\${claimNumber} created (Status: TICKET_PENDING)\`,
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

    const [total, claims, statusCounts] = await Promise.all([
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
              voucher_code: true,
              reward_category: true,
              reward_value: true,
              expires_at: true,
              image_url: true
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
    const ticketCode = \`TCK-\${ticketRand}-\${Date.now().toString().slice(-4)}\`;

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
        notes: notes || \`Ticket \${ticketCode} sent for "\${movie_name}" at \${theatre_name}\`,
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
    const notifMessage = \`Congratulations! Your Grab2Go movie ticket for "\${movie_name}" at \${theatre_name} (Seats: \${seat_details}) is ready. Open My Rewards to view and download your ticket.\`;

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
          subject: \`🎟️ Your Grab2Go Movie Ticket: \${movie_name}\`,
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
        notes: \`Admin sent movie ticket \${ticketCode} (\${movie_name} @ \${theatre_name}) to \${claim.customer?.name || 'Customer'}\`,
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
`;

s = s.replace(
  'module.exports = new GiftRewardService();',
  `${newMethods}\n}\n\nmodule.exports = new GiftRewardService();`
);

fs.writeFileSync(filePath, s, 'utf8');
console.log('Successfully injected Movie Ticket Distribution service methods! 🎟️✨');
