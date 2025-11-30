const mongoose = require('mongoose');

// Schema for component status history
const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['operational', 'degraded', 'partial_outage', 'major_outage'],
    required: true
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reason: String
}, {
  timestamps: true
});

// Main SystemComponent schema
const systemComponentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Component name is required'],
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['operational', 'degraded', 'partial_outage', 'major_outage'],
    default: 'operational'
  },
  order: {
    type: Number,
    default: 0
  },
  group: {
    type: String,
    trim: true,
    default: 'Core Services'
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  statusHistory: [statusHistorySchema],
  // Link to current affecting issues
  activeIssues: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Issue'
  }]
}, {
  timestamps: true
});

// Index for efficient queries
systemComponentSchema.index({ order: 1, group: 1 });
systemComponentSchema.index({ status: 1 });

// Method to update status
systemComponentSchema.methods.updateStatus = function(newStatus, userId, reason = '') {
  if (this.status !== newStatus) {
    this.statusHistory.push({
      status: newStatus,
      changedBy: userId,
      reason
    });
    this.status = newStatus;
  }
  return this.save();
};

// Static method to get all visible components grouped
systemComponentSchema.statics.getGroupedComponents = async function() {
  const components = await this.find({ isVisible: true })
    .sort({ group: 1, order: 1 })
    .populate('activeIssues', 'title severity status');

  // Group by category
  const grouped = {};
  components.forEach(comp => {
    if (!grouped[comp.group]) {
      grouped[comp.group] = [];
    }
    grouped[comp.group].push(comp);
  });

  return grouped;
};

// Static method to calculate overall system status
systemComponentSchema.statics.getOverallStatus = async function() {
  const components = await this.find({ isVisible: true });

  if (components.length === 0) return 'operational';

  const hasOutage = components.some(c => c.status === 'major_outage');
  const hasPartialOutage = components.some(c => c.status === 'partial_outage');
  const hasDegraded = components.some(c => c.status === 'degraded');

  if (hasOutage) return 'major_outage';
  if (hasPartialOutage) return 'partial_outage';
  if (hasDegraded) return 'degraded';
  return 'operational';
};

// Ensure virtuals are included in JSON
systemComponentSchema.set('toJSON', { virtuals: true });
systemComponentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SystemComponent', systemComponentSchema);
