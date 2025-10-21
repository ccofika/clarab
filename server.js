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
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin' // Prevents URL leakage in referrer header
  }
}));

// CORS Middleware - Secure origin whitelist with validation
const allowedOrigins = [
  'http://localhost:3000',           // Local development
  'http://localhost:3001',           // Backup dev port
  'https://claraf.vercel.app',       // Production Vercel
  process.env.FRONTEND_URL           // Additional custom origin from .env
].filter(Boolean); // Remove undefined values

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400 // Cache preflight for 24 hours
};

app.use(cors(corsOptions));

// Slack webhook endpoint needs raw body for signature verification
app.use('/api/slack/events', express.raw({ type: 'application/json' }));

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
const googleSheetsRoutes = require('./routes/googleSheetsRoutes');
const slackRoutes = require('./routes/slackRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/canvas', canvasRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/quicklinks', quickLinkRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/user', userRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/developer', developerRoutes); // Developer-only endpoints
app.use('/api/google-sheets', googleSheetsRoutes); // Google Sheets integration
app.use('/api/slack', slackRoutes); // Slack integration

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

// Create HTTP server for Socket.io integration
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);

// Configure Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('🔌 Socket.io client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔌 Socket.io client disconnected:', socket.id);
  });

  // Handle user authentication for socket
  socket.on('authenticate', (data) => {
    console.log('🔐 Socket authenticated for user:', data.userId);
    socket.userId = data.userId;
    socket.join(`user:${data.userId}`);
  });
});

// Make io available to routes
app.set('io', io);

server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🔌 Socket.io enabled`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🔒 Production mode: Secure cookies enabled (__Host- prefix)`);
  } else {
    console.log(`⚙️  Development mode: HTTP cookies (no HTTPS required)`);
  }
});
