const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getOverview,
  getAgents,
  getAgentDetail,
  getChannels,
  getChannelDetail,
  getActivityFeed,
  getConfig,
  getTrends,
  seed
} = require('../controllers/kycGoalsController');

// Authorization middleware - only allow specific emails
const kycGoalsAuthorization = (req, res, next) => {
  const allowedEmails = [
    'filipkozomara@mebit.io',
    'vasilijevitorovic@mebit.io',
    'nevena@mebit.io',
    'mladenjorganovic@mebit.io',
    'markotodorovic@mebit.io'
  ];

  if (!allowedEmails.includes(req.user.email)) {
    return res.status(403).json({
      message: 'Access denied. You do not have permission to access KYC Goals.'
    });
  }

  next();
};

// All routes require auth + whitelist
router.use(protect);
router.use(kycGoalsAuthorization);

// Overview & stats
router.get('/overview', getOverview);
router.get('/trends', getTrends);

// Agents
router.get('/agents', getAgents);
router.get('/agents/:id', getAgentDetail);

// Channels
router.get('/channels', getChannels);
router.get('/channels/:id', getChannelDetail);

// Activity Feed
router.get('/activity-feed', getActivityFeed);

// Config
router.get('/config', getConfig);

// Seed
router.post('/seed', seed);

module.exports = router;
