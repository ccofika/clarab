const mongoose = require('mongoose');

const QAAssignmentSchema = new mongoose.Schema({
  // Reference to the agent
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true,
    index: true
  },

  // Assignment name as created in MaestroQA (e.g., "Stefan Minasevic 1/12-1/18")
  assignmentName: {
    type: String,
    required: true
  },

  // Week identifier (e.g., "2025-W03" for week 3 of 2025)
  weekId: {
    type: String,
    required: true,
    index: true
  },

  // Status of the assignment
  status: {
    type: String,
    enum: ['created', 'in_progress', 'completed'],
    default: 'created'
  },

  // All ticket IDs that have been added to this assignment
  ticketIds: [{
    type: String
  }],

  // Ticket IDs that have been graded
  gradedTicketIds: [{
    type: String
  }],

  // Ticket MongoDB ObjectIds (for reference)
  ticketObjectIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket'
  }],

  // MaestroQA specific data
  maestroData: {
    rubricName: String,
    qaEmail: String
  },

  // Timestamps for tracking
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for finding assignments by agent and week
QAAssignmentSchema.index({ agentId: 1, weekId: 1 });

// Helper method to get current week ID
QAAssignmentSchema.statics.getCurrentWeekId = function() {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
};

// Helper method to generate assignment name
QAAssignmentSchema.statics.generateAssignmentName = function(agentName) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday

  const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${agentName} ${formatDate(startOfWeek)}-${formatDate(endOfWeek)}`;
};

module.exports = mongoose.model('QAAssignment', QAAssignmentSchema);
