const mongoose = require('mongoose');

const qaSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    maxlength: 200
  },
  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    searchResults: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket'
    }],
    suggestedFilters: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessageAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Index for user queries
qaSessionSchema.index({ user: 1, lastMessageAt: -1 });

// Update lastMessageAt when adding messages
qaSessionSchema.pre('save', function(next) {
  if (this.messages && this.messages.length > 0) {
    this.lastMessageAt = this.messages[this.messages.length - 1].timestamp || new Date();
  }
  next();
});

module.exports = mongoose.model('QASession', qaSessionSchema);
