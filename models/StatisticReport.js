const mongoose = require('mongoose');

/**
 * StatisticReport Model
 *
 * Represents a collection of charts (dashboard/report).
 * Each report can contain multiple charts with shared filters.
 */

const reportFilterSchema = new mongoose.Schema({
  field: {
    type: String,
    required: true
  },
  operator: {
    type: String,
    enum: [
      'equals', 'not_equals',
      'contains', 'not_contains',
      'starts_with', 'ends_with',
      'greater_than', 'greater_or_equal',
      'less_than', 'less_or_equal',
      'between',
      'in', 'not_in',
      'is_empty', 'is_not_empty',
      'is_null', 'is_not_null'
    ],
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed
  },
  valueTo: {
    type: mongoose.Schema.Types.Mixed // For 'between' operator
  },
  logic: {
    type: String,
    enum: ['AND', 'OR'],
    default: 'AND'
  }
}, { _id: false });

const filterGroupSchema = new mongoose.Schema({
  logic: {
    type: String,
    enum: ['AND', 'OR'],
    default: 'AND'
  },
  conditions: [reportFilterSchema],
  groups: [{ type: mongoose.Schema.Types.Mixed }] // Nested groups
}, { _id: false });

const statisticReportSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Report title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  visibility: {
    type: String,
    enum: ['private', 'shared', 'public'],
    default: 'private'
  },
  sharedWith: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Report-level filters (apply to all charts)
  filters: filterGroupSchema,

  // Date range configuration
  dateRange: {
    type: {
      type: String,
      enum: [
        'today', 'yesterday',
        'last7days', 'last14days', 'last30days', 'last90days',
        'thisWeek', 'lastWeek',
        'thisMonth', 'lastMonth',
        'thisQuarter', 'lastQuarter',
        'thisYear', 'lastYear',
        'all',
        'custom', 'customRelative'
      ],
      default: 'last30days'
    },
    customStart: Date,
    customEnd: Date,
    relativeDays: Number, // For customRelative
    relativeUnit: {
      type: String,
      enum: ['days', 'weeks', 'months']
    }
  },

  // Date field to use for filtering
  dateField: {
    type: String,
    enum: ['dateEntered', 'gradedDate', 'createdAt', 'updatedAt'],
    default: 'dateEntered'
  },

  // Layout configuration
  layout: {
    columns: {
      type: Number,
      default: 12
    }
  },

  // Auto refresh settings
  autoRefresh: {
    enabled: {
      type: Boolean,
      default: false
    },
    interval: {
      type: Number,
      default: 300000, // 5 minutes in ms
      min: 60000,
      max: 3600000
    }
  },

  // Sections for grouping charts
  sections: [{
    id: String,
    title: String,
    collapsed: {
      type: Boolean,
      default: false
    },
    order: Number
  }],

  // Is this a template?
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateCategory: {
    type: String,
    enum: ['cs-agent', 'qa-agent', 'quality', 'category', 'custom']
  },

  // Favorite/pinned status
  isPinned: {
    type: Boolean,
    default: false
  },

  // Last viewed timestamp
  lastViewedAt: Date

}, {
  timestamps: true
});

// Indexes
statisticReportSchema.index({ owner: 1 });
statisticReportSchema.index({ visibility: 1 });
statisticReportSchema.index({ isTemplate: 1 });
statisticReportSchema.index({ owner: 1, isPinned: -1, updatedAt: -1 });
statisticReportSchema.index({ sharedWith: 1 });

// Virtual for charts count
statisticReportSchema.virtual('chartsCount', {
  ref: 'StatisticChart',
  localField: '_id',
  foreignField: 'report',
  count: true
});

// Virtual for charts
statisticReportSchema.virtual('charts', {
  ref: 'StatisticChart',
  localField: '_id',
  foreignField: 'report',
  options: { sort: { order: 1 } }
});

// Enable virtuals in JSON
statisticReportSchema.set('toJSON', { virtuals: true });
statisticReportSchema.set('toObject', { virtuals: true });

// Static method to get user's reports
statisticReportSchema.statics.getForUser = function(userId) {
  return this.find({
    $or: [
      { owner: userId },
      { sharedWith: userId },
      { visibility: 'public' }
    ],
    isTemplate: false
  }).sort({ isPinned: -1, updatedAt: -1 });
};

// Static method to get templates
statisticReportSchema.statics.getTemplates = function() {
  return this.find({ isTemplate: true }).sort({ templateCategory: 1, title: 1 });
};

// Method to check if user can view
statisticReportSchema.methods.canView = function(userId) {
  if (this.visibility === 'public') return true;
  if (this.owner.equals(userId)) return true;
  if (this.sharedWith.some(id => id.equals(userId))) return true;
  return false;
};

// Method to check if user can edit
statisticReportSchema.methods.canEdit = function(userId) {
  return this.owner.equals(userId);
};

module.exports = mongoose.model('StatisticReport', statisticReportSchema);
