const dotenv = require('dotenv');

// Load environment variables FIRST, before anything else
dotenv.config();

// Fix DNS resolution for MongoDB Atlas on Windows
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const configurePassport = require('./config/passport');
const connectDB = require('./config/db');
const seedAnnouncementsWorkspace = require('./utils/seedAnnouncements');
const seedActiveIssuesWorkspace = require('./utils/seedActiveIssues');
const User = require('./models/User');
const cron = require('node-cron');
const { analyzeAllAgents } = require('./scripts/analyzeAgentIssues');

// Connect to database
connectDB().then(() => {
  // Seed public workspaces after DB connection
  seedAnnouncementsWorkspace();
  seedActiveIssuesWorkspace();

  // Schedule weekly agent issues analysis - Every Monday at 6:00 AM
  cron.schedule('0 6 * * 1', async () => {
    console.log('🕐 Running scheduled agent issues analysis (Monday 6:00 AM)...');
    try {
      await analyzeAllAgents();
      console.log('✅ Scheduled agent issues analysis completed');
    } catch (error) {
      console.error('❌ Scheduled agent issues analysis failed:', error);
    }
  }, {
    timezone: 'Europe/Belgrade' // Serbian timezone
  });

  console.log('📅 Cron job scheduled: Agent issues analysis every Monday at 6:00 AM (Europe/Belgrade)');
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

// Slack webhook endpoints need raw body for signature verification
app.use('/api/slack/events', express.raw({ type: 'application/json' }));

// KYC Stats Slack Events - MUST be before body parsing middleware
const { handleSlackEvents: handleKYCStatsSlackEvents } = require('./controllers/kycAgentStatsController');
app.post('/api/kyc-stats/slack-events', express.raw({ type: 'application/json' }), handleKYCStatsSlackEvents);

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
const qaRoutes = require('./routes/qaRoutes');
const scrapingRoutes = require('./routes/scrapingRoutes');
const knowledgeRoutes = require('./routes/knowledgeRoutes');
const reportRoutes = require('./routes/reportRoutes');
const chatRoutes = require('./routes/chatRoutes');
const activityRoutes = require('./routes/activityRoutes');
const sectionRoutes = require('./routes/sectionRoutes');
const kycAgentStatsRoutes = require('./routes/kycAgentStatsRoutes');
const pushRoutes = require('./routes/pushRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const issueRoutes = require('./routes/issueRoutes');
const systemComponentRoutes = require('./routes/systemComponentRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');
const statusSubscriptionRoutes = require('./routes/statusSubscriptionRoutes');
const rulesRoutes = require('./routes/rulesRoutes');
const knowledgeBaseRoutes = require('./routes/knowledgeBaseRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/canvas', canvasRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/quicklinks', quickLinkRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/users', userRoutes); // Changed from /api/user to /api/users for consistency
app.use('/api/images', imageRoutes);
app.use('/api/developer', developerRoutes); // Developer-only endpoints
app.use('/api/google-sheets', googleSheetsRoutes); // Google Sheets integration
app.use('/api/slack', slackRoutes); // Slack integration
app.use('/api/qa', qaRoutes); // QA Manager endpoints
app.use('/api/qa/scrape', scrapingRoutes); // QA Scraping endpoints
app.use('/api/qa/knowledge', knowledgeRoutes); // QA Knowledge Base endpoints
app.use('/api/reports', reportRoutes); // Statistics/Reports system
app.use('/api/chat', chatRoutes); // Chat endpoints
app.use('/api/activities', activityRoutes); // Activity/Mentions tracking
app.use('/api/sections', sectionRoutes); // Channel sections/organization
app.use('/api/kyc-stats', kycAgentStatsRoutes); // KYC Agent Stats
app.use('/api/push', pushRoutes); // Push notifications
app.use('/api/categories', categoryRoutes); // Category management for WorkspaceNavigation
app.use('/api/issues', issueRoutes); // Active Issues tracking
app.use('/api/system-components', systemComponentRoutes); // System component status
app.use('/api/maintenance', maintenanceRoutes); // Scheduled maintenance
app.use('/api/status-subscriptions', statusSubscriptionRoutes); // Status page subscriptions
app.use('/api/qa/rules', rulesRoutes); // QA Rules (AI evaluation knowledge)
app.use('/api/knowledge-base', knowledgeBaseRoutes); // Knowledge Base for customer support

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
  console.log('🔌 Socket.io client connected');

  socket.on('disconnect', () => {
    console.log('🔌 Socket.io client disconnected');
  });

  // Handle user authentication for socket
  socket.on('authenticate', async (data) => {
    try {
      // Validate token exists
      if (!data.token) {
        socket.emit('auth_error', { message: 'Authentication token required' });
        socket.disconnect();
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(data.token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
      });

      // Verify user exists in database
      const user = await User.findById(decoded.id).select('_id name email role');
      if (!user) {
        socket.emit('auth_error', { message: 'User not found' });
        socket.disconnect();
        return;
      }

      // Set authenticated user ID from JWT (NOT from client data)
      socket.userId = user._id.toString();
      socket.userName = user.name;
      socket.userEmail = user.email;
      socket.userRole = user.role;

      // Join user's personal room
      socket.join(`user:${socket.userId}`);

      // Emit success
      socket.emit('authenticated', {
        userId: socket.userId,
        userName: user.name,
        message: 'Socket authenticated successfully'
      });

      console.log(`🔐 Socket authenticated for user: ${user.name} (${socket.userId})`);

      // Load chat handlers after authentication
      const chatHandlers = require('./sockets/chatHandlers');
      chatHandlers(io, socket);
    } catch (error) {
      console.error('❌ Socket authentication failed:', error.message);
      socket.emit('auth_error', {
        message: 'Authentication failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
      socket.disconnect();
    }
  });
});

// Load workspace-specific socket handlers
require('./sockets/workspaceHandlers')(io);

// Make io available to routes
app.set('io', io);

// Pass io to scraping controller for real-time updates
const scrapingController = require('./controllers/scrapingController');
scrapingController.setSocketIO(io);

server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🔌 Socket.io enabled`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🔒 Production mode: Secure cookies enabled (__Host- prefix)`);
  } else {
    console.log(`⚙️  Development mode: HTTP cookies (no HTTPS required)`);
  }
});
