const mongoose = require('mongoose');

const coachingSessionSchema = new mongoose.Schema({
  // Agent this coaching is for
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    index: true
  },

  // User who generated the coaching
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Period configuration
  period: {
    weeks: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }
  },

  // Snapshot of report data at generation time
  reportData: {
    summary: {
      totalTickets: { type: Number, default: 0 },
      ticketsWithIssues: { type: Number, default: 0 },
      avgScore: { type: Number, default: 0 },
      trend: { type: String, enum: ['improving', 'declining', 'stable'], default: 'stable' },
      trendValue: { type: Number, default: 0 }
    },
    scorecardAnalysis: {
      strengths: [{
        key: String,
        name: String,
        avgScore: Number
      }],
      weaknesses: [{
        key: String,
        name: String,
        avgScore: Number
      }]
    },
    topIssueCategories: [{
      name: String,
      count: Number,
      avgScore: Number
    }],
    severityGroups: {
      critical: [{
        ticketId: String,
        _id: mongoose.Schema.Types.ObjectId,
        score: Number,
        categories: [String],
        gradedDate: Date,
        feedbackPreview: String
      }],
      bad: [{
        ticketId: String,
        _id: mongoose.Schema.Types.ObjectId,
        score: Number,
        categories: [String],
        gradedDate: Date,
        feedbackPreview: String
      }],
      moderate: [{
        ticketId: String,
        _id: mongoose.Schema.Types.ObjectId,
        score: Number,
        categories: [String],
        gradedDate: Date,
        feedbackPreview: String
      }]
    },
    suggestedActions: [String]
  },

  // Personal notes by the QA manager
  notes: {
    type: String,
    default: ''
  },

  // Status tracking
  status: {
    type: String,
    enum: ['new', 'in_progress', 'completed'],
    default: 'new'
  },

  // Sharing functionality - share with QA graders (Users)
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Timestamps for when session was created/updated
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
coachingSessionSchema.index({ generatedBy: 1, createdAt: -1 });
coachingSessionSchema.index({ agent: 1, createdAt: -1 });
coachingSessionSchema.index({ 'sharedWith.userId': 1, createdAt: -1 });
coachingSessionSchema.index({ status: 1 });

// Virtual for checking if session is shared
coachingSessionSchema.virtual('isShared').get(function() {
  return this.sharedWith && this.sharedWith.length > 0;
});

// Method to check if user (QA grader) has access - only owner can access
coachingSessionSchema.methods.hasAccess = function(userId) {
  return this.generatedBy.toString() === userId.toString();
};

module.exports = mongoose.model('CoachingSession', coachingSessionSchema);
