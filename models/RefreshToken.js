const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdByIp: {
    type: String
  },
  isRevoked: {
    type: Boolean,
    default: false
  },
  revokedAt: {
    type: Date
  },
  revokedByIp: {
    type: String
  },
  revokedReason: {
    type: String
  },
  // For tracking which device/session this token belongs to
  deviceInfo: {
    userAgent: String,
    deviceType: String // mobile, desktop, tablet
  }
}, {
  timestamps: true
});

// Index for faster lookups
refreshTokenSchema.index({ token: 1 });
refreshTokenSchema.index({ user: 1 });
refreshTokenSchema.index({ expiresAt: 1 });

// TTL index - automatically delete expired tokens after they expire
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual to check if token is expired
refreshTokenSchema.virtual('isExpired').get(function() {
  return Date.now() >= this.expiresAt;
});

// Virtual to check if token is active (not expired and not revoked)
refreshTokenSchema.virtual('isActive').get(function() {
  return !this.isRevoked && !this.isExpired;
});

// Method to revoke token
refreshTokenSchema.methods.revoke = function(ip, reason = 'User logout') {
  this.isRevoked = true;
  this.revokedAt = new Date();
  this.revokedByIp = ip;
  this.revokedReason = reason;
  return this.save();
};

// Static method to generate refresh token
refreshTokenSchema.statics.generateRefreshToken = async function(userId, ipAddress, userAgent = '') {
  // Generate a unique token
  const token = uuidv4();

  // Set expiration to 7 days from now
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Determine device type from user agent
  let deviceType = 'desktop';
  if (userAgent) {
    if (/mobile/i.test(userAgent)) deviceType = 'mobile';
    else if (/tablet/i.test(userAgent)) deviceType = 'tablet';
  }

  // Create refresh token
  const refreshToken = await this.create({
    token,
    user: userId,
    expiresAt,
    createdByIp: ipAddress,
    deviceInfo: {
      userAgent,
      deviceType
    }
  });

  return refreshToken;
};

// Static method to revoke all tokens for a user (logout from all devices)
refreshTokenSchema.statics.revokeAllForUser = async function(userId, ipAddress, reason = 'Logout from all devices') {
  const result = await this.updateMany(
    {
      user: userId,
      isRevoked: false
    },
    {
      $set: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedByIp: ipAddress,
        revokedReason: reason
      }
    }
  );

  return result;
};

// Static method to get active tokens for a user
refreshTokenSchema.statics.getActiveTokensForUser = async function(userId) {
  const tokens = await this.find({
    user: userId,
    isRevoked: false,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  return tokens;
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
