require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const prisma = require('../src/config/prisma');

async function migrate() {
  console.log('Starting migration for menu_offers and food_orders...');
  try {
    // 1. Add BOGO and Advanced Offers columns to menu_offers
    const sqlOffers = `
      ALTER TABLE "menu_offers"
        ADD COLUMN IF NOT EXISTS "offer_category" VARCHAR(50) DEFAULT 'PERCENTAGE',
        ADD COLUMN IF NOT EXISTS "buy_item_id" UUID,
        ADD COLUMN IF NOT EXISTS "buy_category_id" UUID,
        ADD COLUMN IF NOT EXISTS "buy_quantity" INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "reward_item_id" UUID,
        ADD COLUMN IF NOT EXISTS "reward_category_id" UUID,
        ADD COLUMN IF NOT EXISTS "reward_quantity" INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "reward_discount_type" VARCHAR(30) DEFAULT 'FREE',
        ADD COLUMN IF NOT EXISTS "reward_discount_value" NUMERIC(10, 2) DEFAULT 100.00,
        ADD COLUMN IF NOT EXISTS "max_reward_quantity" INTEGER,
        ADD COLUMN IF NOT EXISTS "min_order_value" NUMERIC(10, 2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS "max_redemptions" INTEGER,
        ADD COLUMN IF NOT EXISTS "redemption_count" INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "combo_price" NUMERIC(10, 2),
        ADD COLUMN IF NOT EXISTS "terms_and_conditions" TEXT;
    `;
    await prisma.$executeRawUnsafe(sqlOffers);
    console.log('✓ menu_offers columns added successfully.');

    // 2. Add foreign keys / indexes if not exist
    const sqlFK = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_menu_offers_buy_item'
        ) THEN
          ALTER TABLE "menu_offers"
            ADD CONSTRAINT "fk_menu_offers_buy_item"
            FOREIGN KEY ("buy_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_menu_offers_reward_item'
        ) THEN
          ALTER TABLE "menu_offers"
            ADD CONSTRAINT "fk_menu_offers_reward_item"
            FOREIGN KEY ("reward_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `;
    await prisma.$executeRawUnsafe(sqlFK);
    console.log('✓ foreign key constraints checked/added.');

    // 3. Add applied_offers JSONB to food_orders if not present
    const sqlOrders = `
      ALTER TABLE "food_orders"
        ADD COLUMN IF NOT EXISTS "applied_offers" JSONB DEFAULT '[]'::jsonb;
    `;
    await prisma.$executeRawUnsafe(sqlOrders);
    console.log('✓ food_orders.applied_offers added.');

    console.log('All DB migrations completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();

