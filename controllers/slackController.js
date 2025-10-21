const { WebClient } = require('@slack/web-api');
const User = require('../models/User');

/**
 * Get Slack Web API client using user's access token
 */
const getSlackClient = async (userId) => {
  const user = await User.findById(userId).select('slackAccessToken slackUserId slackTeamId');

  if (!user || !user.slackAccessToken) {
    throw new Error('User not authenticated with Slack or missing access token');
  }

  console.log('🔑 Creating Slack client for user:', userId);
  const client = new WebClient(user.slackAccessToken);

  return { client, user };
};

/**
 * Lookup Slack user by email
 */
const lookupUserByEmail = async (client, email) => {
  try {
    console.log('🔍 Looking up Slack user by email:', email);
    const result = await client.users.lookupByEmail({ email });

    if (result.ok && result.user) {
      console.log('✅ Slack user found:', {
        id: result.user.id,
        name: result.user.name,
        real_name: result.user.real_name
      });
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
    console.log('🔍 Checking Slack access for user:', req.user._id);

    const user = await User.findById(req.user._id).select('slackAccessToken slackUserId slackTeamId slackTeamName');

    if (!user || !user.slackAccessToken) {
      console.log('❌ User does not have Slack access');
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
        console.log('✅ Slack access verified:', {
          userId: authTest.user_id,
          teamId: authTest.team_id,
          teamName: authTest.team
        });

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

    console.log('📤 Sending Slack DM:', {
      from: req.user._id,
      to: recipientEmail,
      messageLength: message.length
    });

    // Get Slack client for current user
    const { client, user } = await getSlackClient(req.user._id);

    // Lookup recipient by email
    const recipient = await lookupUserByEmail(client, recipientEmail);

    // Open a DM channel with the recipient
    console.log('💬 Opening DM channel with user:', recipient.id);
    const conversation = await client.conversations.open({
      users: recipient.id
    });

    if (!conversation.ok || !conversation.channel) {
      throw new Error('Failed to open DM conversation');
    }

    const channelId = conversation.channel.id;
    console.log('✅ DM channel opened:', channelId);

    // Send the message
    console.log('📨 Sending message to channel:', channelId);
    const result = await client.chat.postMessage({
      channel: channelId,
      text: message
    });

    if (!result.ok) {
      throw new Error('Failed to send Slack message');
    }

    console.log('✅ Slack DM sent successfully:', {
      ts: result.ts,
      channel: result.channel
    });

    res.json({
      success: true,
      message: 'Direct message sent successfully',
      slack: {
        ts: result.ts,
        channel: result.channel,
        recipient: {
          id: recipient.id,
          name: recipient.name,
          email: recipientEmail
        }
      }
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
    console.log('🔍 Fetching Slack conversations for user:', req.user._id);

    const { client, user } = await getSlackClient(req.user._id);

    // Get list of conversations
    const result = await client.conversations.list({
      types: 'im', // Only direct messages
      limit: 50
    });

    if (!result.ok) {
      throw new Error('Failed to fetch conversations');
    }

    console.log('✅ Fetched', result.channels.length, 'DM conversations');

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

    console.log('🧵 Fetching thread replies:', { channel, threadTs });

    const { client, user } = await getSlackClient(req.user._id);

    // Get thread replies
    const result = await client.conversations.replies({
      channel: channel,
      ts: threadTs
    });

    if (!result.ok) {
      throw new Error('Failed to fetch thread replies');
    }

    console.log('✅ Fetched', result.messages.length, 'thread messages');

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
