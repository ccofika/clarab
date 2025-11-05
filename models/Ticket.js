const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: [true, 'Agent is required']
  },
  ticketId: {
    type: String,
    required: [true, 'Ticket ID is required'],
    trim: true,
    unique: true,
    maxlength: [100, 'Ticket ID cannot exceed 100 characters']
  },
  shortDescription: {
    type: String,
    trim: true,
    maxlength: [500, 'Short description cannot exceed 500 characters']
  },
  status: {
    type: String,
    enum: ['Selected', 'Graded'],
    default: 'Selected'
  },
  dateEntered: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true
  },
  feedback: {
    type: String,
    trim: true
  },
  qualityScorePercent: {
    type: Number,
    min: [0, 'Quality score cannot be less than 0'],
    max: [100, 'Quality score cannot exceed 100']
  },
  lastModified: {
    type: Date,
    default: Date.now
  },
  gradedDate: {
    type: Date
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedDate: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for performance
ticketSchema.index({ agent: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ dateEntered: -1 });
ticketSchema.index({ isArchived: 1 });
ticketSchema.index({ ticketId: 1 });
ticketSchema.index({ createdBy: 1 });
ticketSchema.index({ agent: 1, status: 1 });
ticketSchema.index({ agent: 1, isArchived: 1 });
ticketSchema.index({ createdBy: 1, isArchived: 1 }); // For user-specific ticket queries
ticketSchema.index({ createdBy: 1, agent: 1, isArchived: 1 }); // For user-agent-archived queries

// Pre-save middleware to update lastModified and set gradedDate
ticketSchema.pre('save', function(next) {
  this.lastModified = new Date();

  // If status is being changed to 'Graded' and gradedDate is not set, set it now
  if (this.isModified('status') && this.status === 'Graded' && !this.gradedDate) {
    this.gradedDate = new Date();
  }

  next();
});

// Method to get quality grade
ticketSchema.methods.getQualityGrade = function() {
  if (!this.qualityScorePercent) return null;

  const score = this.qualityScorePercent;
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
};

// Static method to get tickets by week
ticketSchema.statics.getTicketsByWeek = function(startDate, endDate) {
  return this.find({
    dateEntered: {
      $gte: startDate,
      $lte: endDate
    },
    isArchived: false
  }).populate('agent', 'name');
};

module.exports = mongoose.model('Ticket', ticketSchema);
