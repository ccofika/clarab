const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const logger = require('./logger');

// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@clara.mebit.io';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log('✅ Web Push configured with VAPID keys');
} else {
  console.warn('⚠️ VAPID keys not configured - push notifications will not work');
}

/**
 * Send push notification to a specific user
 * @param {string} userId - User ID to send notification to
 * @param {object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {string} payload.icon - Icon URL (optional)
 * @param {string} payload.tag - Notification tag for grouping (optional)
 * @param {object} payload.data - Additional data (optional)
 * @returns {Promise<{success: number, failed: number}>}
 */
const sendPushToUser = async (userId, payload) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn('Push notification skipped - VAPID keys not configured');
    return { success: 0, failed: 0 };
  }

  try {
    // Get all active subscriptions for user
    const subscriptions = await PushSubscription.getActiveSubscriptions(userId);

    if (subscriptions.length === 0) {
      return { success: 0, failed: 0 };
    }

    const results = { success: 0, failed: 0 };
    const notificationPayload = JSON.stringify({
      title: payload.title || 'New Notification',
      body: payload.body || '',
      icon: payload.icon || '/LOGO-MAIN-WHITE.png',
      badge: payload.badge || '/LOGO-MAIN-WHITE.png',
      tag: payload.tag || 'clara-notification',
      data: payload.data || {},
      timestamp: Date.now()
    });

    // Send to all devices
    const sendPromises = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, notificationPayload, {
          TTL: 60 * 60 * 24, // 24 hours
          urgency: 'high'
        });

        await PushSubscription.markSuccess(sub._id);
        results.success++;
      } catch (error) {
        // Handle specific push errors
        if (error.statusCode === 410 || error.statusCode === 404) {
          // Subscription expired or not found - remove it
          await PushSubscription.findByIdAndDelete(sub._id);
          logger.info(`Removed expired push subscription for user ${userId}`);
        } else {
          // Other error - mark as failed
          await PushSubscription.markFailed(sub._id);
          logger.error(`Push notification failed for user ${userId}:`, error.message);
        }
        results.failed++;
      }
    });

    await Promise.all(sendPromises);
    return results;
  } catch (error) {
    logger.error('Error sending push notification:', error);
    return { success: 0, failed: 0 };
  }
};

/**
 * Send push notification to multiple users
 * @param {string[]} userIds - Array of user IDs
 * @param {object} payload - Notification payload
 * @returns {Promise<{success: number, failed: number}>}
 */
const sendPushToUsers = async (userIds, payload) => {
  const totalResults = { success: 0, failed: 0 };

  const sendPromises = userIds.map(async (userId) => {
    const result = await sendPushToUser(userId, payload);
    totalResults.success += result.success;
    totalResults.failed += result.failed;
  });

  await Promise.all(sendPromises);
  return totalResults;
};

/**
 * Send chat message notification
 * @param {object} message - Message object
 * @param {object} channel - Channel object
 * @param {string} recipientId - User ID to notify
 * @param {string} senderId - User ID who sent the message (to exclude)
 */
const sendMessageNotification = async (message, channel, recipientId, senderId) => {
  // Don't notify the sender
  if (recipientId.toString() === senderId.toString()) {
    return;
  }

  const senderName = message.sender?.name || 'Someone';
  const channelName = channel.name || 'a conversation';
  const channelType = channel.type;

  let title = '';
  let body = message.content || '📎 Sent a file';

  // Format title based on channel type (like Slack)
  if (channelType === 'dm') {
    title = `💬 ${senderName}`;
  } else {
    title = `#${channelName}`;
    body = `${senderName}: ${body}`;
  }

  // Truncate long messages
  if (body.length > 150) {
    body = body.substring(0, 150) + '...';
  }

  await sendPushToUser(recipientId, {
    title,
    body,
    tag: `clara-message-${channel._id}`,
    data: {
      type: 'message',
      channelId: channel._id.toString(),
      messageId: message._id.toString(),
      url: `/chat?channel=${channel._id}`
    }
  });
};

/**
 * Send mention notification
 * @param {object} message - Message object
 * @param {object} channel - Channel object
 * @param {string} mentionedUserId - User ID who was mentioned
 */
const sendMentionNotification = async (message, channel, mentionedUserId) => {
  const senderName = message.sender?.name || 'Someone';
  const channelName = channel.name || 'a conversation';
  const channelType = channel.type;

  const title = channelType === 'dm'
    ? `@ ${senderName}`
    : `@ #${channelName}`;

  const body = `${senderName} mentioned you: ${message.content?.substring(0, 120) || ''}`;

  await sendPushToUser(mentionedUserId, {
    title,
    body,
    tag: `clara-mention-${channel._id}`,
    data: {
      type: 'mention',
      channelId: channel._id.toString(),
      messageId: message._id.toString(),
      url: `/chat?channel=${channel._id}`
    }
  });
};

/**
 * Send reaction notification
 * @param {object} message - Message object
 * @param {object} channel - Channel object
 * @param {string} messageOwnerId - User who owns the message
 * @param {string} reactorName - Name of user who reacted
 * @param {string} emoji - Reaction emoji
 */
const sendReactionNotification = async (message, channel, messageOwnerId, reactorName, emoji) => {
  const channelName = channel.name || 'a conversation';

  await sendPushToUser(messageOwnerId, {
    title: `${reactorName} reacted ${emoji}`,
    body: `In #${channelName}: "${message.content?.substring(0, 80) || 'your message'}"`,
    tag: `clara-reaction-${message._id}`,
    data: {
      type: 'reaction',
      channelId: channel._id.toString(),
      messageId: message._id.toString(),
      url: `/chat?channel=${channel._id}`
    }
  });
};

// Export public key for frontend
const getVapidPublicKey = () => VAPID_PUBLIC_KEY;

module.exports = {
  sendPushToUser,
  sendPushToUsers,
  sendMessageNotification,
  sendMentionNotification,
  sendReactionNotification,
  getVapidPublicKey
};
