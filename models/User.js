const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email) {
        return email.endsWith('@mebit.io');
      },
      message: 'Only @mebit.io email addresses are allowed'
    }
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password not required if user signed up with Google
    },
    minlength: [8, 'Password must be at least 8 characters long']
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  googleAccessToken: {
    type: String
  },
  googleRefreshToken: {
    type: String
  },
  // Slack OAuth fields
  slackAccessToken: {
    type: String
  },
  slackUserId: {
    type: String,
    sparse: true
  },
  slackTeamId: {
    type: String
  },
  slackTeamName: {
    type: String
  },
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  tutorialCompleted: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'developer', 'qa', 'qa-admin'],
    default: 'user'
  },
  // Page permissions - which pages/subpages user can access
  // If empty/undefined, user has access based on their role
  // Only set explicit values when you want to OVERRIDE role-based defaults
  // true = explicitly granted, false = explicitly denied, undefined = use role-based default
  pagePermissions: {
    type: Object,
    default: undefined
  },
  workspacePreferences: {
    type: Map,
    of: {
      viewMode: {
        type: String,
        enum: ['edit', 'view', 'post-view'],
        default: 'edit'
      },
      lastAccessedElement: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CanvasElement'
      },
      lastAccessedAt: {
        type: Date
      }
    },
    default: new Map()
  },
  favoriteWorkspaces: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  }],
  recentWorkspaces: [{
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace'
    },
    lastAccessed: {
      type: Date,
      default: Date.now
    }
  }],
  // Starred chat channels
  starredChannels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatChannel'
  }],
  // Muted chat channels with expiration
  mutedChannels: [{
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatChannel',
      required: true
    },
    mutedUntil: {
      type: Date,
      default: null // null = muted forever
    },
    mutedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Per-channel notification settings
  channelNotificationSettings: [{
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatChannel',
      required: true
    },
    // 'all' = all messages, 'mentions' = only @mentions, 'nothing' = no notifications
    notifyOn: {
      type: String,
      enum: ['all', 'mentions', 'nothing'],
      default: 'all'
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Account lockout fields
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  // SECURITY: JWT token invalidation timestamp
  // All tokens issued BEFORE this timestamp are considered invalid
  // Used for: password change, security incidents, force logout
  tokenValidAfter: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Virtual for checking if account is locked
userSchema.virtual('isLocked').get(function() {
  // Check if lockUntil exists and is in the future
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Constants for account lockout
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 30 * 60 * 1000; // 30 minutes in milliseconds

// SECURITY: Atomic increment of login attempts with race condition protection
// This method uses MongoDB's atomic operations to prevent concurrent requests
// from bypassing the account lockout mechanism
userSchema.methods.incLoginAttempts = async function() {
  const userId = this._id;

  // SECURITY: Use findOneAndUpdate with atomic operations to prevent race conditions
  // Multiple concurrent login attempts cannot bypass the lockout counter

  // Step 1: Try to increment if lock has expired (atomic reset)
  const expiredLockUpdate = await this.model('User').findOneAndUpdate(
    {
      _id: userId,
      lockUntil: { $exists: true, $lt: new Date() } // Lock expired
    },
    {
      $set: { loginAttempts: 1 }, // Reset to 1 (this failed attempt)
      $unset: { lockUntil: 1 }     // Remove lock
    },
    { new: true }
  );

  if (expiredLockUpdate) {
    // Successfully reset expired lock
    return expiredLockUpdate;
  }

  // Step 2: Increment attempts ONLY if not already at max (prevents over-counting)
  const incrementResult = await this.model('User').findOneAndUpdate(
    {
      _id: userId,
      loginAttempts: { $lt: MAX_LOGIN_ATTEMPTS }, // Only increment if below max
      $or: [
        { lockUntil: { $exists: false } },           // Not locked
        { lockUntil: { $lt: new Date() } }           // Lock expired (backup check)
      ]
    },
    {
      $inc: { loginAttempts: 1 } // Atomic increment
    },
    { new: true }
  );

  if (!incrementResult) {
    // Already at max attempts or locked - do nothing
    return await this.model('User').findById(userId);
  }

  // Step 3: If we just hit MAX attempts, apply lock atomically
  if (incrementResult.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    const lockResult = await this.model('User').findOneAndUpdate(
      {
        _id: userId,
        loginAttempts: { $gte: MAX_LOGIN_ATTEMPTS },
        $or: [
          { lockUntil: { $exists: false } },     // Not yet locked
          { lockUntil: { $lt: new Date() } }     // Lock expired
        ]
      },
      {
        $set: { lockUntil: new Date(Date.now() + LOCK_TIME) }
      },
      { new: true }
    );

    return lockResult || incrementResult;
  }

  return incrementResult;
};

// SECURITY: Atomic reset of login attempts after successful login
userSchema.methods.resetLoginAttempts = function() {
  return this.model('User').findOneAndUpdate(
    { _id: this._id },
    {
      $set: { loginAttempts: 0 },
      $unset: { lockUntil: 1 }
    },
    { new: true }
  );
};

// Reload user data from database (used after incrementing attempts)
userSchema.methods.reload = async function() {
  const fresh = await this.model('User').findById(this._id);
  if (fresh) {
    Object.assign(this, fresh.toObject());
  }
  return this;
};

// SECURITY: Atomic unlock account (for admin use)
userSchema.statics.unlockAccount = async function(userId) {
  const user = await this.findOneAndUpdate(
    { _id: userId },
    {
      $set: { loginAttempts: 0 },
      $unset: { lockUntil: 1 }
    },
    { new: true }
  );

  if (!user) {
    throw new Error('User not found');
  }

  return user;
};

// Enum for login failure reasons
userSchema.statics.failedLogin = {
  NOT_FOUND: 0,
  PASSWORD_INCORRECT: 1,
  MAX_ATTEMPTS: 2
};

module.exports = mongoose.model('User', userSchema);
