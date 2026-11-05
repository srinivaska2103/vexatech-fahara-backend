const express = require('express');
const cors = require('cors');
const setupSwagger = require('./config/swagger');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const cafeRoutes = require('./routes/cafeRoutes');
const menuRoutes = require('./routes/menuRoutes');
const offerRoutes = require('./routes/offerRoutes');
const offerController = require('./controllers/offerController');
const menuController = require('./controllers/menuController');
const eventProfileRoutes = require('./routes/eventProfileRoutes');
const eventServiceRoutes = require('./routes/eventServiceRoutes');
const eventPackageRoutes = require('./routes/eventPackageRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const customerRoutes = require('./routes/customerRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const auditRoutes = require('./routes/auditRoutes');
const financeRoutes = require('./routes/financeRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const tableRoutes = require('./routes/tableRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const eventManagerAvailabilityRoutes = require('./routes/eventManagerAvailabilityRoutes');
const errorHandler = require('./middlewares/errorHandler');
const requestLogger = require('./middlewares/requestLogger');
const app = express();

// Middlewares

const cartRoutes = require('./routes/cartRoutes');
const customerOrderRoutes = require('./routes/customerOrderRoutes');
const cafeOrderRoutes = require('./routes/cafeOrderRoutes');
const deliveryPortalRoutes = require('./routes/deliveryPortalRoutes');

app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));
app.use((req, res, next) => {
  res.setHeader('bypass-tunnel-reminder', 'true');
  next();
});
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    try {
      if (buf && buf.length) {
        req.rawBody = buf.toString();
      }
    } catch (e) {}
  }
}));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, message: 'Invalid JSON payload format' });
  }
  next(err);
});
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(requestLogger);
app.use(express.static('public'));

// Swagger Documentation
setupSwagger(app);

const webhookController = require('./controllers/webhookController');
app.post('/api/webhooks/razorpay', webhookController.handleRazorpayWebhook);
app.post('/api/webhooks/cashfree', webhookController.handleWebhook);
// Redirect browser hits (accepts HTML) on frontend paths to their respective Next.js portals
app.use((req, res, next) => {
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
  if (acceptsHtml && req.method === 'GET') {
    if (req.path.startsWith('/customer/cafe') || req.path === '/customer') {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}${req.originalUrl}`);
    }
    if (req.path.startsWith('/owner')) {
      const cafeFrontendUrl = process.env.CAFE_FRONTEND_URL || 'http://localhost:3002';
      return res.redirect(`${cafeFrontendUrl}${req.originalUrl}`);
    }
    if (req.path.startsWith('/admin')) {
      const adminFrontendUrl = process.env.ADMIN_FRONTEND_URL || 'http://localhost:3003';
      return res.redirect(`${adminFrontendUrl}${req.originalUrl}`);
    }
    if (req.path.startsWith('/event')) {
      const emFrontendUrl = process.env.EM_FRONTEND_URL || 'http://localhost:3004';
      return res.redirect(`${emFrontendUrl}${req.originalUrl}`);
    }
  }
  next();
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/cafes/:cafeId/tables', tableRoutes);
app.use('/cafes/:cafeId/tables', tableRoutes);
const cafeController = require('./controllers/cafeController');
app.get('/api/v1/categories', cafeController.getCategories);
// Menu Management Routes
app.use('/api/cafe/menu', menuRoutes);
app.use('/api/v1/cafe/menu', menuRoutes);
app.use('/api/v1/menu', menuRoutes);

// Discounts & Special Offers Routes
app.use('/api/cafe/offers', offerRoutes);
app.use('/api/v1/cafe/offers', offerRoutes);
app.use('/api/v1/offers', offerRoutes);

// Phase 3: Cart, Orders, Fulfilment & Delivery Staff
app.use('/api/customer/cart', cartRoutes);
app.use('/api/v1/customer/cart', cartRoutes);
app.use('/api/customer/orders', customerOrderRoutes);
app.use('/api/v1/customer/orders', customerOrderRoutes);

app.use('/api/cafe', cafeOrderRoutes);
app.use('/api/v1/cafe', cafeOrderRoutes);
app.get('/api/v1/public/cafes/:cafeId/ordering-availability', require('./controllers/fulfilmentController').getPublicCafeAvailability);
app.get('/api/public/cafes/:cafeId/ordering-availability', require('./controllers/fulfilmentController').getPublicCafeAvailability);

app.use('/api/delivery', deliveryPortalRoutes);
app.use('/api/v1/delivery', deliveryPortalRoutes);

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

// Comprehensive Admin Food Management API
const adminFoodRoutes = require('./routes/adminFoodRoutes');
app.use('/api/admin/food', adminFoodRoutes);
app.use('/api/v1/admin/food', adminFoodRoutes);



// Public Customer Offers API
app.get('/api/public/offers', offerController.getPublicOffers);
app.get('/api/v1/public/offers', offerController.getPublicOffers);
app.get('/api/public/cafes/:cafeId/offers', offerController.getPublicCafeOffers);
app.get('/api/v1/public/cafes/:cafeId/offers', offerController.getPublicCafeOffers);

// Public Customer Menu API
app.get('/api/public/cafes/:cafeId/menu', menuController.getPublicMenu);
app.get('/api/v1/public/cafes/:cafeId/menu', menuController.getPublicMenu);
app.get('/api/v1/cafes/:cafeId/menu', menuController.getPublicMenu);
app.get('/api/public/food/categories', menuController.getPublicMenuCategories);
app.get('/api/v1/public/food/categories', menuController.getPublicMenuCategories);
app.get('/api/v1/food/categories', menuController.getPublicMenuCategories);

app.use('/api/v1/cafes', cafeRoutes);
app.use('/api/v1/owner/cafes', cafeRoutes);
app.use('/cafes', cafeRoutes);
app.use('/customer/cafe', cafeRoutes);
app.use('/customer/cafes', cafeRoutes);
app.use('/api/v1/event-profiles', eventProfileRoutes);
app.use('/api/v1/event-services', eventServiceRoutes);
app.use('/api/v1/event-packages', eventPackageRoutes);
app.use('/event-packages', eventPackageRoutes);
app.use('/api/v1/event-managers/availability', eventManagerAvailabilityRoutes);
app.use('/api/v1/event-managers', eventManagerAvailabilityRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/payments', paymentRoutes);

app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/uploads', uploadRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/owner/dashboard', dashboardRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/activities', require('./routes/activityRoutes'));
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/favorites', favoriteRoutes);
app.use('/api/v1/support', require('./routes/supportRoutes'));
app.use('/api/v1/admin/subscriptions', require('./routes/adminSubscriptionRoutes'));
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/v1/event-manager/subscription', subscriptionRoutes);
app.use('/api/v1/loyalty', require('./routes/loyaltyRoutes'));
app.use('/api/loyalty', require('./routes/loyaltyRoutes'));
app.use('/api/v1/qr', require('./routes/qrRoutes'));
app.use('/api/qr', require('./routes/qrRoutes'));

// Basic Route
app.get('/', (req, res) => {
  res.send('Welcome to Grab2GO Backend API');
});



// 404 Route Not Found Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    status: 404,
    message: `Route ${req.originalUrl} not found`,
    data: {}
  });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
