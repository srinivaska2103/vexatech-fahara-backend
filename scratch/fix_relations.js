const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
let s = fs.readFileSync(schemaPath, 'utf8');

// 1. In gift_reward_configs: remove reward_claims[] (configs doesn't have it)
s = s.replace('  reward_claims           reward_claims[]\n', '');

// 2. In food_orders: add reward_claims reward_claims[]
s = s.replace(
  '  gift_reward_audit_logs    gift_reward_audit_logs[]',
  '  gift_reward_audit_logs    gift_reward_audit_logs[]\n  reward_claims             reward_claims[]'
);

// 3. In customer_gift_rewards: add reward_claims reward_claims[]
s = s.replace(
  '  gift_reward_audit_logs  gift_reward_audit_logs[]\n\n  @@index([customer_id, status]',
  '  gift_reward_audit_logs  gift_reward_audit_logs[]\n  reward_claims           reward_claims[]\n\n  @@index([customer_id, status]'
);

fs.writeFileSync(schemaPath, s, 'utf8');
console.log('Fixed relations in schema.prisma! 🔧');
