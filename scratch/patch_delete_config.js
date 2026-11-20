const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/giftRewardService.js');
let s = fs.readFileSync(filePath, 'utf8');

const deleteMethod = `
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
        notes: \`Deleted gift reward tier "\${existing.title}" (Min Order: ₹\${Number(existing.min_order_value)})\`
      }
    }).catch(() => null);

    return { success: true, message: 'Reward tier deleted successfully' };
  }
`;

if (!s.includes('deleteConfig(')) {
  s = s.replace('  async updateConfig(adminUserId, configId, data) {', deleteMethod + '\n  async updateConfig(adminUserId, configId, data) {');
  fs.writeFileSync(filePath, s, 'utf8');
  console.log('deleteConfig added to giftRewardService');
} else {
  console.log('Already has deleteConfig');
}
