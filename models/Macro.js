const mongoose = require('mongoose');

const macroSchema = new mongoose.Schema({
  // Title of the macro (e.g., "ontario-ip-issue")
  title: {
    type: String,
    required: [true, 'Macro title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  // The feedback content (HTML - same format as ticket.feedback)
  feedback: {
    type: String,
    required: [true, 'Macro feedback content is required']
  },
  // Scorecard data per agent position
  // Keys are agent positions (e.g., 'Junior Scorecard'), values are { values: Object, variant: String|null }
  scorecardData: {
    type: Object,
    default: {}
  },
  // Categories (optional, same format as ticket.categories)
  categories: [{
    type: String,
    trim: true
  }],
  // User who created this macro (private per user)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Whether this macro is public (visible to all QA graders)
  isPublic: {
    type: Boolean,
    default: false
  },
  // Users this macro is shared with (chain tracking for cascade removal)
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  // Track which tickets have used this macro (for "used in" section)
  usedInTickets: [{
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket'
    },
    ticketNumber: String,  // e.g., "INC123456"
    usedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Usage count for sorting/analytics
  usageCount: {
    type: Number,
    default: 0
  },
  // Last time macro was used
  lastUsedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for performance
macroSchema.index({ createdBy: 1, title: 1 }); // For user's macro list with title search
macroSchema.index({ createdBy: 1, usageCount: -1 }); // For sorting by usage
macroSchema.index({ 'usedInTickets.ticketId': 1 }); // For finding macro by ticket
macroSchema.index({ isPublic: 1 }); // For finding public macros
macroSchema.index({ 'sharedWith.userId': 1 }); // For finding macros shared with user

// Text index for full-text search
macroSchema.index({ title: 'text' });

module.exports = mongoose.model('Macro', macroSchema);
