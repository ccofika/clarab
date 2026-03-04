const mongoose = require('mongoose');

const intercomReportTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filters: {
    // Teammate (admin) filter
    adminAssigneeIds: [{
      id: { type: String, required: true },
      name: { type: String, required: true }
    }],
    adminAssigneeOperator: {
      type: String,
      enum: ['is', 'is_not'],
      default: 'is'
    },

    // Team filter
    teamAssigneeIds: [{
      id: { type: String, required: true },
      name: { type: String, required: true }
    }],
    teamAssigneeOperator: {
      type: String,
      enum: ['is', 'is_not'],
      default: 'is'
    },

    // Tag filter
    tagIds: [{
      id: { type: String, required: true },
      name: { type: String, required: true }
    }],
    tagOperator: {
      type: String,
      enum: ['is', 'is_not'],
      default: 'is'
    },

    // Topics filter (post-filter, no Intercom search endpoint)
    topics: [{ type: String, trim: true }],
    topicOperator: {
      type: String,
      enum: ['is', 'is_not'],
      default: 'is'
    },

    // KYC Country filter (post-filter via contact attribute)
    kycCountries: [{ type: String, trim: true }],
    kycCountryOperator: {
      type: String,
      enum: ['is', 'is_not'],
      default: 'is'
    },

    // Date range
    dateFrom: { type: Date },
    dateTo: { type: Date },

    // Conversation state
    state: {
      type: String,
      enum: ['open', 'closed', 'snoozed', ''],
      default: ''
    }
  }
}, { timestamps: true });

intercomReportTemplateSchema.index({ createdBy: 1 });

module.exports = mongoose.model('IntercomReportTemplate', intercomReportTemplateSchema);
