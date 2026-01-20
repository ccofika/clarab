const mongoose = require('mongoose');

const gradeButtonClickSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  source: {
    type: String,
    enum: ['dashboard', 'agents'],
    default: 'dashboard'
  },
  clickedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
gradeButtonClickSchema.index({ userId: 1, clickedAt: -1 });
gradeButtonClickSchema.index({ clickedAt: -1 });

module.exports = mongoose.model('GradeButtonClick', gradeButtonClickSchema);
