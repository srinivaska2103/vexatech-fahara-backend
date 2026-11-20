const path = require('path');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });
const prisma = require('../src/config/prisma');

async function runMigration() {
  console.log('[Migration] Starting Gift Reward System DB Migration...');

  // 1. Create gift_reward_configs table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS gift_reward_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(150) NOT NULL,
      description TEXT,
      category VARCHAR(50) NOT NULL, -- MOVIE_TICKETS, FREE_FOOD, DISCOUNT_VOUCHER, FREE_DELIVERY, SHOPPING_CARD, SURPRISE_GIFT
      image_url VARCHAR(500),
      min_order_value DECIMAL(10,2) NOT NULL DEFAULT 1500.00,
      reward_value DECIMAL(10,2) DEFAULT 0.00,
      tier_name VARCHAR(100) DEFAULT 'Silver Tier',
      tier_level INTEGER DEFAULT 1,
      total_quantity INTEGER DEFAULT 1000,
      available_quantity INTEGER DEFAULT 1000,
      claimed_count INTEGER DEFAULT 0,
      valid_from TIMESTAMP(6) WITH TIME ZONE DEFAULT NOW(),
      valid_until TIMESTAMP(6) WITH TIME ZONE,
      is_active BOOLEAN DEFAULT TRUE,
      redemption_instructions TEXT,
      terms_conditions TEXT,
      created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT NOW()
    );
  `);
  console.log('[Migration] Table "gift_reward_configs" ready.');

  // 2. Create customer_gift_rewards table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS customer_gift_rewards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reward_config_id UUID NOT NULL REFERENCES gift_reward_configs(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id UUID REFERENCES food_orders(id) ON DELETE SET NULL,
      voucher_code VARCHAR(80) UNIQUE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, REDEEMED, EXPIRED, CANCELLED, REVOKED
      reward_title VARCHAR(150) NOT NULL,
      reward_category VARCHAR(50) NOT NULL,
      reward_value DECIMAL(10,2) DEFAULT 0.00,
      image_url VARCHAR(500),
      min_order_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      redemption_instructions TEXT,
      qr_code_data TEXT,
      issued_at TIMESTAMP(6) WITH TIME ZONE DEFAULT NOW(),
      expires_at TIMESTAMP(6) WITH TIME ZONE,
      redeemed_at TIMESTAMP(6) WITH TIME ZONE,
      cancelled_at TIMESTAMP(6) WITH TIME ZONE,
      revocation_reason TEXT,
      created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT NOW()
    );
  `);
  console.log('[Migration] Table "customer_gift_rewards" ready.');

  // 3. Create gift_reward_audit_logs table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS gift_reward_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      action VARCHAR(50) NOT NULL, -- ISSUED, REDEEMED, REVOKED, CANCELLED, MANUAL_ASSIGN, EXPIRED
      customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
      order_id UUID REFERENCES food_orders(id) ON DELETE SET NULL,
      reward_id UUID REFERENCES customer_gift_rewards(id) ON DELETE CASCADE,
      reward_config_id UUID REFERENCES gift_reward_configs(id) ON DELETE SET NULL,
      performed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
      performed_by_role VARCHAR(50) DEFAULT 'SYSTEM',
      notes TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT NOW()
    );
  `);
  console.log('[Migration] Table "gift_reward_audit_logs" ready.');

  // Indexes for high performance
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_gift_reward_cfg_active_min ON gift_reward_configs (is_active, min_order_value);
    CREATE INDEX IF NOT EXISTS idx_customer_gift_rewards_cust ON customer_gift_rewards (customer_id, status);
    CREATE INDEX IF NOT EXISTS idx_customer_gift_rewards_order ON customer_gift_rewards (order_id);
    CREATE INDEX IF NOT EXISTS idx_customer_gift_rewards_voucher ON customer_gift_rewards (voucher_code);
  `);
  console.log('[Migration] Indexes created.');

  // 4. Seed initial default rewards if none exist
  const count = await prisma.$queryRawUnsafe(`SELECT count(*)::int as count FROM gift_reward_configs`);
  if (count[0]?.count === 0) {
    console.log('[Migration] Seeding initial reward tiers...');
    await prisma.$executeRawUnsafe(`
      INSERT INTO gift_reward_configs (
        title, description, category, image_url, min_order_value, reward_value, tier_name, tier_level,
        total_quantity, available_quantity, redemption_instructions, terms_conditions
      ) VALUES
      (
        'Free Movie Ticket Voucher',
        'Enjoy a blockbuster movie on us! Valid at PVR, INOX, Cinepolis and partner screens nationwide.',
        'MOVIE_TICKETS',
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=600&q=80',
        1500.00,
        350.00,
        'Cinema Tier (₹1,500+)',
        1,
        500,
        500,
        'Show this voucher code or QR code at participating theater box offices or apply online on partner ticket portals.',
        'Valid for 30 days from issuance. One ticket per voucher. Non-transferable and non-refundable.'
      ),
      (
        '₹500 Gourmet Food Voucher',
        'Savor your next meal with a flat ₹500 discount across all partner Grab2Go restaurants.',
        'FREE_FOOD',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
        2000.00,
        500.00,
        'Gourmet Tier (₹2,000+)',
        2,
        300,
        300,
        'Redeemable on your next order on Grab2Go Food or Dine-in at partner restaurants.',
        'Valid for 45 days. Minimum next order value of ₹500.'
      ),
      (
        'Premium Luxury Gift Hamper',
        'Exclusive curated celebratory gift hamper delivered directly to your doorstep!',
        'SURPRISE_GIFT',
        'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=600&q=80',
        3000.00,
        1000.00,
        'Premium VIP Tier (₹3,000+)',
        3,
        150,
        150,
        'Our concierge team will contact you or dispatch your premium hamper within 3-5 business days.',
        'Valid for orders ₹3,000 and above. Subject to stock availability.'
      );
    `);
    console.log('[Migration] Initial tiers seeded successfully.');
  } else {
    console.log('[Migration] Existing reward configurations found. Skipping seed.');
  }

  console.log('[Migration] All Gift Reward tables and seeds finished successfully!');
}

runMigration()
  .catch((err) => {
    console.error('[Migration ERROR]:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
