const dotenv = require('dotenv');

// Load environment variables FIRST, before anything else
dotenv.config();

const express = require('express');
const cors = require('cors');
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

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/canvas', canvasRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/quicklinks', quickLinkRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'API is running...' });
});

// Error handling middleware
app.use((err, req, res, next) => {
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
