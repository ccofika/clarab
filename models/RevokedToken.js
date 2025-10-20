const mongoose = require('mongoose');

/**
 * SECURITY: Revoked JWT Tokens Model
 *
 * Two-tier revocation strategy:
 * 1. Individual token revocation (logout) - stores jti
 * 2. User-level revocation (password change) - uses User.tokenValidAfter
 *
 * Why both?
 * - Logout: Revoke single token immediately
 * - Password change: Revoke ALL user's tokens (even unknown ones)
 *
 * TTL Index: Auto-deletes expired entries to keep collection small
 */

const revokedTokenSchema = new mongoose.Schema({
  // JWT ID (jti claim from token)
  jti: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // User who owned this token
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Revocation reason
  reason: {
    type: String,
    enum: [
      'logout',
      'password_changed',
      'security_incident',
      'admin_revoked',
      'account_deleted'
    ],
    required: true
  },
  // IP that triggered revocation
  revokedByIp: {
    type: String
  },
  // Token issued at (from JWT iat claim)
  issuedAt: {
    type: Date,
    required: true
  },
  // Token expiry (from JWT exp claim) - used for TTL
  expiresAt: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true // Adds createdAt (= revokedAt)
});

// TTL Index: Auto-delete after token expires anyway
// Keeps collection small (only active revocations)
revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// SECURITY: Revoke single token (logout)
revokedTokenSchema.statics.revokeToken = async function(jti, userId, issuedAt, expiresAt, reason, ipAddress = null) {
  try {
    await this.create({
      jti,
      user: userId,
      reason,
      revokedByIp: ipAddress,
      issuedAt: new Date(issuedAt * 1000), // Convert Unix timestamp to Date
      expiresAt: new Date(expiresAt * 1000)
    });
    return true;
  } catch (error) {
    // Ignore duplicate key errors (token already revoked)
    if (error.code === 11000) {
      return true;
    }
    throw error;
  }
};

// SECURITY: Check if token is revoked
revokedTokenSchema.statics.isRevoked = async function(jti) {
  const count = await this.countDocuments({ jti });
  return count > 0;
};

// SECURITY: Revoke all tokens for user (password change)
// This doesn't add to blacklist (too many unknown tokens)
// Instead, we update User.tokenValidAfter timestamp
// Auth middleware will check: token.iat < user.tokenValidAfter → rejected
revokedTokenSchema.statics.revokeAllForUser = async function(userId, reason, ipAddress = null) {
  const User = require('./User');

  // Set tokenValidAfter to NOW
  // All tokens issued BEFORE now are invalid
  await User.findByIdAndUpdate(userId, {
    $set: {
      tokenValidAfter: new Date()
    }
  });

  // Log this action for audit trail
  const logger = require('../utils/logger');
  logger.security('all_tokens_revoked', {
    userId,
    reason,
    ipAddress,
    timestamp: new Date()
  });

  return true;
};

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
