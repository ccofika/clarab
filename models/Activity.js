const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['mention', 'reply', 'reaction', 'thread_reply', 'channel_invite'],
    required: true,
    index: true
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  message: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage',
    required: true
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatChannel',
    required: true,
    index: true
  },
  triggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metadata: {
    // For mentions: position in text
    mentionPosition: Number,

    // For threads: parent message ID
    parentMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage'
    },

    // For reactions: emoji used
    emoji: String,

    // Additional context
    excerpt: String, // Message excerpt (first 100 chars)
    channelName: String
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
activitySchema.index({ userId: 1, isRead: 1, createdAt: -1 });
activitySchema.index({ userId: 1, type: 1, createdAt: -1 });
activitySchema.index({ userId: 1, channel: 1, createdAt: -1 });

// Instance methods
activitySchema.methods.markAsRead = async function() {
  this.isRead = true;
  return this.save();
};

// Static methods
activitySchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

activitySchema.statics.getUnreadByType = async function(userId) {
  const result = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), isRead: false } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  return result.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});
};

activitySchema.statics.markAllAsRead = async function(userId, filters = {}) {
  const query = { userId, isRead: false, ...filters };
  return this.updateMany(query, { $set: { isRead: true } });
};

activitySchema.statics.markChannelAsRead = async function(userId, channelId) {
  return this.updateMany(
    { userId, channel: channelId, isRead: false },
    { $set: { isRead: true } }
  );
};

activitySchema.statics.getActivities = async function(userId, options = {}) {
  const {
    type = null,
    channelId = null,
    isRead = null,
    limit = 50,
    skip = 0
  } = options;

  const query = { userId };
  if (type) query.type = type;
  if (channelId) query.channel = channelId;
  if (isRead !== null) query.isRead = isRead;

  return this.find(query)
    .populate('message', 'content type createdAt')
    .populate('channel', 'name type')
    .populate('triggeredBy', 'name email avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Clean up old read activities (older than 30 days)
activitySchema.statics.cleanOldActivities = async function() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return this.deleteMany({
    isRead: true,
    createdAt: { $lt: thirtyDaysAgo }
  });
};

module.exports = mongoose.model('Activity', activitySchema);
