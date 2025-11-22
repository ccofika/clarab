const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  url: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['copy', 'open'],
    default: 'copy',
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  favicon: {
    type: String,
    trim: true,
    default: '',
  },
  customIcon: {
    type: String,
    trim: true,
    default: '',
  },
  isPinned: {
    type: Boolean,
    default: false,
  },
  clicks: {
    type: Number,
    default: 0,
  },
  lastClicked: {
    type: Date,
    default: null,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  order: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const quickLinkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  categoryName: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  color: {
    type: String,
    trim: true,
    default: '#3B82F6', // blue-600
  },
  icon: {
    type: String,
    trim: true,
    default: 'Folder',
  },
  links: [linkSchema],
  order: {
    type: Number,
    default: 0,
  },
  isPrivate: {
    type: Boolean,
    default: true,
  },
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    permission: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view',
    },
    sharedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
quickLinkSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Ensure one category per user has unique name
quickLinkSchema.index({ userId: 1, categoryName: 1 }, { unique: true });

const QuickLink = mongoose.model('QuickLink', quickLinkSchema);

module.exports = QuickLink;
