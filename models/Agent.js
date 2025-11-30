const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Agent name is required'],
    trim: true,
    maxlength: [200, 'Name cannot exceed 200 characters'],
    unique: true // Agent names are globally unique
  },
  position: {
    type: String,
    trim: true,
    maxlength: [100, 'Position cannot exceed 100 characters']
  },
  team: {
    type: String,
    trim: true,
    maxlength: [100, 'Team cannot exceed 100 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Array of user IDs who currently have this agent in their active grading list
  activeForUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Whether this agent is removed from all grading lists (soft delete)
  isRemoved: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
agentSchema.index({ name: 1 });
agentSchema.index({ team: 1 });
agentSchema.index({ createdBy: 1 });
agentSchema.index({ activeForUsers: 1 });

// Virtual for ticket count (populated when needed)
agentSchema.virtual('ticketCount', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'agent',
  count: true
});

module.exports = mongoose.model('Agent', agentSchema);
