require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require(require('path').join(__dirname, '../src/config/prisma'));

async function main() {
  console.log("Checking if columns exist in reviews...");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE reviews 
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES food_orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS review_type VARCHAR(30) DEFAULT 'BOOKING',
    ADD COLUMN IF NOT EXISTS food_quality_rating INTEGER,
    ADD COLUMN IF NOT EXISTS packaging_rating INTEGER,
    ADD COLUMN IF NOT EXISTS delivery_rating INTEGER,
    ADD COLUMN IF NOT EXISTS review_title VARCHAR(200);
  `);
  
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_order_id ON reviews(order_id) WHERE order_id IS NOT NULL;
  `);

  console.log("Successfully migrated reviews table columns!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

