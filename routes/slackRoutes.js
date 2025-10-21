const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  checkAccess,
  sendDirectMessage,
  getConversations,
  getThreadReplies,
  getKYCMessages
} = require('../controllers/slackController');
const { handleSlackEvent } = require('../controllers/slackWebhookController');

// Slack webhook endpoint (NO AUTH - verified by signature)
router.post('/events', handleSlackEvent);

// All other routes require authentication
router.use(protect);

// Check Slack access
router.get('/check-access', checkAccess);

// Send direct message
router.post('/send-dm', sendDirectMessage);

// Get list of conversations
router.get('/conversations', getConversations);

// Get thread replies
router.get('/thread/:channel/:threadTs', getThreadReplies);

// Get user's KYC messages
router.get('/kyc-messages', getKYCMessages);

module.exports = router;
