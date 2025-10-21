const mongoose = require('mongoose');

const kycMessageSchema = new mongoose.Schema({
  // User who sent the KYC message
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Recipient information
  recipientEmail: {
    type: String,
    required: true
  },
  recipientSlackId: {
    type: String,
    required: true
  },
  recipientName: {
    type: String,
    required: true
  },

  // Message content
  messageText: {
    type: String,
    required: true
  },

  // Slack thread information
  slackThreadTs: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  slackChannel: {
    type: String,
    required: true
  },

  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'resolved'],
    default: 'pending',
    index: true
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

// Method to mark message as resolved
kycMessageSchema.methods.markAsResolved = function(replyData) {
  this.status = 'resolved';
  this.reply = {
    text: replyData.text,
    slackUserId: replyData.user,
    slackUserName: replyData.userName || 'Unknown',
    timestamp: new Date(parseFloat(replyData.ts) * 1000),
    slackTs: replyData.ts
  };
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

// Static method to find message by thread
kycMessageSchema.statics.findByThread = function(threadTs) {
  return this.findOne({ slackThreadTs: threadTs });
};

const KYCMessage = mongoose.model('KYCMessage', kycMessageSchema);

module.exports = KYCMessage;
