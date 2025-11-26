const mongoose = require('mongoose');

const kycAgentActivitySchema = new mongoose.Schema({
  // Agent reference
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KYCAgent',
    required: true,
    index: true
  },

  // Slack IDs for quick lookups
  agentSlackId: {
    type: String,
    required: true,
    index: true
  },

  // Activity type
  activityType: {
    type: String,
    enum: ['ticket_taken', 'message_sent', 'thread_reply'],
    required: true
  },

  // Thread information
  threadTs: {
    type: String,
    index: true
  },
  // The specific message the agent reacted to (⏳)
  // This is important when multiple messages are in the same thread
  parentMessageTs: {
    type: String,
    index: true
  },
  messageTs: {
    type: String
  },

  // For ticket_taken: when agent added ⏳ emoji
  reactionTs: {
    type: String
  },
  reactionAddedAt: {
    type: Date
  },

  // For thread_reply: response time calculation
  // Time from ⏳ reaction to first reply in thread
  firstReplyTs: {
    type: String
  },
  firstReplyAt: {
    type: Date
  },
  responseTimeSeconds: {
    type: Number // Calculated: firstReplyAt - reactionAddedAt
  },

  // Message content (optional, for reference)
  messagePreview: {
    type: String,
    maxlength: 200
  },

  // Shift information (calculated based on timestamp)
  shift: {
    type: String,
    enum: ['morning', 'afternoon', 'night'], // 7-15, 15-23, 23-7
    required: true
  },

  // Date for easy filtering (YYYY-MM-DD format in Belgrade timezone)
  activityDate: {
    type: String,
    required: true,
    index: true
  },

  // Channel info
  channelId: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
kycAgentActivitySchema.index({ agentId: 1, activityDate: 1 });
kycAgentActivitySchema.index({ agentId: 1, shift: 1, activityDate: 1 });
kycAgentActivitySchema.index({ activityDate: 1, shift: 1 });
kycAgentActivitySchema.index({ threadTs: 1, activityType: 1 });
kycAgentActivitySchema.index({ parentMessageTs: 1, activityType: 1 });

// Helper to determine shift based on hour (Belgrade timezone)
kycAgentActivitySchema.statics.getShiftFromHour = function(hour) {
  if (hour >= 7 && hour < 15) return 'morning';     // 7:00 - 14:59
  if (hour >= 15 && hour < 23) return 'afternoon';  // 15:00 - 22:59
  return 'night';                                    // 23:00 - 6:59
};

// Helper to get Belgrade date string from timestamp
kycAgentActivitySchema.statics.getBelgradeDateString = function(date) {
  const options = { timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
};

// Helper to get Belgrade hour from timestamp
kycAgentActivitySchema.statics.getBelgradeHour = function(date) {
  const options = { timeZone: 'Europe/Belgrade', hour: 'numeric', hour12: false };
  return parseInt(new Intl.DateTimeFormat('en-US', options).format(date));
};

// Static method to record ticket taken (⏳ reaction added)
kycAgentActivitySchema.statics.recordTicketTaken = async function(data) {
  const { agentId, agentSlackId, threadTs, parentMessageTs, reactionTs, channelId } = data;

  const reactionDate = new Date(parseFloat(reactionTs) * 1000);
  const hour = this.getBelgradeHour(reactionDate);
  const shift = this.getShiftFromHour(hour);
  const activityDate = this.getBelgradeDateString(reactionDate);

  // Check if already recorded - use parentMessageTs for uniqueness
  // This allows multiple tickets in the same thread (different messages)
  const existing = await this.findOne({
    agentSlackId,
    parentMessageTs,
    activityType: 'ticket_taken'
  });

  if (existing) {
    return existing;
  }

  return this.create({
    agentId,
    agentSlackId,
    activityType: 'ticket_taken',
    threadTs,
    parentMessageTs, // The specific message agent reacted to
    reactionTs,
    reactionAddedAt: reactionDate,
    shift,
    activityDate,
    channelId
  });
};

// Static method to record message/reply
kycAgentActivitySchema.statics.recordMessage = async function(data) {
  const { agentId, agentSlackId, threadTs, messageTs, messagePreview, channelId, isThreadReply } = data;

  const messageDate = new Date(parseFloat(messageTs) * 1000);
  const hour = this.getBelgradeHour(messageDate);
  const shift = this.getShiftFromHour(hour);
  const activityDate = this.getBelgradeDateString(messageDate);

  const activityType = isThreadReply ? 'thread_reply' : 'message_sent';

  // If it's a thread reply, try to calculate response time
  let responseTimeSeconds = null;
  let matchedParentMessageTs = null;

  if (isThreadReply && threadTs) {
    // Find the most recent ticket_taken by this agent in this thread
    // that doesn't have a first reply yet (meaning this is the first response to that ticket)
    // OR find the ticket where reaction was added just before this message
    const ticketTaken = await this.findOne({
      agentSlackId,
      threadTs,
      activityType: 'ticket_taken',
      firstReplyTs: null, // No reply yet
      reactionAddedAt: { $lt: messageDate } // Reaction was before this message
    }).sort({ reactionAddedAt: -1 }); // Get the most recent one

    if (ticketTaken && ticketTaken.reactionAddedAt) {
      responseTimeSeconds = Math.floor((messageDate - ticketTaken.reactionAddedAt) / 1000);
      matchedParentMessageTs = ticketTaken.parentMessageTs;

      // Update the ticket_taken record with first reply info
      ticketTaken.firstReplyTs = messageTs;
      ticketTaken.firstReplyAt = messageDate;
      ticketTaken.responseTimeSeconds = responseTimeSeconds;
      await ticketTaken.save();

      console.log(`✅ Matched reply to ticket for message ${ticketTaken.parentMessageTs}, response time: ${responseTimeSeconds}s`);
    }
  }

  return this.create({
    agentId,
    agentSlackId,
    activityType,
    threadTs,
    parentMessageTs: matchedParentMessageTs, // Link to the ticket this reply is for
    messageTs,
    messagePreview: messagePreview?.substring(0, 200),
    shift,
    activityDate,
    channelId,
    responseTimeSeconds
  });
};

// Static method to get agent stats for a date range
kycAgentActivitySchema.statics.getAgentStats = async function(agentId, startDate, endDate) {
  const match = {
    agentId: new mongoose.Types.ObjectId(agentId),
    activityDate: { $gte: startDate, $lte: endDate }
  };

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$activityType',
        count: { $sum: 1 },
        avgResponseTime: {
          $avg: {
            $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null]
          }
        },
        minResponseTime: {
          $min: {
            $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null]
          }
        },
        maxResponseTime: {
          $max: {
            $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null]
          }
        }
      }
    }
  ]);

  return stats;
};

// Static method to get stats by shift
kycAgentActivitySchema.statics.getStatsByShift = async function(agentId, startDate, endDate) {
  const match = {
    agentId: new mongoose.Types.ObjectId(agentId),
    activityDate: { $gte: startDate, $lte: endDate }
  };

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: { shift: '$shift', activityType: '$activityType' },
        count: { $sum: 1 },
        avgResponseTime: {
          $avg: {
            $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null]
          }
        }
      }
    },
    {
      $group: {
        _id: '$_id.shift',
        activities: {
          $push: {
            type: '$_id.activityType',
            count: '$count',
            avgResponseTime: '$avgResponseTime'
          }
        }
      }
    }
  ]);
};

// Static method to get daily stats for an agent
kycAgentActivitySchema.statics.getDailyStats = async function(agentId, startDate, endDate) {
  const match = {
    agentId: new mongoose.Types.ObjectId(agentId),
    activityDate: { $gte: startDate, $lte: endDate }
  };

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: { date: '$activityDate', activityType: '$activityType' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        activities: {
          $push: {
            type: '$_id.activityType',
            count: '$count'
          }
        },
        total: { $sum: '$count' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

const KYCAgentActivity = mongoose.model('KYCAgentActivity', kycAgentActivitySchema);

module.exports = KYCAgentActivity;
