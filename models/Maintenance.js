const mongoose = require('mongoose');

// Schema for maintenance updates
const maintenanceUpdateSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Main Maintenance schema
const maintenanceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Maintenance title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Maintenance description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  impact: {
    type: String,
    enum: ['none', 'minor', 'major', 'critical'],
    default: 'minor'
  },
  scheduledStart: {
    type: Date,
    required: [true, 'Scheduled start time is required']
  },
  scheduledEnd: {
    type: Date,
    required: [true, 'Scheduled end time is required']
  },
  actualStart: {
    type: Date
  },
  actualEnd: {
    type: Date
  },
  affectedComponents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SystemComponent'
  }],
  updates: [maintenanceUpdateSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notifySubscribers: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
maintenanceSchema.index({ status: 1, scheduledStart: 1 });
maintenanceSchema.index({ scheduledStart: 1, scheduledEnd: 1 });

// Virtual for checking if maintenance is upcoming
maintenanceSchema.virtual('isUpcoming').get(function() {
  return this.status === 'scheduled' && new Date(this.scheduledStart) > new Date();
});

// Virtual for checking if maintenance is ongoing
maintenanceSchema.virtual('isOngoing').get(function() {
  const now = new Date();
  return this.status === 'in_progress' ||
    (this.status === 'scheduled' && now >= this.scheduledStart && now <= this.scheduledEnd);
});

// Static method to get upcoming maintenance
maintenanceSchema.statics.getUpcoming = function(limit = 5) {
  return this.find({
    status: 'scheduled',
    scheduledStart: { $gte: new Date() }
  })
    .sort({ scheduledStart: 1 })
    .limit(limit)
    .populate('affectedComponents', 'name')
    .populate('createdBy', 'name email');
};

// Static method to get active/ongoing maintenance
maintenanceSchema.statics.getActive = function() {
  const now = new Date();
  return this.find({
    status: { $in: ['scheduled', 'in_progress'] },
    scheduledStart: { $lte: now },
    scheduledEnd: { $gte: now }
  })
    .populate('affectedComponents', 'name')
    .populate('createdBy', 'name email');
};

// Static method to get past maintenance
maintenanceSchema.statics.getPast = function(limit = 10) {
  return this.find({
    $or: [
      { status: 'completed' },
      { status: 'cancelled' },
      { scheduledEnd: { $lt: new Date() } }
    ]
  })
    .sort({ scheduledEnd: -1 })
    .limit(limit)
    .populate('affectedComponents', 'name')
    .populate('createdBy', 'name email');
};

// Ensure virtuals are included in JSON
maintenanceSchema.set('toJSON', { virtuals: true });
maintenanceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Maintenance', maintenanceSchema);
