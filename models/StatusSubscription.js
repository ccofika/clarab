const mongoose = require('mongoose');
const crypto = require('crypto');

// Schema for status page subscriptions
const statusSubscriptionSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  // Optional - if user is logged in
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // What to subscribe to
  subscriptionType: {
    type: String,
    enum: ['all', 'incidents_only', 'maintenance_only', 'components'],
    default: 'all'
  },
  // Specific components to subscribe to (if subscriptionType is 'components')
  components: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SystemComponent'
  }],
  // Severity filter
  severityFilter: {
    type: [String],
    enum: ['critical', 'major', 'minor'],
    default: ['critical', 'major', 'minor']
  },
  // Verification
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationExpires: Date,
  // Unsubscribe
  unsubscribeToken: {
    type: String,
    default: function() {
      return crypto.randomBytes(32).toString('hex');
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Stats
  lastNotifiedAt: Date,
  notificationCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
statusSubscriptionSchema.index({ email: 1 }, { unique: true });
statusSubscriptionSchema.index({ isActive: 1, isVerified: 1 });
statusSubscriptionSchema.index({ unsubscribeToken: 1 });
statusSubscriptionSchema.index({ verificationToken: 1 });

// Generate verification token
statusSubscriptionSchema.methods.generateVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.verificationToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  this.verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Verify subscription
statusSubscriptionSchema.methods.verify = function() {
  this.isVerified = true;
  this.verificationToken = undefined;
  this.verificationExpires = undefined;
  return this.save();
};

// Unsubscribe
statusSubscriptionSchema.methods.unsubscribe = function() {
  this.isActive = false;
  return this.save();
};

// Static method to get active subscribers for incidents
statusSubscriptionSchema.statics.getIncidentSubscribers = function(severity, componentIds = []) {
  const query = {
    isActive: true,
    isVerified: true,
    subscriptionType: { $in: ['all', 'incidents_only', 'components'] },
    severityFilter: severity
  };

  // If component-specific, filter by components
  if (componentIds.length > 0) {
    query.$or = [
      { subscriptionType: { $in: ['all', 'incidents_only'] } },
      { subscriptionType: 'components', components: { $in: componentIds } }
    ];
  }

  return this.find(query).select('email user');
};

// Static method to get active subscribers for maintenance
statusSubscriptionSchema.statics.getMaintenanceSubscribers = function(componentIds = []) {
  const query = {
    isActive: true,
    isVerified: true,
    subscriptionType: { $in: ['all', 'maintenance_only', 'components'] }
  };

  if (componentIds.length > 0) {
    query.$or = [
      { subscriptionType: { $in: ['all', 'maintenance_only'] } },
      { subscriptionType: 'components', components: { $in: componentIds } }
    ];
  }

  return this.find(query).select('email user');
};

// Static to get subscription stats
statusSubscriptionSchema.statics.getStats = async function() {
  const total = await this.countDocuments({ isActive: true, isVerified: true });
  const pending = await this.countDocuments({ isActive: true, isVerified: false });
  return { total, pending };
};

// Ensure virtuals are included in JSON
statusSubscriptionSchema.set('toJSON', { virtuals: true });
statusSubscriptionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('StatusSubscription', statusSubscriptionSchema);
