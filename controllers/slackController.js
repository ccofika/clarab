const { WebClient } = require('@slack/web-api');
const User = require('../models/User');
const KYCMessage = require('../models/KYCMessage');

/**
 * Get Slack Web API client using user's access token
 */
const getSlackClient = async (userId) => {
  const user = await User.findById(userId).select('slackAccessToken slackUserId slackTeamId');

  if (!user || !user.slackAccessToken) {
    throw new Error('User not authenticated with Slack or missing access token');
  }

  const client = new WebClient(user.slackAccessToken);

  return { client, user };
};

/**
 * Lookup Slack user by email
 */
const lookupUserByEmail = async (client, email) => {
  try {
    const result = await client.users.lookupByEmail({ email });

    if (result.ok && result.user) {
      return result.user;
    }

    throw new Error('User not found in Slack workspace');
  } catch (error) {
    console.error('❌ Error looking up Slack user:', error.message);
    throw error;
  }
};

/**
 * Check if user has Slack access
 * GET /api/slack/check-access
 */
exports.checkAccess = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('slackAccessToken slackUserId slackTeamId slackTeamName');

    if (!user || !user.slackAccessToken) {
      return res.json({
        hasAccess: false,
        message: 'Not authenticated with Slack. Please log out and log back in.'
      });
    }

    // Try to verify the token is valid
    try {
      const client = new WebClient(user.slackAccessToken);
      const authTest = await client.auth.test();

      if (authTest.ok) {
        return res.json({
          hasAccess: true,
          message: 'Slack access verified successfully',
          slack: {
            userId: user.slackUserId,
            teamId: user.slackTeamId,
            teamName: user.slackTeamName
          }
        });
      }

      throw new Error('Slack auth test failed');
    } catch (error) {
      console.error('❌ Slack token verification failed:', error.message);
      return res.json({
        hasAccess: false,
        message: 'Slack access token is invalid. Please log out and log back in.',
        needsReauth: true
      });
    }
  } catch (error) {
    console.error('❌ Error checking Slack access:', error);
    res.status(500).json({
      message: 'Failed to check Slack access',
      error: error.message
    });
  }
};

/**
 * Send a Direct Message to a Slack user
 * POST /api/slack/send-dm
 * Body: { recipientEmail: string, message: string }
 */
exports.sendDirectMessage = async (req, res) => {
  try {
    const { recipientEmail, message } = req.body;

    if (!recipientEmail || !message) {
      return res.status(400).json({ message: 'Recipient email and message are required' });
    }

    
    // Get Slack client for current user
    const { client, user } = await getSlackClient(req.user._id);

    // Lookup recipient by email
    const recipient = await lookupUserByEmail(client, recipientEmail);

    // Open a DM channel with the recipient
        const conversation = await client.conversations.open({
      users: recipient.id
    });

    if (!conversation.ok || !conversation.channel) {
      throw new Error('Failed to open DM conversation');
    }

    const channelId = conversation.channel.id;

    // Send the message
    const result = await client.chat.postMessage({
      channel: channelId,
      text: message
    });

    if (!result.ok) {
      throw new Error('Failed to send Slack message');
    }

    // Save message to MongoDB
    const kycMessage = await KYCMessage.create({
      senderId: req.user._id,
      recipientEmail: recipientEmail,
      recipientSlackId: recipient.id,
      recipientName: recipient.real_name || recipient.name,
      messageText: message,
      slackThreadTs: result.ts,
      slackChannel: result.channel,
      status: 'pending',
      sentAt: new Date()
    });


    res.json({
      success: true,
      message: 'Direct message sent successfully',
      slack: {
        ts: result.ts,
        channel: result.channel,
        recipient: {
          id: recipient.id,
          name: recipient.real_name || recipient.name,
          email: recipientEmail
        }
      },
      messageId: kycMessage._id
    });

  } catch (error) {
    console.error('❌ Error sending Slack DM:', error);

    // Handle specific Slack API errors
    if (error.data?.error === 'invalid_auth' || error.data?.error === 'token_revoked') {
      return res.status(401).json({
        message: 'Slack authentication expired. Please log out and log back in.',
        needsReauth: true
      });
    }

    res.status(500).json({
      message: 'Failed to send Slack message',
      error: error.message
    });
  }
};

/**
 * Get list of DM conversations
 * GET /api/slack/conversations
 */
exports.getConversations = async (req, res) => {
  try {
    
    const { client, user } = await getSlackClient(req.user._id);

    // Get list of conversations
    const result = await client.conversations.list({
      types: 'im' // Only direct messages
    });

    if (!result.ok) {
      throw new Error('Failed to fetch conversations');
    }


    res.json({
      success: true,
      conversations: result.channels
    });

  } catch (error) {
    console.error('❌ Error fetching Slack conversations:', error);

    if (error.data?.error === 'invalid_auth' || error.data?.error === 'token_revoked') {
      return res.status(401).json({
        message: 'Slack authentication expired. Please log out and log back in.',
        needsReauth: true
      });
    }

    res.status(500).json({
      message: 'Failed to fetch conversations',
      error: error.message
    });
  }
};

/**
 * Get thread replies for a specific message
 * GET /api/slack/thread/:channel/:threadTs
 */
exports.getThreadReplies = async (req, res) => {
  try {
    const { channel, threadTs } = req.params;

    
    const { client, user } = await getSlackClient(req.user._id);

    // Get thread replies
    const result = await client.conversations.replies({
      channel: channel,
      ts: threadTs
    });

    if (!result.ok) {
      throw new Error('Failed to fetch thread replies');
    }


    res.json({
      success: true,
      messages: result.messages
    });

  } catch (error) {
    console.error('❌ Error fetching thread replies:', error);

    if (error.data?.error === 'invalid_auth' || error.data?.error === 'token_revoked') {
      return res.status(401).json({
        message: 'Slack authentication expired. Please log out and log back in.',
        needsReauth: true
      });
    }

    res.status(500).json({
      message: 'Failed to fetch thread replies',
      error: error.message
    });
  }
};

/**
 * Get user's KYC messages from database
 * GET /api/slack/kyc-messages
 */
exports.getKYCMessages = async (req, res) => {
  try {
    
    const messages = await KYCMessage.getUserMessages(req.user._id);


    res.json({
      success: true,
      messages: messages
    });

  } catch (error) {
    console.error('❌ Error fetching KYC messages:', error);
    res.status(500).json({
      message: 'Failed to fetch KYC messages',
      error: error.message
    });
  }
};

/**
 * Mark KYC message as resolved (customer support relayed update to user)
 * POST /api/slack/kyc-messages/:id/resolve
 */
exports.markMessageAsResolved = async (req, res) => {
  try {
    const { id } = req.params;


    // Find message and verify it belongs to current user
    const kycMessage = await KYCMessage.findOne({
      _id: id,
      senderId: req.user._id
    });

    if (!kycMessage) {
      console.error('❌ KYC message not found or unauthorized:', id);
      return res.status(404).json({
        message: 'Message not found or you do not have permission to modify it'
      });
    }

    // Check if username exists (old messages might not have it)
    if (!kycMessage.username) {
      console.error('❌ Legacy message without username, deleting:', id);
      await KYCMessage.deleteOne({ _id: id });
      return res.status(400).json({
        message: 'Legacy message deleted. Please refresh the page.',
        deleted: true
      });
    }

    // Mark as resolved
    await kycMessage.markAsResolved();

    res.json({
      success: true,
      message: 'Message marked as resolved',
      kycMessage: {
        id: kycMessage._id,
        status: kycMessage.status,
        resolvedAt: kycMessage.resolvedAt
      }
    });

  } catch (error) {
    console.error('❌ Error marking message as resolved:', error);
    res.status(500).json({
      message: 'Failed to mark message as resolved',
      error: error.message
    });
  }
};

/**
 * Delete all legacy KYC messages (without username field)
 * DELETE /api/slack/kyc-messages/cleanup-legacy
 */
exports.cleanupLegacyMessages = async (req, res) => {
  try {
    
    // Find all messages without username field
    const legacyMessages = await KYCMessage.find({
      senderId: req.user._id,
      username: { $exists: false }
    });


    // Delete them
    const result = await KYCMessage.deleteMany({
      senderId: req.user._id,
      username: { $exists: false }
    });


    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} legacy messages`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Error cleaning up legacy messages:', error);
    res.status(500).json({
      message: 'Failed to cleanup legacy messages',
      error: error.message
    });
  }
};

/**
 * Check if thread exists for username in Slack channel
 * GET /api/slack/check-thread/:username
 */
exports.checkThreadForUsername = async (req, res) => {
  try {
    const { username } = req.params;

    
    // Check database first for existing message
    const existingMessage = await KYCMessage.findByUsername(username);

    if (existingMessage) {
      return res.json({
        exists: true,
        thread: {
          threadTs: existingMessage.slackThreadTs,
          channel: existingMessage.slackChannel,
          lastUpdate: existingMessage.sentAt,
          status: existingMessage.status
        }
      });
    }

    res.json({
      exists: false
    });

  } catch (error) {
    console.error('❌ Error checking thread:', error);
    res.status(500).json({
      message: 'Failed to check thread',
      error: error.message
    });
  }
};

/**
 * Send KYC request via Slack DM
 * POST /api/slack/send-kyc-request
 * Body: { username: string, message: string, recipientEmail: string, existingThreadTs?: string }
 */
exports.sendKYCRequest = async (req, res) => {
  try {
    const { username, message, recipientEmail, existingThreadTs } = req.body;

    // Default recipient for now (will be replaced with channel later)
    const targetEmail = recipientEmail || 'vasilijevitorovic@mebit.io';

    if (!username || !message) {
      return res.status(400).json({
        message: 'Username and message are required'
      });
    }

    
    // Get Slack client for current user
    const { client, user } = await getSlackClient(req.user._id);

    // Lookup recipient by email
    const recipient = await lookupUserByEmail(client, targetEmail);

    // Open a DM channel with the recipient
        const conversation = await client.conversations.open({
      users: recipient.id
    });

    if (!conversation.ok || !conversation.channel) {
      throw new Error('Failed to open DM conversation');
    }

    const channelId = conversation.channel.id;

    // Format message: username - message
    const formattedMessage = `${username} - ${message}`;

    // Send message to DM (or as thread reply if existingThreadTs provided)
    
    const result = await client.chat.postMessage({
      channel: channelId,
      text: formattedMessage,
      thread_ts: existingThreadTs || undefined
    });

    if (!result.ok) {
      throw new Error('Failed to send Slack message');
    }


    // Save message to MongoDB
    // IMPORTANT: If we're replying to existing thread, use that threadTs
    // Otherwise use what Slack returned (result.thread_ts or result.ts)
    const threadTsToSave = existingThreadTs || result.thread_ts || result.ts;
    
    const kycMessage = await KYCMessage.create({
      senderId: req.user._id,
      username: username,
      messageText: message,
      slackThreadTs: threadTsToSave,
      slackChannel: result.channel,
      recipientEmail: targetEmail,
      recipientSlackId: recipient.id,
      recipientName: recipient.real_name || recipient.name,
      status: 'pending',
      sentAt: new Date()
    });


    res.json({
      success: true,
      message: 'KYC request sent successfully',
      slack: {
        ts: result.ts,
        channel: result.channel,
        threadTs: threadTsToSave // Use the same threadTs we saved to database
      }
    });
  } catch (error) {
    console.error('❌ Error sending KYC request:', error);

    // Handle specific Slack API errors
    if (error.data?.error === 'invalid_auth' || error.data?.error === 'token_revoked') {
      return res.status(401).json({
        message: 'Slack authentication expired. Please log out and log back in.',
        needsReauth: true
      });
    }

    if (error.data?.error === 'users_not_found') {
      return res.status(400).json({
        message: 'Recipient not found in Slack workspace.',
        error: error.message
      });
    }

    res.status(500).json({
      message: 'Failed to send KYC request',
      error: error.message
    });
  }
};

/**
 * Get full thread messages for modal view
 * GET /api/slack/thread/:threadTs
 */
exports.getThreadMessages = async (req, res) => {
  try {
    const { threadTs } = req.params;

    
    // DIAGNOSTIC: Check how many messages exist with this threadTs
    const allMessagesWithThread = await KYCMessage.find({ slackThreadTs: threadTs })
      .sort({ sentAt: -1 })
      .select('_id username sentAt slackChannel status hasReceivedFirstReply')
      .lean();

    // Find ANY KYC message with this threadTs to get the channel
    const kycMessage = await KYCMessage.findByThread(threadTs);

    if (!kycMessage) {
      console.error('❌ No KYC message found with threadTs:', threadTs);
      console.error('This is unexpected since we found', allMessagesWithThread.length, 'messages above');
      return res.status(404).json({
        message: 'Thread not found in database'
      });
    }


    const { client } = await getSlackClient(req.user._id);

    // Fetch thread replies from Slack
    
    const result = await client.conversations.replies({
      channel: kycMessage.slackChannel,
      ts: threadTs
    });

    if (!result.ok) {
      console.error('❌ Slack API error:', result.error);
      throw new Error('Failed to fetch thread replies from Slack');
    }


    // Get the user's Slack ID to identify messages from our app
    const { user } = await getSlackClient(req.user._id);
    const ourSlackUserId = user.slackUserId;

    // Transform ALL messages (including first one for context)
    const threadMessages = result.messages.map((msg, index) => {
      // Check if message is from our app user (formatted as "username - message")
      const isFromOurApp = msg.user === ourSlackUserId;
      let displayName;
      let displayText = msg.text;

      if (isFromOurApp) {
        // Extract username from "username - message" format
        const match = msg.text.match(/^(.+?)\s*-\s*(.+)$/);
        if (match) {
          displayName = match[1].trim(); // username part
          displayText = match[2].trim(); // message part
        } else {
          displayName = 'Customer Support';
          displayText = msg.text;
        }
      } else {
        // It's a reply from KYC agent
        displayName = msg.user_profile?.real_name || msg.user_profile?.display_name || 'KYC Agent';
      }

      return {
        text: displayText,
        originalText: msg.text, // Keep original for debugging
        timestamp: msg.ts,
        user: displayName,
        isFirstMessage: index === 0
      };
    });

    res.json({
      success: true,
      messages: threadMessages
    });

  } catch (error) {
    console.error('❌ Error fetching thread messages:', error);

    if (error.data?.error === 'invalid_auth' || error.data?.error === 'token_revoked') {
      return res.status(401).json({
        message: 'Slack authentication expired. Please log out and log back in.',
        needsReauth: true
      });
    }

    if (error.data?.error === 'thread_not_found') {
      return res.status(404).json({
        message: 'Thread not found in Slack. It may have been deleted.',
        error: error.message
      });
    }

    res.status(500).json({
      message: 'Failed to fetch thread messages',
      error: error.message,
      slackError: error.data?.error
    });
  }
};
