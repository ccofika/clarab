const mongoose = require('mongoose');

const kycAgentSchema = new mongoose.Schema({
  // Agent identification
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  // Slack identification (populated after first activity)
  slackUserId: {
    type: String,
    index: true,
    sparse: true
  },
  slackUsername: {
    type: String
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },

  // Shift assignment (optional - for default shift)
  defaultShift: {
    type: String,
    enum: ['morning', 'afternoon', 'night'], // 7-15, 15-23, 23-7
    default: null
  },

  // Stats cache (updated periodically)
  statsCache: {
    totalMessages: { type: Number, default: 0 },
    totalTicketsTaken: { type: Number, default: 0 },
    avgResponseTime: { type: Number, default: 0 }, // in seconds
    lastActivity: { type: Date },
    lastCacheUpdate: { type: Date }
  }
}, {
  timestamps: true
});

// Index for efficient lookups
kycAgentSchema.index({ email: 1 });
kycAgentSchema.index({ slackUserId: 1 });
kycAgentSchema.index({ isActive: 1 });

// Static method to find agent by Slack ID
kycAgentSchema.statics.findBySlackId = function(slackUserId) {
  return this.findOne({ slackUserId, isActive: true });
};

// Static method to find agent by email
kycAgentSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase(), isActive: true });
};

// Static method to get all active agents
kycAgentSchema.statics.getAllActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

// Method to update stats cache
kycAgentSchema.methods.updateStatsCache = function(stats) {
  this.statsCache = {
    ...this.statsCache,
    ...stats,
    lastCacheUpdate: new Date()
  };
  return this.save();
};

const KYCAgent = mongoose.model('KYCAgent', kycAgentSchema);

module.exports = KYCAgent;
