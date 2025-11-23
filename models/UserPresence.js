const mongoose = require('mongoose');

const userPresenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'away', 'dnd'], // active, away, do not disturb
    default: 'away'
  },
  customStatus: {
    text: {
      type: String,
      maxlength: 100
    },
    emoji: {
      type: String,
      maxlength: 10
    },
    expiresAt: {
      type: Date
    }
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  isOnline: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
userPresenceSchema.index({ userId: 1, isOnline: 1 });
userPresenceSchema.index({ lastActiveAt: 1 });

// Method to set user as active
userPresenceSchema.methods.setActive = function() {
  this.status = 'active';
  this.isOnline = true;
  this.lastActiveAt = new Date();
  return this.save();
};

// Method to set user as away
userPresenceSchema.methods.setAway = function() {
  this.status = 'away';
  this.isOnline = false;
  return this.save();
};

// Method to set user as DND
userPresenceSchema.methods.setDND = function() {
  this.status = 'dnd';
  this.isOnline = true; // DND users are online but don't want notifications
  this.lastActiveAt = new Date();
  return this.save();
};

// Static method to clean up expired custom statuses
userPresenceSchema.statics.cleanExpiredStatuses = async function() {
  const now = new Date();
  return this.updateMany(
    { 'customStatus.expiresAt': { $lt: now } },
    { $unset: { customStatus: '' } }
  );
};

// Auto-cleanup expired custom statuses every hour
if (mongoose.connection.readyState === 1) {
  setInterval(async () => {
    try {
      await mongoose.model('UserPresence').cleanExpiredStatuses();
    } catch (error) {
      console.error('Error cleaning expired statuses:', error);
    }
  }, 60 * 60 * 1000); // Run every hour
}

module.exports = mongoose.model('UserPresence', userPresenceSchema);
