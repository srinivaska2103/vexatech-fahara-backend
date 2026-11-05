require('dotenv').config();
const fs = require('fs');
const prisma = require('../src/config/prisma');

async function applyMigration() {
  console.log('DATABASE_URL is set:', !!process.env.DATABASE_URL);
  const sql = fs.readFileSync('prisma/migrations/20261104_create_orders_and_delivery/migration.sql', 'utf8');
  console.log('Applying migration SQL to PostgreSQL...');
  await prisma.$executeRawUnsafe(sql);
  console.log('Migration executed successfully!');
  
  const count = await prisma.food_orders.count();
  console.log('Verified: food_orders table exists, count =', count);
  const employeeCount = await prisma.delivery_employees.count();
  console.log('Verified: delivery_employees table exists, count =', employeeCount);
  const cartCount = await prisma.customer_carts.count();
  console.log('Verified: customer_carts table exists, count =', cartCount);
  const settingsCount = await prisma.cafe_fulfilment_settings.count();
  console.log('Verified: cafe_fulfilment_settings table exists, count =', settingsCount);
}

applyMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
