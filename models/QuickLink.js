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
  links: [linkSchema],
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
