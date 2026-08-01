const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

const app = express();

// CORS — allow client HTML + admin React + any local dev origin
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:5173', // Admin React (Vite)
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:8000',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Security Headers Middleware ──────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ── SEO Routes (Robots & Sitemap) ────────────────────────
app.use('/', require('./routes/seo.routes'));

// ── Routes ──────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth.routes'));
app.use('/api/products',   require('./routes/product.routes'));
app.use('/api/orders',     require('./routes/order.routes'));
app.use('/api/users',      require('./routes/user.routes'));
app.use('/api/categories',  require('./routes/category.routes'));
app.use('/api/settings',    require('./routes/settings.routes'));
app.use('/api/influencers', require('./routes/influencer.routes'));

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'RUXOVA API is running 🌹', status: 'OK' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🌹 RUXOVA API running on http://localhost:${PORT}\n`);
});

module.exports = app;
