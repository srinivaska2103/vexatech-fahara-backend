require('dotenv').config({ path: __dirname + '/../.env' });
const prisma = require('../src/config/prisma');

async function main() {
  try {
    console.log('Ensuring loyalty tables in database...');
    
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_loyalty_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credit_balance INT NOT NULL DEFAULT 0,
        lifetime_credits_earned INT NOT NULL DEFAULT 0,
        lifetime_credits_redeemed INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS loyalty_credit_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        loyalty_account_id UUID NOT NULL REFERENCES user_loyalty_accounts(id) ON DELETE CASCADE,
        booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
        type VARCHAR(20) NOT NULL,
        credits INT NOT NULL,
        balance_before INT NOT NULL,
        balance_after INT NOT NULL,
        reason TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
        created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_user_booking_type_loyalty 
      ON loyalty_credit_transactions(user_id, booking_id, type) 
      WHERE booking_id IS NOT NULL;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS loyalty_redemptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        loyalty_account_id UUID NOT NULL REFERENCES user_loyalty_accounts(id) ON DELETE CASCADE,
        booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
        credits_used INT NOT NULL,
        rupee_value DECIMAL(10, 2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
        created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Loyalty tables successfully ensured in PostgreSQL database! 🚀');
  } catch (err) {
    console.error('Error creating loyalty tables:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
