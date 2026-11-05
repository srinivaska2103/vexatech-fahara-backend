const fs = require('fs');

const appPath = 'vexatech-fahara-backend/src/app.js';
let content = fs.readFileSync(appPath, 'utf8');

if (!content.includes('/api/v1/admin/food-orders')) {
  const adminFoodOrdersRoute = `
// Phase 3 Admin Food Orders Oversight
const adminOrderController = require('./controllers/orderController');
const { protect: adminProtect } = require('./middlewares/authMiddleware');
const { authorizeRoles: adminAuthorizeRoles } = require('./middlewares/roleMiddleware');

const adminOrdersRouter = require('express').Router();
adminOrdersRouter.use(adminProtect);
adminOrdersRouter.use(adminAuthorizeRoles('ADMIN'));
adminOrdersRouter.get('/', adminOrderController.getCafeOrders);

app.use('/api/admin/food-orders', adminOrdersRouter);
app.use('/api/v1/admin/food-orders', adminOrdersRouter);
`;

  const anchor = "app.use('/api/v1/delivery', deliveryPortalRoutes);";
  content = content.replace(anchor, anchor + '\n' + adminFoodOrdersRoute);
  fs.writeFileSync(appPath, content, 'utf8');
  console.log('Added admin food orders oversight route to backend app.js!');
} else {
  console.log('Admin food orders route already present in app.js');
}

