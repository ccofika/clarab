const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  checkAccess,
  sendDirectMessage,
  getConversations,
  getThreadReplies,
  getKYCMessages,
  markMessageAsResolved,
  cleanupLegacyMessages,
  checkThreadForUsername,
  sendKYCRequest,
  getThreadMessages
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

// Get thread replies (old format - keeping for backwards compatibility)
router.get('/thread/:channel/:threadTs', getThreadReplies);

// Get user's KYC messages
router.get('/kyc-messages', getKYCMessages);

// Mark message as resolved
router.post('/kyc-messages/:id/resolve', markMessageAsResolved);

// Cleanup legacy messages (without username)
router.delete('/kyc-messages/cleanup-legacy', cleanupLegacyMessages);

// Check if thread exists for username
router.get('/check-thread/:username', checkThreadForUsername);

// Send KYC request to channel
router.post('/send-kyc-request', sendKYCRequest);

// Get thread messages for modal (new format)
router.get('/thread/:threadTs', getThreadMessages);

module.exports = router;
