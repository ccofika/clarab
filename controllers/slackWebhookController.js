const crypto = require('crypto');
const User = require('../models/User');
const KYCMessage = require('../models/KYCMessage');

/**
 * Verify Slack request signature
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
const verifySlackSignature = (req, rawBody) => {
  const slackSignature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];

  // Use raw body for signature verification
  const body = rawBody;

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
    console.log('Expected:', mySignature);
    console.log('Received:', slackSignature);
  }

  return isValid;
};

/**
 * Handle Slack Events
 * POST /api/slack/events
 */
exports.handleSlackEvent = async (req, res) => {
  try {
    // Convert numbered object back to Buffer if needed
    let rawBody, payload;

    if (Buffer.isBuffer(req.body)) {
      // Already a buffer
      rawBody = req.body.toString('utf8');
      payload = JSON.parse(rawBody);
    } else if (typeof req.body === 'object' && req.body !== null && '0' in req.body) {
      // Object with numbered keys - convert back to Buffer
      const bodyArray = Object.values(req.body);
      const buffer = Buffer.from(bodyArray);
      rawBody = buffer.toString('utf8');
      payload = JSON.parse(rawBody);
    } else if (typeof req.body === 'string') {
      // String
      rawBody = req.body;
      payload = JSON.parse(rawBody);
    } else {
      // Already parsed JSON object
      rawBody = JSON.stringify(req.body);
      payload = req.body;
    }

    console.log('🔔 Slack webhook received:', {
      type: payload.type,
      event: payload.event?.type
    });

    // Handle URL verification challenge (first time setup)
    if (payload.type === 'url_verification') {
      console.log('✅ Slack URL verification challenge received');
      return res.json({ challenge: payload.challenge });
    }

    // Verify request is from Slack (for all other events)
    if (!verifySlackSignature(req, rawBody)) {
      console.error('❌ Slack signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Replace req.body with parsed payload for downstream use
    req.body = payload;

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

    // Find ALL KYC messages in this thread, then select the LATEST PENDING one
    console.log('🔍 Looking for KYC messages with thread:', event.thread_ts);
    const allMessagesInThread = await KYCMessage.findAllByThread(event.thread_ts);

    if (!allMessagesInThread || allMessagesInThread.length === 0) {
      console.log('⚠️  No KYC messages found for thread:', event.thread_ts);
      return;
    }

    console.log(`📊 Found ${allMessagesInThread.length} message(s) in thread:`,
      allMessagesInThread.map(m => ({ id: m._id, status: m.status, sentAt: m.sentAt }))
    );

    // Find the LATEST pending message (if any)
    let kycMessage = allMessagesInThread
      .filter(m => m.status === 'pending')
      .sort((a, b) => b.sentAt - a.sentAt)[0];

    // If no pending message, use the latest message (regardless of status)
    if (!kycMessage) {
      console.log('ℹ️  No pending message found, using latest message');
      kycMessage = allMessagesInThread[allMessagesInThread.length - 1]; // Last one (newest)
    }

    console.log('✅ Selected KYC message to update:', {
      id: kycMessage._id,
      status: kycMessage.status,
      username: kycMessage.username,
      sentAt: kycMessage.sentAt
    });

    // Check if this is the first reply (before updating)
    const isFirstReply = !kycMessage.hasReceivedFirstReply;

    // Update KYC message with reply (set to 'answered' status)
    console.log('💾 Updating KYC message with reply...');
    await kycMessage.markAsAnswered({
      ts: event.ts,
      user: event.user,
      text: event.text,
      userName: 'Slack User' // Will be updated if we fetch user info
    });

    console.log('✅ KYC message marked as answered (waiting for customer support to relay)');

    // Get Socket.io instance
    const io = req.app.get('io');
    if (!io) {
      console.error('❌ Socket.io not available');
      return;
    }

    const eventData = {
      threadTs: event.thread_ts,
      reply: {
        ts: event.ts,
        user: event.user,
        text: event.text,
        timestamp: new Date()
      },
      messageId: kycMessage._id,
      isFirstReply
    };

    console.log('📡 Emitting thread-reply event:', {
      ...eventData,
      isFirstReply,
      kycMessageId: kycMessage._id
    });

    // Emit thread-reply event to all connected clients
    // (Frontend will decide whether to update based on current state)
    io.emit('thread-reply', eventData);

    console.log(`✅ Thread reply event emitted via Socket.io to all clients (isFirstReply: ${isFirstReply})`);
    console.log(`🔌 Connected clients: ${io.engine.clientsCount}`);

  } catch (error) {
    console.error('❌ Error handling thread reply:', error);
  }
};
