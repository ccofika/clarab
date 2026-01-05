const mongoose = require('mongoose');

const scrapeSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  csvFileName: {
    type: String,
    required: true
  },
  totalConversations: {
    type: Number,
    default: 0
  },
  scrapedCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  failedIds: [{
    type: String
  }],
  errorMessage: {
    type: String
  },
  weekNumber: {
    type: Number,
    index: true
  },
  weekYear: {
    type: Number,
    index: true
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
scrapeSessionSchema.index({ user: 1, createdAt: -1 });
scrapeSessionSchema.index({ user: 1, status: 1 });
scrapeSessionSchema.index({ agent: 1, status: 1 });
scrapeSessionSchema.index({ weekNumber: 1, weekYear: 1 });

// Calculate week number before saving
scrapeSessionSchema.pre('save', function(next) {
  if (this.isNew && !this.weekNumber) {
    const date = new Date();
    this.weekNumber = getWeekNumber(date);
    this.weekYear = date.getFullYear();
  }
  next();
});

// Helper function to get ISO week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Virtual for progress percentage
scrapeSessionSchema.virtual('progress').get(function() {
  if (this.totalConversations === 0) return 0;
  return Math.round(((this.scrapedCount + this.failedCount) / this.totalConversations) * 100);
});

// Ensure virtuals are included in JSON
scrapeSessionSchema.set('toJSON', { virtuals: true });
scrapeSessionSchema.set('toObject', { virtuals: true });

// Static method to get sessions by user with pagination
scrapeSessionSchema.statics.getByUser = function(userId, options = {}) {
  const { page = 1, limit = 20, status } = options;
  const query = { user: userId };
  if (status) query.status = status;

  return this.find(query)
    .populate('agent', 'name team')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to get running sessions count
scrapeSessionSchema.statics.getRunningCount = function(userId) {
  return this.countDocuments({ user: userId, status: 'running' });
};

module.exports = mongoose.model('ScrapeSession', scrapeSessionSchema);
