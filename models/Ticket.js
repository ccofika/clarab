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
    // Note: unique constraint is now compound (ticketId + agent) - see index below
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
  },
  // AI Embedding for semantic search
  embedding: {
    type: [Number],
    select: false
  },
  embeddingOutdated: {
    type: Boolean,
    default: true
  },
  // Additional metadata for advanced filtering and search
  category: {
    type: String,
    enum: ['Technical', 'Billing', 'Account', 'General', 'Complaint', 'Feature Request', 'Bug Report', 'Other'],
    default: 'General'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  tags: [{
    type: String,
    trim: true
  }],
  weekNumber: {
    type: Number
  },
  weekYear: {
    type: Number
  }
}, {
  timestamps: true
});

// Indexes for performance
ticketSchema.index({ agent: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ dateEntered: -1 });
ticketSchema.index({ isArchived: 1 });
// Compound unique index: same ticketId can exist for different agents, but not for the same agent
ticketSchema.index({ ticketId: 1, agent: 1 }, { unique: true });
ticketSchema.index({ createdBy: 1 });
ticketSchema.index({ agent: 1, status: 1 });
ticketSchema.index({ agent: 1, isArchived: 1 });
ticketSchema.index({ createdBy: 1, isArchived: 1 }); // For user-specific ticket queries
ticketSchema.index({ createdBy: 1, agent: 1, isArchived: 1 }); // For user-agent-archived queries
ticketSchema.index({ category: 1 });
ticketSchema.index({ priority: 1 });
ticketSchema.index({ tags: 1 });
ticketSchema.index({ weekNumber: 1, weekYear: 1 });
ticketSchema.index({ qualityScorePercent: 1 });
ticketSchema.index({ gradedDate: -1 });

// Pre-save middleware to update lastModified, set gradedDate, and calculate week info
ticketSchema.pre('save', function(next) {
  this.lastModified = new Date();

  // If status is being changed to 'Graded' and gradedDate is not set, set it now
  if (this.isModified('status') && this.status === 'Graded' && !this.gradedDate) {
    this.gradedDate = new Date();
  }

  // Calculate week number and year from dateEntered
  if (this.dateEntered && (!this.weekNumber || !this.weekYear)) {
    const date = new Date(this.dateEntered);
    this.weekNumber = getWeekNumber(date);
    this.weekYear = date.getFullYear();
  }

  // Mark embedding as outdated if ticket content changes
  if (this.isModified('notes') || this.isModified('feedback') || this.isModified('shortDescription')) {
    this.embeddingOutdated = true;
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
