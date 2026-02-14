const mongoose = require('mongoose');

const quizQuestionSchema = new mongoose.Schema({
  id: String,
  question: String,
  choices: [{
    id: String,
    text: String
  }],
  correctAnswer: String,
  explanation: String,
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  sectionRef: {
    pageSlug: String,
    headingId: String,
    pageTitle: String,
    sectionTitle: String
  }
}, { _id: false });

const kbLearnHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  quizId: { type: String, required: true },
  status: {
    type: String,
    enum: ['completed', 'abandoned'],
    required: true
  },
  // Score info
  totalQuestions: { type: Number, required: true },
  firstTryCorrect: { type: Number, default: 0 },
  scorePercent: { type: Number, default: 0 },
  // What was selected
  sourcePages: [{
    _id: mongoose.Schema.Types.ObjectId,
    title: String,
    slug: String
  }],
  userNote: { type: String, default: '' },
  // Full quiz data for review
  questions: [quizQuestionSchema],
  // Which questions were answered wrong on first try
  wrongQuestionIds: [String],
  // Timestamps
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Index for efficient user history queries
kbLearnHistorySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('KBLearnHistory', kbLearnHistorySchema);
