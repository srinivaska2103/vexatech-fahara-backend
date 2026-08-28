const express = require('express');
const cors = require('cors');
const setupSwagger = require('./config/swagger');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const cafeRoutes = require('./routes/cafeRoutes');
const eventProfileRoutes = require('./routes/eventProfileRoutes');
const eventServiceRoutes = require('./routes/eventServiceRoutes');
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
const errorHandler = require('./middlewares/errorHandler');
const app = express();

// Middlewares
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));
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
app.use(express.static('public'));

// Swagger Documentation
setupSwagger(app);

const webhookController = require('./controllers/webhookController');
app.post('/api/webhooks/razorpay', webhookController.handleRazorpayWebhook);
app.post('/api/webhooks/cashfree', webhookController.handleWebhook);

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/cafes', cafeRoutes);
app.use('/api/v1/event-profiles', eventProfileRoutes);
app.use('/api/v1/event-services', eventServiceRoutes);
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
app.use('/owner/dashboard', dashboardRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/activities', require('./routes/activityRoutes'));
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/favorites', favoriteRoutes);
app.use('/api/v1/support', require('./routes/supportRoutes'));

// Basic Route
app.get('/', (req, res) => {
  res.send('Welcome to Fahara Backend API');
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
