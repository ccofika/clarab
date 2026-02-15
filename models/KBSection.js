const mongoose = require('mongoose');

const kbSectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  order: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

kbSectionSchema.index({ order: 1 });

module.exports = mongoose.model('KBSection', kbSectionSchema);
