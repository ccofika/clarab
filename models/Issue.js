const mongoose = require('mongoose');

// Schema for issue updates/timeline entries
const issueUpdateSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true
  },
  statusChange: {
    from: {
      type: String,
      enum: ['reported', 'investigating', 'identified', 'monitoring', 'resolved']
    },
    to: {
      type: String,
      enum: ['reported', 'investigating', 'identified', 'monitoring', 'resolved']
    }
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  images: [{
    url: String,
    publicId: String, // Cloudinary ID
    caption: String
  }]
}, {
  timestamps: true
});

// Main Issue schema
const issueSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Issue title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Issue description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  status: {
    type: String,
    enum: ['reported', 'investigating', 'identified', 'monitoring', 'resolved'],
    default: 'reported'
  },
  severity: {
    type: String,
    enum: ['critical', 'major', 'minor'],
    default: 'minor'
  },
  affectedAreas: [{
    type: String,
    trim: true
  }],
  images: [{
    url: String,
    publicId: String, // Cloudinary ID
    caption: String
  }],
  updates: [issueUpdateSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Link to affected system components
  affectedComponents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SystemComponent'
  }],
  // Postmortem / Root Cause Analysis
  postmortem: {
    summary: {
      type: String,
      maxlength: [10000, 'Postmortem summary cannot exceed 10000 characters']
    },
    rootCause: {
      type: String,
      maxlength: [5000, 'Root cause cannot exceed 5000 characters']
    },
    impact: {
      type: String,
      maxlength: [2000, 'Impact description cannot exceed 2000 characters']
    },
    timeline: {
      type: String,
      maxlength: [5000, 'Timeline cannot exceed 5000 characters']
    },
    lessonsLearned: {
      type: String,
      maxlength: [5000, 'Lessons learned cannot exceed 5000 characters']
    },
    preventiveMeasures: {
      type: String,
      maxlength: [5000, 'Preventive measures cannot exceed 5000 characters']
    },
    createdAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isPublished: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
issueSchema.index({ status: 1, createdAt: -1 });
issueSchema.index({ severity: 1 });
issueSchema.index({ createdAt: -1 });

// Text index for search functionality
issueSchema.index({
  title: 'text',
  description: 'text',
  'updates.message': 'text',
  affectedAreas: 'text'
}, {
  weights: {
    title: 10,
    description: 5,
    'updates.message': 3,
    affectedAreas: 2
  },
  name: 'issue_text_search'
});

// Virtual for checking if issue is active
issueSchema.virtual('isActive').get(function() {
  return this.status !== 'resolved';
});

// Virtual for latest update
issueSchema.virtual('latestUpdate').get(function() {
  if (this.updates && this.updates.length > 0) {
    return this.updates[this.updates.length - 1];
  }
  return null;
});

// Virtual for update count
issueSchema.virtual('updateCount').get(function() {
  return this.updates ? this.updates.length : 0;
});

// Method to add an update
issueSchema.methods.addUpdate = function(message, authorId, statusChange = null, images = []) {
  const update = {
    message,
    author: authorId,
    images
  };

  if (statusChange) {
    update.statusChange = {
      from: this.status,
      to: statusChange
    };
    this.status = statusChange;

    // Set resolved info if resolving
    if (statusChange === 'resolved') {
      this.resolvedAt = new Date();
      this.resolvedBy = authorId;
    }
  }

  this.updates.push(update);
  return this.save();
};

// Static method to get active issues
issueSchema.statics.getActiveIssues = function() {
  return this.find({ status: { $ne: 'resolved' } })
    .sort({ severity: 1, createdAt: -1 }) // Critical first, then by date
    .populate('createdBy', 'name email avatar')
    .populate('updates.author', 'name email avatar');
};

// Static method to get resolved issues
issueSchema.statics.getResolvedIssues = function(limit = 20) {
  return this.find({ status: 'resolved' })
    .sort({ resolvedAt: -1 })
    .limit(limit)
    .populate('createdBy', 'name email avatar')
    .populate('resolvedBy', 'name email avatar')
    .populate('updates.author', 'name email avatar');
};

// Static method for text search
issueSchema.statics.searchIssues = function(query, showResolved = false) {
  const filter = {
    $text: { $search: query }
  };

  // Filter by status based on tab
  if (showResolved) {
    // Resolved tab: only show resolved issues
    filter.status = 'resolved';
  } else {
    // Active tab: exclude resolved issues
    filter.status = { $ne: 'resolved' };
  }

  return this.find(filter, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .populate('createdBy', 'name email avatar')
    .populate('updates.author', 'name email avatar');
};

// Ensure virtuals are included in JSON
issueSchema.set('toJSON', { virtuals: true });
issueSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Issue', issueSchema);
