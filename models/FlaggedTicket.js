const mongoose = require('mongoose');

/**
 * Flagged Ticket Schema
 * Stores tickets that have been evaluated by AI
 */

const flaggedTicketSchema = new mongoose.Schema({
  // Reference to the scraped conversation
  scrapedConversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ScrapedConversation',
    required: true
  },
  // Reference to the scrape session
  scrapeSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ScrapeSession',
    required: true,
    index: true
  },
  // Intercom conversation ID
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  // Agent being evaluated
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    index: true
  },
  // AI evaluation results
  evaluation: {
    // Overall flag: 'good' or 'bad'
    flag: {
      type: String,
      enum: ['good', 'bad', 'needs_review'],
      required: true
    },
    // Confidence score (0-100)
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    // Detected category
    category: {
      type: String,
      required: true
    },
    // Detected subcategory
    subcategory: {
      type: String
    },
    // AI reasoning
    reasoning: {
      type: String
    },
    // Specific issues found (for bad tickets)
    issues: [{
      type: {
        type: String,
        enum: ['incorrect_info', 'missing_info', 'tone', 'procedure', 'other']
      },
      description: String,
      severity: {
        type: String,
        enum: ['low', 'medium', 'high']
      }
    }],
    // Positive aspects (for good tickets)
    positives: [{
      type: String
    }],
    // Suggestions for improvement
    suggestions: [{
      type: String
    }]
  },
  // QA agent review
  qaReview: {
    // Whether QA agent has reviewed
    reviewed: {
      type: Boolean,
      default: false
    },
    // QA agent's override decision
    overrideFlag: {
      type: String,
      enum: ['good', 'bad', 'needs_review', null],
      default: null
    },
    // QA agent notes
    notes: {
      type: String
    },
    // Who reviewed
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: {
      type: Date
    }
  },
  // Whether this ticket has been imported to selected tickets
  imported: {
    type: Boolean,
    default: false,
    index: true
  },
  importedAt: {
    type: Date
  },
  importedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Reference to created QASession ticket if imported
  qaSessionTicket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QASession'
  },
  // Processing status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  processingError: {
    type: String
  }
}, {
  timestamps: true
});

// Compound indexes
flaggedTicketSchema.index({ scrapeSession: 1, status: 1 });
flaggedTicketSchema.index({ agent: 1, 'evaluation.flag': 1 });
flaggedTicketSchema.index({ agent: 1, imported: 1 });
flaggedTicketSchema.index({ 'evaluation.category': 1, 'evaluation.flag': 1 });

// Static method to get flagged tickets by session
flaggedTicketSchema.statics.getBySession = function(sessionId, options = {}) {
  const { page = 1, limit = 50, flag, imported } = options;

  const query = { scrapeSession: sessionId };
  if (flag) query['evaluation.flag'] = flag;
  if (typeof imported === 'boolean') query.imported = imported;

  return this.find(query)
    .populate('agent', 'name team')
    .populate('scrapedConversation', 'conversationId messageCount')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to get stats for a session
flaggedTicketSchema.statics.getSessionStats = async function(sessionId) {
  const stats = await this.aggregate([
    { $match: { scrapeSession: new mongoose.Types.ObjectId(sessionId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        good: {
          $sum: { $cond: [{ $eq: ['$evaluation.flag', 'good'] }, 1, 0] }
        },
        bad: {
          $sum: { $cond: [{ $eq: ['$evaluation.flag', 'bad'] }, 1, 0] }
        },
        needsReview: {
          $sum: { $cond: [{ $eq: ['$evaluation.flag', 'needs_review'] }, 1, 0] }
        },
        imported: {
          $sum: { $cond: ['$imported', 1, 0] }
        },
        reviewed: {
          $sum: { $cond: ['$qaReview.reviewed', 1, 0] }
        },
        avgConfidence: { $avg: '$evaluation.confidence' }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    good: 0,
    bad: 0,
    needsReview: 0,
    imported: 0,
    reviewed: 0,
    avgConfidence: 0
  };
};

// Static method to get category breakdown
flaggedTicketSchema.statics.getCategoryBreakdown = async function(sessionId) {
  return this.aggregate([
    { $match: { scrapeSession: new mongoose.Types.ObjectId(sessionId) } },
    {
      $group: {
        _id: '$evaluation.category',
        total: { $sum: 1 },
        good: {
          $sum: { $cond: [{ $eq: ['$evaluation.flag', 'good'] }, 1, 0] }
        },
        bad: {
          $sum: { $cond: [{ $eq: ['$evaluation.flag', 'bad'] }, 1, 0] }
        }
      }
    },
    { $sort: { total: -1 } }
  ]);
};

module.exports = mongoose.model('FlaggedTicket', flaggedTicketSchema);
