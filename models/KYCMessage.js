const mongoose = require('mongoose');

const kycMessageSchema = new mongoose.Schema({
  // User who sent the KYC message
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Website customer username
  username: {
    type: String,
    required: true,
    index: true
  },

  // Recipient information (KYC channel/agent)
  recipientEmail: {
    type: String
  },
  recipientSlackId: {
    type: String
  },
  recipientName: {
    type: String
  },

  // Message content
  messageText: {
    type: String,
    required: true
  },

  // Slack thread information
  // NOTE: Not unique - multiple messages can be in the same thread
  slackThreadTs: {
    type: String,
    required: true,
    index: true
  },
  slackChannel: {
    type: String,
    required: true
  },

  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'answered', 'resolved'],
    default: 'pending',
    index: true
  },

  // Track if first reply has been received (to limit card updates)
  hasReceivedFirstReply: {
    type: Boolean,
    default: false
  },

  // Reply information (when resolved)
  reply: {
    text: String,
    slackUserId: String,
    slackUserName: String,
    timestamp: Date,
    slackTs: String
  },

  // Timestamps
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  resolvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for querying user's messages efficiently
kycMessageSchema.index({ senderId: 1, sentAt: -1 });

// Index for finding messages by thread
kycMessageSchema.index({ slackThreadTs: 1 });

// Method to mark message as answered (only for FIRST reply)
kycMessageSchema.methods.markAsAnswered = function(replyData) {
  // Only update if this is the first reply
  if (this.hasReceivedFirstReply) {
    console.log('⚠️  Message already has first reply, skipping card update');
    return Promise.resolve(this);
  }

  this.status = 'answered'; // KYC agent replied, waiting for customer support to relay to user
  this.hasReceivedFirstReply = true;
  this.reply = {
    text: replyData.text,
    slackUserId: replyData.user,
    slackUserName: replyData.userName || 'Unknown',
    timestamp: new Date(parseFloat(replyData.ts) * 1000),
    slackTs: replyData.ts
  };
  return this.save();
};

// Method to mark message as resolved (customer support relayed update to user)
kycMessageSchema.methods.markAsResolved = function() {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  return this.save();
};

// Static method to get user's messages
kycMessageSchema.statics.getUserMessages = function(userId, limit = 50) {
  return this.find({ senderId: userId })
    .sort({ sentAt: -1 })
    .limit(limit)
    .lean();
};

// Static method to find message by thread (returns LATEST message with this threadTs)
kycMessageSchema.statics.findByThread = function(threadTs) {
  return this.findOne({ slackThreadTs: threadTs })
    .sort({ sentAt: -1 }); // Get the LATEST message with this threadTs
};

// Static method to find ALL messages in a thread
kycMessageSchema.statics.findAllByThread = function(threadTs) {
  return this.find({ slackThreadTs: threadTs })
    .sort({ sentAt: 1 }); // Oldest first (chronological order)
};

// Static method to find latest message by username
kycMessageSchema.statics.findByUsername = function(username) {
  return this.findOne({ username })
    .sort({ sentAt: -1 })
    .lean();
};

const KYCMessage = mongoose.model('KYCMessage', kycMessageSchema);

module.exports = KYCMessage;
