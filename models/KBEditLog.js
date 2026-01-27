const mongoose = require('mongoose');

const kbEditLogSchema = new mongoose.Schema({
  page: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KBPage',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: ['create', 'update', 'delete', 'restore', 'reorder', 'publish', 'unpublish'],
    required: true
  },
  changes: {
    before: {
      type: mongoose.Schema.Types.Mixed
    },
    after: {
      type: mongoose.Schema.Types.Mixed
    },
    summary: {
      type: String
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
kbEditLogSchema.index({ page: 1, createdAt: -1 });
kbEditLogSchema.index({ user: 1, createdAt: -1 });
kbEditLogSchema.index({ createdAt: -1 });

// Static method to log an edit
kbEditLogSchema.statics.logEdit = async function(pageId, userId, action, changes = {}) {
  return await this.create({
    page: pageId,
    user: userId,
    action,
    changes
  });
};

// Static method to get recent logs for a page
kbEditLogSchema.statics.getPageLogs = async function(pageId, limit = 50) {
  return await this.find({ page: pageId })
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

// Static method to get all recent logs
kbEditLogSchema.statics.getRecentLogs = async function(limit = 100) {
  return await this.find()
    .populate('page', 'title slug')
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('KBEditLog', kbEditLogSchema);
