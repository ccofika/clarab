const mongoose = require('mongoose');

/**
 * SECURITY: Configurable Security Settings
 *
 * Allows developers to adjust security parameters without code changes
 * Settings stored in database (single document, singleton pattern)
 */

const securitySettingsSchema = new mongoose.Schema({
  // JWT Settings
  jwt: {
    accessTokenExpiry: {
      type: String,
      default: '15m',
      enum: ['5m', '15m', '30m', '1h']
    },
    refreshTokenExpiry: {
      type: Number, // Days
      default: 7,
      min: 1,
      max: 30
    },
    algorithm: {
      type: String,
      default: 'HS256',
      enum: ['HS256', 'HS384', 'HS512']
    }
  },

  // Account Lockout Settings
  accountLockout: {
    maxLoginAttempts: {
      type: Number,
      default: 5,
      min: 3,
      max: 10
    },
    lockDuration: {
      type: Number, // Minutes
      default: 30,
      min: 5,
      max: 120
    }
  },

  // Password Policy
  passwordPolicy: {
    minLength: {
      type: Number,
      default: 8,
      min: 6,
      max: 20
    },
    requireUppercase: {
      type: Boolean,
      default: true
    },
    requireLowercase: {
      type: Boolean,
      default: true
    },
    requireNumbers: {
      type: Boolean,
      default: true
    },
    requireSpecialChars: {
      type: Boolean,
      default: true
    },
    bcryptRounds: {
      type: Number,
      default: 10,
      min: 10,
      max: 14
    }
  },

  // Cookie Settings
  cookies: {
    sameSite: {
      type: String,
      default: 'strict',
      enum: ['strict', 'lax', 'none']
    },
    httpOnly: {
      type: Boolean,
      default: true
    },
    secure: {
      type: String,
      default: 'production', // 'always', 'production', 'never'
      enum: ['always', 'production', 'never']
    },
    useHostPrefix: {
      type: Boolean,
      default: false // True in production
    }
  },

  // Rate Limiting
  rateLimiting: {
    loginMaxAttempts: {
      type: Number,
      default: 50,
      min: 10,
      max: 100
    },
    loginWindowMinutes: {
      type: Number,
      default: 15,
      min: 5,
      max: 60
    },
    registerMaxAttempts: {
      type: Number,
      default: 10,
      min: 5,
      max: 50
    },
    registerWindowMinutes: {
      type: Number,
      default: 60,
      min: 15,
      max: 120
    }
  },

  // Token Revocation
  tokenRevocation: {
    enableBlacklist: {
      type: Boolean,
      default: true
    },
    enableUserLevelRevocation: {
      type: Boolean,
      default: true
    },
    revokeOnPasswordChange: {
      type: Boolean,
      default: true
    }
  },

  // Last updated
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Singleton pattern - only one settings document
securitySettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();

  if (!settings) {
    // Create default settings if none exist
    settings = await this.create({});
  }

  return settings;
};

// Update settings
securitySettingsSchema.statics.updateSettings = async function(updates, userId) {
  let settings = await this.findOne();

  if (!settings) {
    settings = await this.create({ lastUpdatedBy: userId });
  }

  // Merge updates
  Object.keys(updates).forEach(key => {
    if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
      settings[key] = { ...settings[key].toObject(), ...updates[key] };
    } else {
      settings[key] = updates[key];
    }
  });

  settings.lastUpdatedBy = userId;
  await settings.save();

  return settings;
};

module.exports = mongoose.model('SecuritySettings', securitySettingsSchema);
