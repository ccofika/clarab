const mongoose = require('mongoose');

const templateBlockSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: {
    type: String,
    required: true
  },
  defaultContent: { type: mongoose.Schema.Types.Mixed },
  variants: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  properties: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

const KBTemplateSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  icon: {
    type: String,
    default: '📋'
  },
  coverImage: String,
  category: {
    type: String,
    enum: ['meeting', 'project', 'docs', 'personal', 'custom'],
    default: 'custom'
  },
  blocks: [templateBlockSchema],
  dropdowns: [{
    id: String,
    label: String,
    icon: String,
    options: [{
      value: String,
      label: String,
      icon: String
    }],
    defaultValue: String
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  isBuiltIn: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  usageCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }]
}, { timestamps: true });

KBTemplateSchema.index({ category: 1 });
KBTemplateSchema.index({ isPublic: 1 });
KBTemplateSchema.index({ tags: 1 });
KBTemplateSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('KBTemplate', KBTemplateSchema);
