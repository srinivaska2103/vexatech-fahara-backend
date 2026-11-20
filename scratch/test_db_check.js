const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../src/config/prisma');

async function main() {
  const count = await prisma.gift_reward_configs.count();
  console.log('Connected to DB! gift_reward_configs count:', count);
  const rewards = await prisma.customer_gift_rewards.findMany({ take: 5 });
  console.log('customer_gift_rewards samples:', rewards.length);
  process.exit(0);
}

main().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
