const fs = require('fs');

const appPath = 'vexatech-fahara-backend/src/app.js';
let app = fs.readFileSync(appPath, 'utf8');

const routeImports = `
const cartRoutes = require('./routes/cartRoutes');
const customerOrderRoutes = require('./routes/customerOrderRoutes');
const cafeOrderRoutes = require('./routes/cafeOrderRoutes');
const deliveryPortalRoutes = require('./routes/deliveryPortalRoutes');
`;

const routeMounts = `
// Phase 3: Cart, Orders, Fulfilment & Delivery Staff
app.use('/api/customer/cart', cartRoutes);
app.use('/api/v1/customer/cart', cartRoutes);
app.use('/api/customer/orders', customerOrderRoutes);
app.use('/api/v1/customer/orders', customerOrderRoutes);

app.use('/api/cafe', cafeOrderRoutes);
app.use('/api/v1/cafe', cafeOrderRoutes);

app.use('/api/delivery', deliveryPortalRoutes);
app.use('/api/v1/delivery', deliveryPortalRoutes);
`;

if (!app.includes('cartRoutes')) {
  const firstUse = app.indexOf('app.use(');
  app = app.slice(0, firstUse) + routeImports + '\n' + app.slice(firstUse);
  
  const anchor = "app.use('/api/v1/offers', offerRoutes);";
  app = app.replace(anchor, anchor + '\n' + routeMounts);
  
  fs.writeFileSync(appPath, app, 'utf8');
  console.log('Successfully mounted Phase 3 routes in src/app.js!');
} else {
  console.log('Phase 3 routes already present in src/app.js');
}

