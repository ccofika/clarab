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
  },
  // SECURITY: Token family for rotation and reuse detection
  tokenFamily: {
    type: String,
    required: true,
    index: true
  },
  // Track if this token replaced another (for rotation)
  replacedByToken: {
    type: String,
    default: null
  },
  // Track when token was used (for reuse detection)
  lastUsedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster lookups (token and tokenFamily already have index:true in schema)
refreshTokenSchema.index({ user: 1 });

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
refreshTokenSchema.statics.generateRefreshToken = async function(userId, ipAddress, userAgent = '', tokenFamily = null) {
  // Generate a unique token
  const token = uuidv4();

  // Generate token family ID if not provided (new login session)
  const family = tokenFamily || uuidv4();

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
    tokenFamily: family,
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

// SECURITY: Rotate refresh token (generate new token, revoke old one)
// This prevents stolen tokens from being valid for 7 days
refreshTokenSchema.statics.rotateToken = async function(oldTokenDoc, ipAddress, userAgent) {
  // Generate new token in the same family
  const newToken = await this.generateRefreshToken(
    oldTokenDoc.user,
    ipAddress,
    userAgent,
    oldTokenDoc.tokenFamily // Same family for tracking
  );

  // Mark old token as replaced (not revoked, so we can detect reuse)
  await oldTokenDoc.updateOne({
    $set: {
      replacedByToken: newToken.token,
      lastUsedAt: new Date()
    }
  });

  return newToken;
};

// SECURITY: Detect token reuse (possible theft)
// If a replaced token is used again, revoke entire token family
refreshTokenSchema.statics.detectReuse = async function(tokenDoc, ipAddress) {
  // If this token has been replaced, it's being reused
  if (tokenDoc.replacedByToken) {
    // SECURITY BREACH: Token reuse detected - revoke entire family
    await this.updateMany(
      {
        tokenFamily: tokenDoc.tokenFamily,
        isRevoked: false
      },
      {
        $set: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedByIp: ipAddress,
          revokedReason: 'Token reuse detected - possible theft'
        }
      }
    );

    return true; // Reuse detected
  }

  return false; // No reuse
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
