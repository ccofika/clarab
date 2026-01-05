const mongoose = require('mongoose');

/**
 * Rule Schema - Kanonski format za AI knowledge base
 * Prema specifikaciji AI-knowledge-builder-rules.md
 */

// Condition format za pravila
const conditionSchema = new mongoose.Schema({
  if: [{
    field: String,      // npr. account_auth_method
    operator: {         // equals, not_equals, contains, in, not_in
      type: String,
      enum: ['equals', 'not_equals', 'contains', 'not_contains', 'in', 'not_in', 'exists', 'not_exists'],
      default: 'equals'
    },
    value: mongoose.Schema.Types.Mixed  // string, array, boolean
  }],
  then: {
    type: String,
    required: true
  },
  else_optional: String,
  certainty: {
    type: String,
    enum: ['hard', 'soft'],  // hard = strogo se primenjuje, soft = verovatno, može tražiti verification
    default: 'hard'
  }
}, { _id: false });

// Source location za traceability
const sourceLocationSchema = new mongoose.Schema({
  source_name: String,      // PDF filename, doc name
  page: Number,
  section: String,
  paragraph_id: String,
  version_hash: String
}, { _id: false });

// Verification check
const verificationCheckSchema = new mongoose.Schema({
  check_id: String,
  description: String,
  internal_tool_action: String,  // šta treba proveriti u internom alatu
  required_when: String          // kada je ova provera potrebna
}, { _id: false });

// Main Rule Schema
const ruleSchema = new mongoose.Schema({
  // Identifikacija
  rule_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Kategorije
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QACategory',
    required: true,
    index: true
  },
  category_name: {
    type: String,
    required: true,
    index: true
  },
  subcategory: {
    type: String,
    default: ''
  },

  // Osnovne informacije
  title: {
    type: String,
    required: true
  },
  intent: {
    type: String,  // jedna rečenica - šta pravilo pokušava da postigne
    required: true
  },
  rule_text: {
    type: String,  // precizan, normativan tekst pravila
    required: true
  },

  // Proceduralni koraci (ako je workflow)
  steps: [{
    step_number: Number,
    action: String,
    note: String
  }],

  // Dozvoljene i zabranjene akcije
  allowed_actions: [String],
  disallowed_actions: [String],

  // Uslovi i izuzeci
  conditions: [conditionSchema],
  exceptions: [{
    description: String,
    when: String
  }],

  // Primeri
  examples_good: [String],
  examples_bad: [String],

  // Tagovi za hibridni retrieval
  tags: [{
    type: String,
    index: true
  }],

  // Ozbiljnost
  severity_default: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low'],
    default: 'medium'
  },

  // Evidence i verification
  evidence_requirements: {
    type: String,  // šta mora da postoji da bi se zaključilo fail
    default: ''
  },
  verification_checks: [verificationCheckSchema],

  // Source traceability
  source_location: sourceLocationSchema,

  // Metadata
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound indexes za efikasan retrieval
ruleSchema.index({ category: 1, subcategory: 1 });
ruleSchema.index({ tags: 1 });
ruleSchema.index({ severity_default: 1 });
ruleSchema.index({ 'conditions.if.field': 1 });

// Text index za full-text search
ruleSchema.index({
  title: 'text',
  intent: 'text',
  rule_text: 'text',
  'steps.action': 'text'
});

// Generiši embedding input za vector search
ruleSchema.methods.getEmbeddingInput = function() {
  const parts = [
    `Title: ${this.title}`,
    `Intent: ${this.intent}`,
    `Rule: ${this.rule_text}`
  ];

  if (this.steps && this.steps.length > 0) {
    parts.push(`Steps: ${this.steps.map(s => s.action).join('. ')}`);
  }

  if (this.conditions && this.conditions.length > 0) {
    const condText = this.conditions.map(c =>
      `If ${c.if.map(i => `${i.field} ${i.operator} ${i.value}`).join(' AND ')} then ${c.then}`
    ).join('. ');
    parts.push(`Conditions: ${condText}`);
  }

  if (this.exceptions && this.exceptions.length > 0) {
    parts.push(`Exceptions: ${this.exceptions.map(e => e.description).join('. ')}`);
  }

  if (this.examples_good && this.examples_good.length > 0) {
    parts.push(`Good examples: ${this.examples_good.join('. ')}`);
  }

  if (this.examples_bad && this.examples_bad.length > 0) {
    parts.push(`Bad examples: ${this.examples_bad.join('. ')}`);
  }

  if (this.tags && this.tags.length > 0) {
    parts.push(`Tags: ${this.tags.join(', ')}`);
  }

  return parts.join('\n');
};

// Static: Nađi pravila po tagovima (mandatory include)
ruleSchema.statics.findByTags = function(tags, options = {}) {
  const query = {
    tags: { $in: tags },
    isActive: true
  };

  if (options.category) {
    query.category = options.category;
  }

  return this.find(query)
    .select('-__v')
    .sort({ severity_default: -1 });
};

// Static: Nađi pravila po kategoriji
ruleSchema.statics.findByCategory = function(categoryId, subcategory = null) {
  const query = {
    category: categoryId,
    isActive: true
  };

  if (subcategory) {
    query.subcategory = subcategory;
  }

  return this.find(query)
    .select('-__v')
    .sort({ title: 1 });
};

// Static: Generiši stabilan rule_id
ruleSchema.statics.generateRuleId = function(category, title) {
  const categorySlug = category.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 20);
  const titleSlug = title.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 30);
  const hash = require('crypto')
    .createHash('md5')
    .update(`${category}:${title}`)
    .digest('hex')
    .substring(0, 6)
    .toUpperCase();

  return `${categorySlug}_${titleSlug}_${hash}`;
};

module.exports = mongoose.model('Rule', ruleSchema);
