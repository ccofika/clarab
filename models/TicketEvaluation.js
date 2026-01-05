const mongoose = require('mongoose');

/**
 * TicketEvaluation Schema - AuditReport format za AI evaluaciju tiketa
 * Prema specifikaciji AI-knowledge-builder-rules.md
 */

// Finding objekat - pojedinačni nalaz iz evaluacije
const findingSchema = new mongoose.Schema({
  // Tip nalaza
  type: {
    type: String,
    enum: ['violation', 'potential_violation', 'improvement', 'note', 'positive'],
    required: true
  },

  // Ozbiljnost
  severity: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low'],
    required: true
  },

  // Referenca na pravilo
  rule_id: String,
  rule_title: String,
  rule_text_excerpt: String,
  rule_location: {
    source_name: String,
    page: Number,
    section: String
  },

  // Evidence iz tiketa
  ticket_evidence: [{
    message_id: String,
    speaker: {
      type: String,
      enum: ['user', 'agent', 'system']
    },
    excerpt: String,
    timestamp: Date
  }],

  // Objašnjenje i preporuka
  explanation: {
    type: String,
    required: true
  },
  recommended_fix: String,

  // Verification polja (za potential_violation)
  verification_needed: {
    type: Boolean,
    default: false
  },
  what_to_verify: String,    // konkretno šta proveriti
  why_uncertain: String,      // zašto AI nije siguran

  // QA review
  qa_reviewed: {
    type: Boolean,
    default: false
  },
  qa_override: {
    type: String,
    enum: ['confirmed', 'dismissed', 'modified', null],
    default: null
  },
  qa_notes: String,
  qa_reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  qa_reviewed_at: Date
}, { _id: true });

// TicketFacts - činjenice iz internog alata
const ticketFactsSchema = new mongoose.Schema({
  account_auth_method: {
    type: String,
    enum: ['email_password', 'google', 'apple', 'facebook', 'unknown'],
    default: 'unknown'
  },
  has_password: {
    type: String,
    enum: ['true', 'false', 'unknown'],
    default: 'unknown'
  },
  email_verified: {
    type: String,
    enum: ['true', 'false', 'unknown'],
    default: 'unknown'
  },
  phone_verified: {
    type: String,
    enum: ['true', 'false', 'unknown'],
    default: 'unknown'
  },
  two_fa_enabled: {
    type: String,
    enum: ['true', 'false', 'unknown'],
    default: 'unknown'
  },
  account_restriction_state: {
    type: String,
    enum: ['none', 'self_excluded', 'cooling_off', 'limited', 'suspended', 'unknown'],
    default: 'unknown'
  },
  region_flags: [String],
  kyc_state: {
    type: String,
    enum: ['none', 'pending', 'verified', 'rejected', 'unknown'],
    default: 'unknown'
  },
  withdrawal_state: {
    type: String,
    enum: ['none', 'pending', 'reversed', 'failed', 'unknown'],
    default: 'unknown'
  },
  payment_method_type: {
    type: String,
    enum: ['crypto', 'card', 'bank', 'unknown'],
    default: 'unknown'
  },
  device_context: {
    type: String,
    enum: ['web', 'android', 'ios', 'unknown'],
    default: 'unknown'
  },
  risk_flags: [String],
  internal_checks_available: [String],
  // Custom fields za specifične use case-ove
  custom: mongoose.Schema.Types.Mixed
}, { _id: false });

// Agent akcije
const agentActionsSchema = new mongoose.Schema({
  macros_used: [String],
  links_sent: [String],
  tags_applied: [String],
  internal_checks_performed: [String]
}, { _id: false });

// Token usage za praćenje troškova
const tokenUsageSchema = new mongoose.Schema({
  prompt_tokens: Number,
  completion_tokens: Number,
  total_tokens: Number,
  estimated_cost: Number  // u USD
}, { _id: false });

// Main TicketEvaluation Schema
const ticketEvaluationSchema = new mongoose.Schema({
  // Referenca na tiket
  ticket_id: {
    type: String,
    required: true,
    index: true
  },
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ScrapedConversation'
  },
  scrapeSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ScrapeSession',
    index: true
  },

  // Agent info
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    index: true
  },
  agent_name: String,

  // Klasifikacija tiketa
  category: {
    type: String,
    index: true
  },
  subcategory: String,
  risk_level: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },

  // Ukupni status evaluacije
  overall_status: {
    type: String,
    enum: ['pass', 'fail', 'needs_review'],
    required: true,
    index: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },

  // Nalazi
  findings: [findingSchema],

  // Statistika nalaza
  findings_summary: {
    total: { type: Number, default: 0 },
    violations: { type: Number, default: 0 },
    potential_violations: { type: Number, default: 0 },
    improvements: { type: Number, default: 0 },
    positives: { type: Number, default: 0 },
    critical_count: { type: Number, default: 0 },
    high_count: { type: Number, default: 0 }
  },

  // Input podaci
  ticket_facts: ticketFactsSchema,
  agent_actions: agentActionsSchema,

  // Retrieved rules (za debugging i transparency)
  retrieved_rules: [{
    rule_id: String,
    title: String,
    similarity: Number,
    source: String  // 'semantic' ili 'mandatory_tag'
  }],

  // Guardrail findings (pre-AI checks)
  guardrail_findings: [{
    type: String,
    rule_triggered: String,
    description: String
  }],

  // AI model info
  model_used: {
    type: String,
    default: 'gpt-5-nano'
  },
  token_usage: tokenUsageSchema,

  // Timing
  evaluation_started_at: Date,
  evaluation_completed_at: Date,
  evaluation_duration_ms: Number,

  // QA workflow
  qa_status: {
    type: String,
    enum: ['pending', 'in_review', 'approved', 'rejected', 'imported'],
    default: 'pending',
    index: true
  },
  qa_reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  qa_reviewed_at: Date,
  qa_notes: String,

  // Import u QA session
  imported: {
    type: Boolean,
    default: false,
    index: true
  },
  imported_to_session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QASession'
  },
  imported_at: Date,
  imported_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Metadata
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound indexes
ticketEvaluationSchema.index({ scrapeSession: 1, overall_status: 1 });
ticketEvaluationSchema.index({ agent: 1, overall_status: 1 });
ticketEvaluationSchema.index({ category: 1, overall_status: 1 });
ticketEvaluationSchema.index({ qa_status: 1, imported: 1 });
ticketEvaluationSchema.index({ createdAt: -1 });

// Pre-save: izračunaj findings_summary
ticketEvaluationSchema.pre('save', function(next) {
  if (this.findings && this.findings.length > 0) {
    this.findings_summary = {
      total: this.findings.length,
      violations: this.findings.filter(f => f.type === 'violation').length,
      potential_violations: this.findings.filter(f => f.type === 'potential_violation').length,
      improvements: this.findings.filter(f => f.type === 'improvement').length,
      positives: this.findings.filter(f => f.type === 'positive').length,
      critical_count: this.findings.filter(f => f.severity === 'critical').length,
      high_count: this.findings.filter(f => f.severity === 'high').length
    };
  }
  next();
});

// Static: Get evaluations by session with stats
ticketEvaluationSchema.statics.getBySession = async function(sessionId, options = {}) {
  const { status, limit = 50, page = 1 } = options;

  const query = { scrapeSession: sessionId };
  if (status) query.overall_status = status;

  return this.find(query)
    .populate('agent', 'name')
    .populate('conversation', 'conversationId')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static: Get session stats
ticketEvaluationSchema.statics.getSessionStats = async function(sessionId) {
  const stats = await this.aggregate([
    { $match: { scrapeSession: new mongoose.Types.ObjectId(sessionId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pass: { $sum: { $cond: [{ $eq: ['$overall_status', 'pass'] }, 1, 0] } },
        fail: { $sum: { $cond: [{ $eq: ['$overall_status', 'fail'] }, 1, 0] } },
        needs_review: { $sum: { $cond: [{ $eq: ['$overall_status', 'needs_review'] }, 1, 0] } },
        imported: { $sum: { $cond: ['$imported', 1, 0] } },
        total_violations: { $sum: '$findings_summary.violations' },
        total_potential: { $sum: '$findings_summary.potential_violations' },
        avg_confidence: { $avg: '$confidence' }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    pass: 0,
    fail: 0,
    needs_review: 0,
    imported: 0,
    total_violations: 0,
    total_potential: 0,
    avg_confidence: 0
  };
};

// Static: Get category breakdown
ticketEvaluationSchema.statics.getCategoryBreakdown = async function(sessionId) {
  return this.aggregate([
    { $match: { scrapeSession: new mongoose.Types.ObjectId(sessionId) } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        pass: { $sum: { $cond: [{ $eq: ['$overall_status', 'pass'] }, 1, 0] } },
        fail: { $sum: { $cond: [{ $eq: ['$overall_status', 'fail'] }, 1, 0] } }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

module.exports = mongoose.model('TicketEvaluation', ticketEvaluationSchema);
