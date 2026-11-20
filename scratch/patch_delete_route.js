const fs = require('fs');
const path = require('path');

// 1. In giftRewardController.js
const controllerPath = path.join(__dirname, '../src/controllers/giftRewardController.js');
let c = fs.readFileSync(controllerPath, 'utf8');

const deleteControllerMethod = `
  // DELETE /api/v1/admin/gift-rewards/configs/:id
  async deleteConfig(req, res, next) {
    try {
      const adminUserId = req.user.id;
      const { id } = req.params;
      const result = await giftRewardService.deleteConfig(adminUserId, id);
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
`;

if (!c.includes('deleteConfig(req, res, next)')) {
  c = c.replace('  // GET /api/v1/admin/gift-rewards/issued', deleteControllerMethod + '\n  // GET /api/v1/admin/gift-rewards/issued');
  fs.writeFileSync(controllerPath, c, 'utf8');
  console.log('deleteConfig added to giftRewardController');
}

// 2. In giftRewardRoutes.js
const routesPath = path.join(__dirname, '../src/routes/giftRewardRoutes.js');
let r = fs.readFileSync(routesPath, 'utf8');

if (!r.includes('router.delete(\'/admin/configs/:id\'')) {
  r = r.replace(
    'router.put(\'/admin/configs/:id\', giftRewardController.updateConfig);',
    'router.put(\'/admin/configs/:id\', giftRewardController.updateConfig);\nrouter.delete(\'/admin/configs/:id\', giftRewardController.deleteConfig);'
  );
  fs.writeFileSync(routesPath, r, 'utf8');
  console.log('DELETE route added to giftRewardRoutes');
}
