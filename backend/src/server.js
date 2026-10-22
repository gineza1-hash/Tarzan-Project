require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const authRoutes       = require('./routes/auth');
const membersRoutes    = require('./routes/members');
const savingsRoutes    = require('./routes/savings');
const loansRoutes      = require('./routes/loans');
const repaymentsRoutes = require('./routes/repayments');
const reportsRoutes    = require('./routes/reports');
const ussdRoutes       = require('./routes/ussd');

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting — global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests. Please try again later.' },
}));

// Stricter rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for USSD form-encoded body

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', app: process.env.APP_NAME, timestamp: new Date().toISOString() }));

// Routes
app.use('/api/auth',       authLimiter, authRoutes);
app.use('/api/members',    membersRoutes);
app.use('/api/savings',    savingsRoutes);
app.use('/api/loans',      loansRoutes);
app.use('/api/repayments', repaymentsRoutes);
app.use('/api/reports',    reportsRoutes);
app.use('/ussd',           ussdRoutes); // Africa's Talking callback — no /api prefix

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`🚀 Tarzan SACCO API running on port ${PORT} [${process.env.NODE_ENV}]`);
});

module.exports = app;
