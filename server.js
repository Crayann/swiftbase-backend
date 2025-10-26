const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// IMPORT ROUTES
// ============================================

const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const transactionRoutes = require('./src/routes/transactions');
const rateRoutes = require('./src/routes/rates');

// ============================================
// ROOT ENDPOINT
// ============================================

app.get('/', (req, res) => {
  res.json({
    name: 'SwiftBase API',
    version: '1.0.0',
    description: 'Fast, low-cost international money transfer API',
    status: 'online',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      transactions: '/api/transactions',
      rates: '/api/rates'
    },
    documentation: 'https://github.com/Crayann/swiftbase-backend',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const db = require('./src/config/database');
    await db.query('SELECT NOW()');

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      services: {
        database: 'connected',
        api: 'operational'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// ============================================
// API ROUTES
// ============================================

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/rates', rateRoutes);

// ============================================
// API INFO ENDPOINT
// ============================================

app.get('/api', (req, res) => {
  res.json({
    message: 'SwiftBase API v1.0.0',
    endpoints: [
      {
        path: '/api/health',
        method: 'GET',
        description: 'Health check endpoint'
      },
      {
        path: '/api/auth/register',
        method: 'POST',
        description: 'Register new user'
      },
      {
        path: '/api/auth/login',
        method: 'POST',
        description: 'Login user'
      },
      {
        path: '/api/users/profile',
        method: 'GET',
        description: 'Get user profile',
        auth: true
      },
      {
        path: '/api/users/payment-methods',
        method: 'GET, POST',
        description: 'Manage payment methods',
        auth: true
      },
      {
        path: '/api/users/recipients',
        method: 'GET, POST',
        description: 'Manage recipients',
        auth: true
      },
      {
        path: '/api/transactions/compare-routes',
        method: 'POST',
        description: 'Compare transfer routes',
        auth: true
      },
      {
        path: '/api/transactions/create',
        method: 'POST',
        description: 'Create new transaction',
        auth: true
      },
      {
        path: '/api/transactions/history',
        method: 'GET',
        description: 'Get transaction history',
        auth: true
      },
      {
        path: '/api/rates/:from/:to',
        method: 'GET',
        description: 'Get exchange rate'
      },
      {
        path: '/api/rates/calculate',
        method: 'POST',
        description: 'Calculate transfer amount'
      }
    ]
  });
});

// ============================================
// 404 HANDLER
// ============================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
    message: 'The requested endpoint does not exist',
    availableRoutes: ['/api/health', '/api/auth', '/api/users', '/api/transactions', '/api/rates']
  });
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error('Error occurred:', err);

  // Handle specific error types
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token'
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message
    });
  }

  // Generic error response
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║                                                   ║');
  console.log('║          🚀  SwiftBase API Server                 ║');
  console.log('║                                                   ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📍 Server:      http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💚 Health:      http://localhost:${PORT}/api/health`);
  console.log(`📚 API Docs:    http://localhost:${PORT}/api`);
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('Ready to accept requests! 🎉');
  console.log('');
});

// Export for testing
module.exports = app;