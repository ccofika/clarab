const mongoose = require('mongoose');

const bugReportSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Reporter is required']
  },
  reporterEmail: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  currentPage: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for performance
bugReportSchema.index({ reportedBy: 1 });
bugReportSchema.index({ status: 1 });
bugReportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BugReport', bugReportSchema);
