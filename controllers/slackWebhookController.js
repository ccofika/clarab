const crypto = require('crypto');
const User = require('../models/User');

/**
 * Verify Slack request signature
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
const verifySlackSignature = (req) => {
  const slackSignature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  const body = JSON.stringify(req.body);

  // Prevent replay attacks - request should be within 5 minutes
  const time = Math.floor(new Date().getTime() / 1000);
  if (Math.abs(time - timestamp) > 300) {
    console.warn('⚠️  Slack webhook timestamp too old');
    return false;
  }

  // Create signature base string
  const sigBasestring = `v0:${timestamp}:${body}`;

  // Create HMAC SHA256 hash
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  // Compare signatures
  const isValid = crypto.timingSafeEqual(
    Buffer.from(mySignature, 'utf8'),
    Buffer.from(slackSignature, 'utf8')
  );

  if (!isValid) {
    console.warn('⚠️  Slack signature verification failed');
  }

  return isValid;
};

/**
 * Handle Slack Events
 * POST /api/slack/events
 */
exports.handleSlackEvent = async (req, res) => {
  try {
    console.log('🔔 Slack webhook received:', {
      type: req.body.type,
      event: req.body.event?.type
    });

    // Handle URL verification challenge (first time setup)
    if (req.body.type === 'url_verification') {
      console.log('✅ Slack URL verification challenge received');
      return res.json({ challenge: req.body.challenge });
    }

    // Verify request is from Slack (for all other events)
    if (!verifySlackSignature(req)) {
      console.error('❌ Slack signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Handle event callbacks
    if (req.body.type === 'event_callback') {
      const event = req.body.event;

      console.log('🎯 Event callback received:', {
        type: event.type,
        user: event.user,
        channel: event.channel,
        ts: event.ts,
        thread_ts: event.thread_ts
      });

      // Handle message events (thread replies)
      if (event.type === 'message') {
        await handleThreadReply(event, req);
      }

      // Respond quickly to Slack (within 3 seconds)
      return res.status(200).send();
    }

    // Unknown event type
    console.warn('⚠️  Unknown Slack event type:', req.body.type);
    res.status(200).send();

  } catch (error) {
    console.error('❌ Error handling Slack webhook:', error);
    // Always respond 200 to Slack to avoid retries
    res.status(200).send();
  }
};

/**
 * Handle thread reply event
 */
const handleThreadReply = async (event, req) => {
  try {
    // Only process replies in threads (has thread_ts)
    if (!event.thread_ts) {
      console.log('📝 Message is not a thread reply, ignoring');
      return;
    }

    // Don't process bot messages or message changes
    if (event.subtype === 'bot_message' || event.subtype === 'message_changed') {
      console.log('🤖 Bot message or message change, ignoring');
      return;
    }

    console.log('🧵 Thread reply detected:', {
      threadTs: event.thread_ts,
      messageTs: event.ts,
      user: event.user,
      text: event.text?.substring(0, 50) + '...'
    });

    // Get Socket.io instance
    const io = req.app.get('io');
    if (!io) {
      console.error('❌ Socket.io not available');
      return;
    }

    // Emit thread-reply event to all connected clients
    // Frontend will filter by threadTs
    io.emit('thread-reply', {
      threadTs: event.thread_ts,
      reply: {
        ts: event.ts,
        user: event.user,
        text: event.text,
        timestamp: new Date()
      }
    });

    console.log('✅ Thread reply event emitted via Socket.io');

  } catch (error) {
    console.error('❌ Error handling thread reply:', error);
  }
};
