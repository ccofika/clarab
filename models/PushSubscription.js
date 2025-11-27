const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Push subscription object from browser
  subscription: {
    endpoint: {
      type: String,
      required: true
    },
    keys: {
      p256dh: {
        type: String,
        required: true
      },
      auth: {
        type: String,
        required: true
      }
    }
  },
  // Device/browser info for managing multiple devices
  deviceInfo: {
    userAgent: String,
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    },
    browser: String,
    os: String
  },
  // Subscription status
  isActive: {
    type: Boolean,
    default: true
  },
  // Last successful push
  lastPushAt: Date,
  // Failed push attempts (for cleanup)
  failedAttempts: {
    type: Number,
    default: 0
  },
  // Created/updated timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for unique subscription per user+endpoint
pushSubscriptionSchema.index({ user: 1, 'subscription.endpoint': 1 }, { unique: true });

// Index for finding active subscriptions
pushSubscriptionSchema.index({ user: 1, isActive: 1 });

// Update timestamp on save
pushSubscriptionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method: Save or update subscription
pushSubscriptionSchema.statics.saveSubscription = async function(userId, subscription, deviceInfo = {}) {
  const existingSubscription = await this.findOne({
    user: userId,
    'subscription.endpoint': subscription.endpoint
  });

  if (existingSubscription) {
    // Update existing subscription
    existingSubscription.subscription = subscription;
    existingSubscription.deviceInfo = deviceInfo;
    existingSubscription.isActive = true;
    existingSubscription.failedAttempts = 0;
    return await existingSubscription.save();
  }

  // Create new subscription
  return await this.create({
    user: userId,
    subscription,
    deviceInfo,
    isActive: true
  });
};

// Static method: Get all active subscriptions for a user
pushSubscriptionSchema.statics.getActiveSubscriptions = async function(userId) {
  return await this.find({
    user: userId,
    isActive: true
  });
};

// Static method: Mark subscription as failed
pushSubscriptionSchema.statics.markFailed = async function(subscriptionId) {
  const sub = await this.findById(subscriptionId);
  if (sub) {
    sub.failedAttempts += 1;
    // Deactivate after 3 failed attempts
    if (sub.failedAttempts >= 3) {
      sub.isActive = false;
    }
    await sub.save();
  }
};

// Static method: Mark subscription as successful
pushSubscriptionSchema.statics.markSuccess = async function(subscriptionId) {
  await this.findByIdAndUpdate(subscriptionId, {
    lastPushAt: new Date(),
    failedAttempts: 0
  });
};

// Static method: Remove subscription by endpoint
pushSubscriptionSchema.statics.removeByEndpoint = async function(userId, endpoint) {
  return await this.deleteOne({
    user: userId,
    'subscription.endpoint': endpoint
  });
};

// Static method: Remove all subscriptions for user
pushSubscriptionSchema.statics.removeAllForUser = async function(userId) {
  return await this.deleteMany({ user: userId });
};

// Static method: Cleanup old inactive subscriptions (run periodically)
pushSubscriptionSchema.statics.cleanupInactive = async function() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return await this.deleteMany({
    isActive: false,
    updatedAt: { $lt: thirtyDaysAgo }
  });
};

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
