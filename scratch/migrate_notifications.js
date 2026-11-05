require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require(require('path').join(__dirname, '../src/config/prisma'));

async function main() {
  console.log("Migrating notifications table to add new unified fields...");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS cafe_id UUID REFERENCES cafes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES food_orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS category VARCHAR(40) DEFAULT 'BOOKING',
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'MEDIUM',
    ADD COLUMN IF NOT EXISTS metadata JSONB;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_category ON notifications(user_id, category);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_order_id ON notifications(order_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_cafe_id ON notifications(cafe_id);
  `);

  console.log("Successfully migrated notifications table!");
}

main().catch(console.error).finally(() => prisma.$disconnect());

