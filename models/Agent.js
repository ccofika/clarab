const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Agent name is required'],
    trim: true,
    unique: true,
    maxlength: [200, 'Name cannot exceed 200 characters']
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
  goalMinDate: {
    type: Date
  },
  goalMaxDate: {
    type: Date
  },
  periodStart: {
    type: Date
  },
  periodEnd: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for performance
agentSchema.index({ name: 1 });
agentSchema.index({ isActive: 1 });
agentSchema.index({ team: 1 });

// Virtual for ticket count (populated when needed)
agentSchema.virtual('ticketCount', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'agent',
  count: true
});

// Method to check if agent is in current period
agentSchema.methods.isInCurrentPeriod = function() {
  const now = new Date();
  if (!this.periodStart || !this.periodEnd) return true;
  return now >= this.periodStart && now <= this.periodEnd;
};

module.exports = mongoose.model('Agent', agentSchema);
