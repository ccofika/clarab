const dotenv = require('dotenv');

// Load environment variables FIRST, before anything else
dotenv.config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const passport = require('passport');
const configurePassport = require('./config/passport');
const connectDB = require('./config/db');
const seedAnnouncementsWorkspace = require('./utils/seedAnnouncements');

// Connect to database
connectDB().then(() => {
  // Seed announcements workspace after DB connection
  seedAnnouncementsWorkspace();
});

const app = express();

// Security Middleware - Helmet (must be early in the middleware chain)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  },
  crossOriginEmbedderPolicy: false, // For development compatibility
}));

// CORS Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser()); // Parse cookies for JWT cookie support

// CRITICAL: Express 5.x Compatibility Fix for express-mongo-sanitize
// Express 5 made req.query, req.body, req.params read-only (getters)
// This middleware makes them writable again so sanitization can work
app.use((req, res, next) => {
  // Make req.query writable
  if (req.query) {
    Object.defineProperty(req, 'query', {
      value: { ...req.query },
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  // Make req.body writable
  if (req.body) {
    Object.defineProperty(req, 'body', {
      value: { ...req.body },
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  // Make req.params writable
  if (req.params) {
    Object.defineProperty(req, 'params', {
      value: { ...req.params },
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  next();
});

// Data Sanitization against NoSQL query injection
// Now this will work because req.query, req.body, req.params are writable
app.use(mongoSanitize({
  onSanitize: ({ req, key }) => {
    console.log(`🛡️  Sanitized key: ${key} in ${req.method} ${req.url}`);
  }
}));

// NOTE: XSS protection is handled by:
// 1. Helmet CSP headers (already configured above)
// 2. Joi input validation (sanitizes and validates all input)
// 3. express-mongo-sanitize (removes $ and . from user input)
// xss-clean is not compatible with Express 5.x and is deprecated

// NOTE: Rate limiting is applied ONLY to login/register endpoints (in authRoutes.js)
// - Login: 50 attempts / 15 minutes (only failed attempts count)
// - Register: 10 attempts / 1 hour
// Account lockout system (5 failed attempts) is the primary brute force protection
// No general API rate limiting to avoid blocking legitimate usage

// Initialize Passport (NO SESSION for JWT)
app.use(passport.initialize());

console.log('🔑 Passport instance in server.js:', typeof passport, passport.constructor.name);

// Configure passport strategies BEFORE loading routes - pass the passport instance
configurePassport(passport);

console.log('📋 Strategies after config:', passport._strategies ? Object.keys(passport._strategies) : 'none');
console.log('🔑 Passport instance AFTER config:', typeof passport, passport.constructor.name);

// Routes - MUST load AFTER passport configuration
const authRoutes = require('./routes/authRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const canvasRoutes = require('./routes/canvasRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const quickLinkRoutes = require('./routes/quickLinkRoutes');
const bookmarkRoutes = require('./routes/bookmarkRoutes');
const userRoutes = require('./routes/userRoutes');
const imageRoutes = require('./routes/imageRoutes');
const developerRoutes = require('./routes/developerRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/canvas', canvasRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/quicklinks', quickLinkRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/user', userRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/developer', developerRoutes); // Developer-only endpoints

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'API is running...' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Global Error Handler:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
