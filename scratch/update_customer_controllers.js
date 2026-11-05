const fs = require('fs');

let content = fs.readFileSync('vexatech-fahara-backend/src/controllers/customerController.js', 'utf8');

if (!content.includes('getCustomerFoodOrders')) {
  const insertIdx = content.indexOf('const getCustomerPayments =');
  const code = [
    'const getCustomerFoodOrders = async (req, res, next) => {',
    '  try {',
    '    const orders = await customerService.getCustomerFoodOrders(req.params.id, req.user.id, req.user.roles?.name);',
    '    res.status(200).json({ success: true, data: orders });',
    '  } catch (error) {',
    '    next(error);',
    '  }',
    '};',
    '',
    ''
  ].join('\n');
  content = content.slice(0, insertIdx) + code + content.slice(insertIdx);
  content = content.replace('getCustomerBookings,', 'getCustomerBookings,\n  getCustomerFoodOrders,');
  fs.writeFileSync('vexatech-fahara-backend/src/controllers/customerController.js', content, 'utf8');
  console.log('customerController.js updated');
}

let routes = fs.readFileSync('vexatech-fahara-backend/src/routes/customerRoutes.js', 'utf8');
if (!routes.includes('/owner/:id/orders')) {
  routes = routes.replace(
    "router.get('/owner/:id/bookings',",
    "router.get('/owner/:id/orders', protect, authorizeRoles('CAFE_OWNER', 'WALKING_CAFE_OWNER', 'RESTAURANT_OWNER', 'EVENT_MANAGER', 'ADMIN'), customerController.getCustomerFoodOrders);\nrouter.get('/owner/:id/bookings',"
  );
  fs.writeFileSync('vexatech-fahara-backend/src/routes/customerRoutes.js', routes, 'utf8');
  console.log('customerRoutes.js updated');
}

