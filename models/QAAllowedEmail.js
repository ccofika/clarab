const mongoose = require('mongoose');

const qaAllowedEmailSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  note: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('QAAllowedEmail', qaAllowedEmailSchema);
