const mongoose = require('mongoose');

const zenMoveSettingsSchema = new mongoose.Schema({
  extractionTarget: {
    type: Number,
    default: 8,
    min: 1,
    max: 50
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ZenMoveSettings', zenMoveSettingsSchema);
