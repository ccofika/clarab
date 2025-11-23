const Activity = require('../models/Activity');
const ChatMessage = require('../models/ChatMessage');
const ChatChannel = require('../models/ChatChannel');

// Get all activities for current user
exports.getActivities = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      type,
      channelId,
      isRead,
      limit = 50,
      skip = 0
    } = req.query;

    const activities = await Activity.getActivities(userId, {
      type,
      channelId,
      isRead: isRead === 'true' ? true : isRead === 'false' ? false : null,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activities',
      error: error.message
    });
  }
};

// Get unread activity counts
exports.getUnreadCounts = async (req, res) => {
  try {
    const userId = req.user._id;

    const totalUnread = await Activity.getUnreadCount(userId);
    const unreadByType = await Activity.getUnreadByType(userId);

    res.json({
      success: true,
      totalUnread,
      unreadByType
    });
  } catch (error) {
    console.error('Error fetching unread counts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread counts',
      error: error.message
    });
  }
};

// Mark activity as read
exports.markActivityAsRead = async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user._id;

    const activity = await Activity.findOne({ _id: activityId, userId });

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    await activity.markAsRead();

    res.json({
      success: true,
      message: 'Activity marked as read'
    });
  } catch (error) {
    console.error('Error marking activity as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark activity as read',
      error: error.message
    });
  }
};

// Mark all activities as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, channelId } = req.body;

    const filters = {};
    if (type) filters.type = type;
    if (channelId) filters.channel = channelId;

    await Activity.markAllAsRead(userId, filters);

    // Emit Socket.IO event
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('activities:marked_read', { filters });
    }

    res.json({
      success: true,
      message: 'All activities marked as read'
    });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all as read',
      error: error.message
    });
  }
};

// Mark channel activities as read
exports.markChannelAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { channelId } = req.params;

    await Activity.markChannelAsRead(userId, channelId);

    // Emit Socket.IO event
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('activities:channel_read', { channelId });
    }

    res.json({
      success: true,
      message: 'Channel activities marked as read'
    });
  } catch (error) {
    console.error('Error marking channel as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark channel as read',
      error: error.message
    });
  }
};

// Create activity (internal function, called when events happen)
exports.createActivity = async (data) => {
  try {
    const {
      userId,
      type,
      messageId,
      channelId,
      triggeredById,
      metadata = {}
    } = data;

    // Don't create activity if user triggered it themselves
    if (userId.toString() === triggeredById.toString()) {
      return null;
    }

    // Get message excerpt
    const message = await ChatMessage.findById(messageId);
    if (!message) return null;

    const channel = await ChatChannel.findById(channelId);
    if (!channel) return null;

    const excerpt = message.content.substring(0, 100);

    const activity = new Activity({
      userId,
      type,
      message: messageId,
      channel: channelId,
      triggeredBy: triggeredById,
      metadata: {
        ...metadata,
        excerpt,
        channelName: channel.name
      }
    });

    await activity.save();

    // Populate for real-time emission
    await activity.populate([
      { path: 'message', select: 'content type createdAt' },
      { path: 'channel', select: 'name type' },
      { path: 'triggeredBy', select: 'name email avatar' }
    ]);

    return activity;
  } catch (error) {
    console.error('Error creating activity:', error);
    return null;
  }
};

// Delete activity
exports.deleteActivity = async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user._id;

    const activity = await Activity.findOneAndDelete({ _id: activityId, userId });

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
    }

    res.json({
      success: true,
      message: 'Activity deleted'
    });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete activity',
      error: error.message
    });
  }
};

// Get activities for a specific message (thread view)
exports.getMessageActivities = async (req, res) => {
  try {
    const userId = req.user._id;
    const { messageId } = req.params;

    const activities = await Activity.find({
      userId,
      $or: [
        { message: messageId },
        { 'metadata.parentMessageId': messageId }
      ]
    })
      .populate('message', 'content type createdAt')
      .populate('channel', 'name type')
      .populate('triggeredBy', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Error fetching message activities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch message activities',
      error: error.message
    });
  }
};
