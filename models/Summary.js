const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  // User who created the summary
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Date for which the summary was generated
  date: {
    type: Date,
    required: true
  },

  // Shift type based on ticket activity times
  shift: {
    type: String,
    enum: ['Morning', 'Afternoon'],
    required: true
  },

  // Formatted title: "2nd January | Morning shift"
  title: {
    type: String,
    required: true,
    maxlength: 100
  },

  // The actual summary content (editable by user)
  content: {
    type: String,
    required: true
  },

  // Metadata for tracking and potential regeneration
  metadata: {
    ticketCount: {
      selected: { type: Number, default: 0 },
      graded: { type: Number, default: 0 },
      both: { type: Number, default: 0 } // Selected AND graded same day
    },
    agentsSummarized: [{
      agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
      agentName: String,
      type: { type: String, enum: ['selected', 'graded', 'both'] },
      count: Number,
      weeklyTotal: Number, // Total tickets for this agent this week
      averageScore: Number // Average score for graded tickets
    }],
    generatedAt: { type: Date, default: Date.now }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Compound unique index: one summary per user per date per shift
summarySchema.index({ userId: 1, date: 1, shift: 1 }, { unique: true });

// Index for calendar queries (finding dates with summaries for a user)
summarySchema.index({ userId: 1, date: 1 });

// Helper method to get ordinal suffix for day
summarySchema.statics.getOrdinalSuffix = function(day) {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

// Helper method to format title from date and shift
summarySchema.statics.formatTitle = function(date, shift) {
  const d = new Date(date);
  // Use UTC methods to avoid timezone shifts
  const day = d.getUTCDate();
  const suffix = this.getOrdinalSuffix(day);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const month = months[d.getUTCMonth()];
  return `${day}${suffix} ${month} | ${shift} shift`;
};

// Helper method to get Monday of the week for a given date (UTC)
summarySchema.statics.getMondayOfWeek = function(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
  return monday;
};

// Helper method to check if date is within current week (Monday to today) - UTC
summarySchema.statics.isDateInCurrentWeek = function(date) {
  const today = new Date();
  const todayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

  const monday = this.getMondayOfWeek(today);
  const targetDate = new Date(date);

  return targetDate >= monday && targetDate <= todayEnd;
};

// Helper method to determine shift based on ticket activity times
summarySchema.statics.determineShift = function(tickets) {
  let morningCount = 0;
  let afternoonCount = 0;

  tickets.forEach(ticket => {
    const activityDate = ticket.gradedDate || ticket.dateEntered;
    if (activityDate) {
      const hour = new Date(activityDate).getHours();
      if (hour >= 7 && hour < 15) {
        morningCount++;
      } else if (hour >= 15 && hour < 23) {
        afternoonCount++;
      }
    }
  });

  // Default to Morning if tie or no activity within shift hours
  return morningCount >= afternoonCount ? 'Morning' : 'Afternoon';
};

module.exports = mongoose.model('Summary', summarySchema);
