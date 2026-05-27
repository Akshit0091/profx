require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes      = require('./routes/auth');
const paymentRoutes   = require('./routes/payment');
const adminRoutes     = require('./routes/admin');
const skuRoutes       = require('./routes/sku');
const uploadRoutes    = require('./routes/upload');
const ordersRoutes    = require('./routes/orders');
const dashboardRoutes = require('./routes/dashboard');
const resetRoutes     = require('./routes/reset');
const contactRoutes   = require('./routes/contact');

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Razorpay webhook needs raw body — mounted inside the payment router itself.
app.use((req, res, next) => {
  if (req.originalUrl === '/api/payment/webhook') return next();
  express.json({ limit: '10mb' })(req, res, next);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'ProfX', version: '2.0' });
});

app.use('/api/auth',      authRoutes);
app.use('/api/payment',   paymentRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/sku',       skuRoutes);
app.use('/api/upload',    uploadRoutes);
app.use('/api/orders',    ordersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reset',     resetRoutes);
app.use('/api/contact',   contactRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// Error
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ProfX backend listening on 0.0.0.0:${PORT}`);
});
