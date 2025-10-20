const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String
  },
  success: {
    type: Boolean,
    required: true,
    default: false
  },
  failureReason: {
    type: String,
    enum: ['user_not_found', 'incorrect_password', 'account_locked'],
    required: function() {
      return !this.success;
    }
  },
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 2592000 // Auto-delete after 30 days (TTL index)
  }
}, {
  timestamps: true
});

// Indexes for faster lookups
loginAttemptSchema.index({ email: 1, timestamp: -1 });
loginAttemptSchema.index({ ipAddress: 1, timestamp: -1 });
loginAttemptSchema.index({ timestamp: 1 });

// Static method to get failed attempts by email in last time window
loginAttemptSchema.statics.getRecentFailedAttemptsByEmail = async function(email, timeWindowMs = 3600000) {
  const cutoffTime = new Date(Date.now() - timeWindowMs);

  return await this.countDocuments({
    email,
    success: false,
    timestamp: { $gte: cutoffTime }
  });
};

// Static method to get failed attempts by IP in last time window
loginAttemptSchema.statics.getRecentFailedAttemptsByIP = async function(ipAddress, timeWindowMs = 3600000) {
  const cutoffTime = new Date(Date.now() - timeWindowMs);

  return await this.countDocuments({
    ipAddress,
    success: false,
    timestamp: { $gte: cutoffTime }
  });
};

// Static method to log login attempt
loginAttemptSchema.statics.logAttempt = async function(email, ipAddress, success, failureReason = null, userAgent = '') {
  return await this.create({
    email,
    ipAddress,
    userAgent,
    success,
    failureReason: success ? undefined : failureReason
  });
};

// Static method to get recent attempts (for admin dashboard)
loginAttemptSchema.statics.getRecentAttempts = async function(limit = 100, skip = 0) {
  return await this.find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .select('email ipAddress success failureReason timestamp userAgent');
};

// Static method to get suspicious activity (multiple failures from same IP)
loginAttemptSchema.statics.getSuspiciousActivity = async function(threshold = 10, timeWindowMs = 3600000) {
  const cutoffTime = new Date(Date.now() - timeWindowMs);

  return await this.aggregate([
    {
      $match: {
        success: false,
        timestamp: { $gte: cutoffTime }
      }
    },
    {
      $group: {
        _id: '$ipAddress',
        count: { $sum: 1 },
        emails: { $addToSet: '$email' },
        lastAttempt: { $max: '$timestamp' }
      }
    },
    {
      $match: {
        count: { $gte: threshold }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
