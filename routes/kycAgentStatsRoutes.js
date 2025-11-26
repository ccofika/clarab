const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  // Slack Events (no auth - direct from Slack)
  handleSlackEvents,

  // Agent Management
  getAllAgents,
  addAgent,
  updateAgent,
  deleteAgent,
  seedAgents,

  // Statistics
  getOverview,
  getAgentStats,
  getLeaderboard,
  getStatsByShift,
  getActivityFeed,
  getStatistics,

  // Config
  getConfigStatus
} = require('../controllers/kycAgentStatsController');

// Authorization middleware - only allow specific emails
const kycStatsAuthorization = (req, res, next) => {
  const allowedEmails = [
    'filipkozomara@mebit.io',
    'vasilijevitorovic@mebit.io',
    'nevena@mebit.io',
    'mladenjorganovic@mebit.io'
  ];

  if (!allowedEmails.includes(req.user.email)) {
    return res.status(403).json({
      message: 'Access denied. You do not have permission to access KYC Agent Stats.'
    });
  }

  next();
};

// ============================================
// SLACK EVENTS WEBHOOK (No auth - verified by signature)
// ============================================
// This route is handled separately in server.js with raw body parser

// ============================================
// PROTECTED ROUTES
// ============================================
router.use(protect);
router.use(kycStatsAuthorization);

// ============================================
// AGENT MANAGEMENT
// ============================================
router.route('/agents')
  .get(getAllAgents)
  .post(addAgent);

router.post('/agents/seed', seedAgents);

router.route('/agents/:id')
  .put(updateAgent)
  .delete(deleteAgent);

// ============================================
// STATISTICS
// ============================================
router.get('/overview', getOverview);
router.get('/leaderboard', getLeaderboard);
router.get('/by-shift', getStatsByShift);
router.get('/activity-feed', getActivityFeed);
router.get('/statistics', getStatistics);
router.get('/agent/:id', getAgentStats);

// ============================================
// CONFIG STATUS
// ============================================
router.get('/config-status', getConfigStatus);

module.exports = router;
