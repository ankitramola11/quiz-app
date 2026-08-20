require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const supabase = require('./config/db');

// Routes
const authRoutes = require('./routes/authRoutes');
const quizRoutes = require('./routes/quizRoutes');
const attemptRoutes = require('./routes/attemptRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Trust reverse proxy (required for Render, Heroku etc.)
app.set('trust proxy', 1);

// Database initialized via require('./config/db')

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for frontend
}));

// Strict rate limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

// General rate limiter for all API routes (400 students × generous buffer)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,            // 200 requests per minute per IP
  message: { success: false, message: 'Too many requests. Please slow down.' }
});

// Body Parser — limit size to prevent oversized payload attacks
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? (process.env.CLIENT_ORIGIN || true) : '*',
  credentials: true
}));

// Static files (frontend)
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/quizzes', apiLimiter, quizRoutes);
app.use('/api/attempts', apiLimiter, attemptRoutes);
app.use('/api/admin', adminRoutes); // admin routes don't need public rate limiting

// Serve frontend for all unmatched routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 Admin panel: http://localhost:${PORT}/admin/login.html`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Another process is listening on this port.`);
    console.error('Try setting a different PORT environment variable or stop the process using the port.');
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
