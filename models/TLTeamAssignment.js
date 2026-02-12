const mongoose = require('mongoose');

const tlTeamAssignmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  teams: [{
    type: String,
    trim: true
  }],
  office: {
    type: String,
    trim: true,
    default: 'BG'
  }
}, {
  timestamps: true
});

tlTeamAssignmentSchema.index({ userId: 1 });

module.exports = mongoose.model('TLTeamAssignment', tlTeamAssignmentSchema);
