const mongoose = require('mongoose');

// Belgrade timezone helpers (reused from KYCAgentActivity)
const getShiftFromHour = (hour) => {
  if (hour >= 7 && hour < 15) return 'morning';
  if (hour >= 15 && hour < 23) return 'afternoon';
  return 'night';
};

const getBelgradeDateString = (date) => {
  const options = { timeZone: 'Europe/Belgrade', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
};

const getBelgradeHour = (date) => {
  const options = { timeZone: 'Europe/Belgrade', hour: 'numeric', hour12: false };
  return parseInt(new Intl.DateTimeFormat('en-US', options).format(date));
};

const kycTicketSchema = new mongoose.Schema({
  // Channel reference
  channelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KYCChannel',
    required: true
  },
  slackChannelId: {
    type: String,
    required: true,
    index: true
  },

  // Slack message identity
  slackMessageTs: {
    type: String,
    required: true
  },
  threadTs: {
    type: String
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  claimedAt: {
    type: Date
  },
  firstReplyAt: {
    type: Date
  },
  resolvedAt: {
    type: Date
  },

  // Computed durations (seconds)
  timeToClaimSeconds: {
    type: Number
  },
  timeToFirstReplySeconds: {
    type: Number
  },
  totalHandlingTimeSeconds: {
    type: Number
  },
  // Response time: from claim (⏳) to resolve (✅/❌)
  responseTimeSeconds: {
    type: Number
  },

  // Agent references - claim
  claimedByAgentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KYCAgent',
    index: true
  },
  claimedBySlackId: {
    type: String
  },

  // Agent references - resolve
  resolvedByAgentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KYCAgent'
  },
  resolvedBySlackId: {
    type: String
  },

  // Thread replies tracking
  repliedByAgents: [{
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'KYCAgent' },
    slackId: String,
    repliedAt: Date,
    messageTs: String
  }],
  replyCount: {
    type: Number,
    default: 0
  },

  // Status
  status: {
    type: String,
    enum: ['open', 'claimed', 'in_progress', 'resolved'],
    default: 'open',
    index: true
  },

  // Case type for hybrid channels
  // "agent_initiated" = KYC agent posted (instant case, no time tracking)
  // "external_request" = non-KYC person posted (full lifecycle with time tracking)
  caseType: {
    type: String,
    enum: ['agent_initiated', 'external_request'],
    default: 'external_request'
  },

  // Meta
  shift: {
    type: String,
    enum: ['morning', 'afternoon', 'night']
  },
  activityDate: {
    type: String,
    index: true
  }
}, {
  timestamps: { createdAt: false, updatedAt: true }
});

// Compound indexes
kycTicketSchema.index({ slackChannelId: 1, slackMessageTs: 1 }, { unique: true });
kycTicketSchema.index({ activityDate: 1, slackChannelId: 1 });
kycTicketSchema.index({ claimedByAgentId: 1, activityDate: 1 });
kycTicketSchema.index({ status: 1, slackChannelId: 1 });

// Expose helpers as statics
kycTicketSchema.statics.getShiftFromHour = getShiftFromHour;
kycTicketSchema.statics.getBelgradeDateString = getBelgradeDateString;
kycTicketSchema.statics.getBelgradeHour = getBelgradeHour;

/**
 * Create a new open ticket from a top-level message
 */
kycTicketSchema.statics.findOrCreateFromMessage = async function(data) {
  const { channelId, slackChannelId, slackMessageTs, caseType } = data;

  const existing = await this.findOne({ slackChannelId, slackMessageTs });
  if (existing) return existing;

  const msgDate = new Date(parseFloat(slackMessageTs) * 1000);
  const hour = getBelgradeHour(msgDate);

  const doc = {
    channelId,
    slackChannelId,
    slackMessageTs,
    threadTs: slackMessageTs,
    createdAt: msgDate,
    status: 'open',
    shift: getShiftFromHour(hour),
    activityDate: getBelgradeDateString(msgDate)
  };
  if (caseType) doc.caseType = caseType;

  return this.create(doc);
};

/**
 * Claim a ticket (⏳ reaction)
 */
kycTicketSchema.statics.claimTicket = async function(data) {
  const { slackChannelId, messageTs, agentId, agentSlackId, eventTs } = data;

  // Find ticket by the message that was reacted to
  let ticket = await this.findOne({ slackChannelId, slackMessageTs: messageTs });

  if (!ticket) {
    // Might be a reaction on a message within a thread — find by threadTs
    ticket = await this.findOne({ slackChannelId, threadTs: messageTs });
  }

  if (!ticket) {
    // Auto-create ticket if Slack didn't send the message event
    if (data.channelId) {
      console.log(`📝 KYCTicket.claimTicket: Auto-creating ticket for message ${messageTs} in ${slackChannelId}`);
      const msgDate = new Date(parseFloat(messageTs) * 1000);
      const hour = getBelgradeHour(msgDate);
      ticket = await this.create({
        channelId: data.channelId,
        slackChannelId,
        slackMessageTs: messageTs,
        threadTs: messageTs,
        createdAt: msgDate,
        status: 'open',
        shift: getShiftFromHour(hour),
        activityDate: getBelgradeDateString(msgDate)
      });
    } else {
      console.log(`⚠️ KYCTicket.claimTicket: No ticket found for message ${messageTs} in ${slackChannelId}`);
      return null;
    }
  }

  // Don't re-claim if already claimed
  if (ticket.claimedByAgentId) {
    return ticket;
  }

  const claimDate = eventTs ? new Date(parseFloat(eventTs) * 1000) : new Date();

  ticket.claimedByAgentId = agentId;
  ticket.claimedBySlackId = agentSlackId;
  ticket.claimedAt = claimDate;
  ticket.status = 'claimed';

  // Compute time to claim
  if (ticket.createdAt) {
    ticket.timeToClaimSeconds = Math.floor((claimDate - ticket.createdAt) / 1000);
  }

  await ticket.save();
  return ticket;
};

/**
 * Resolve a ticket (✅/❌ reaction)
 */
kycTicketSchema.statics.resolveTicket = async function(data) {
  const { slackChannelId, messageTs, agentId, agentSlackId, eventTs } = data;

  let ticket = await this.findOne({ slackChannelId, slackMessageTs: messageTs });
  if (!ticket) {
    ticket = await this.findOne({ slackChannelId, threadTs: messageTs });
  }

  if (!ticket) {
    // Auto-create ticket if Slack didn't send the message event
    if (data.channelId) {
      console.log(`📝 KYCTicket.resolveTicket: Auto-creating ticket for message ${messageTs} in ${slackChannelId}`);
      const msgDate = new Date(parseFloat(messageTs) * 1000);
      const hour = getBelgradeHour(msgDate);
      ticket = await this.create({
        channelId: data.channelId,
        slackChannelId,
        slackMessageTs: messageTs,
        threadTs: messageTs,
        createdAt: msgDate,
        status: 'open',
        shift: getShiftFromHour(hour),
        activityDate: getBelgradeDateString(msgDate)
      });
    } else {
      console.log(`⚠️ KYCTicket.resolveTicket: No ticket found for message ${messageTs} in ${slackChannelId}`);
      return null;
    }
  }

  if (ticket.status === 'resolved') {
    return ticket;
  }

  const resolveDate = eventTs ? new Date(parseFloat(eventTs) * 1000) : new Date();

  ticket.resolvedByAgentId = agentId;
  ticket.resolvedBySlackId = agentSlackId;
  ticket.resolvedAt = resolveDate;
  ticket.status = 'resolved';

  // If not previously claimed, also set claim info
  if (!ticket.claimedByAgentId) {
    ticket.claimedByAgentId = agentId;
    ticket.claimedBySlackId = agentSlackId;
    ticket.claimedAt = resolveDate;
    if (ticket.createdAt) {
      ticket.timeToClaimSeconds = Math.floor((resolveDate - ticket.createdAt) / 1000);
    }
  }

  // Compute total handling time
  if (ticket.createdAt) {
    ticket.totalHandlingTimeSeconds = Math.floor((resolveDate - ticket.createdAt) / 1000);
  }

  // Compute response time: from claim (⏳) to resolve (✅/❌)
  if (ticket.claimedAt) {
    ticket.responseTimeSeconds = Math.floor((resolveDate - ticket.claimedAt) / 1000);
  }

  await ticket.save();
  return ticket;
};

/**
 * Record a thread reply
 */
kycTicketSchema.statics.recordReply = async function(data) {
  const { slackChannelId, threadTs, agentId, agentSlackId, messageTs, channelId } = data;

  let ticket = await this.findOne({ slackChannelId, slackMessageTs: threadTs });
  if (!ticket) {
    // Auto-create ticket from the parent message (thread_ts)
    if (channelId) {
      console.log(`📝 KYCTicket.recordReply: Auto-creating ticket for thread ${threadTs} in ${slackChannelId}`);
      const msgDate = new Date(parseFloat(threadTs) * 1000);
      const hour = getBelgradeHour(msgDate);
      ticket = await this.create({
        channelId,
        slackChannelId,
        slackMessageTs: threadTs,
        threadTs,
        createdAt: msgDate,
        status: 'open',
        shift: getShiftFromHour(hour),
        activityDate: getBelgradeDateString(msgDate)
      });
    } else {
      return null;
    }
  }

  const replyDate = new Date(parseFloat(messageTs) * 1000);

  // Add to repliedByAgents
  ticket.repliedByAgents.push({
    agentId,
    slackId: agentSlackId,
    repliedAt: replyDate,
    messageTs
  });
  ticket.replyCount = (ticket.replyCount || 0) + 1;

  // Track first reply time
  if (!ticket.firstReplyAt) {
    ticket.firstReplyAt = replyDate;
    if (ticket.createdAt) {
      ticket.timeToFirstReplySeconds = Math.floor((replyDate - ticket.createdAt) / 1000);
    }
  }

  // Fallback claim: if ticket is still open, treat first reply as a claim
  if (ticket.status === 'open') {
    ticket.claimedByAgentId = agentId;
    ticket.claimedBySlackId = agentSlackId;
    ticket.claimedAt = replyDate;
    ticket.status = 'in_progress';
    if (ticket.createdAt) {
      ticket.timeToClaimSeconds = Math.floor((replyDate - ticket.createdAt) / 1000);
    }
  } else if (ticket.status === 'claimed') {
    ticket.status = 'in_progress';
  }

  await ticket.save();
  return ticket;
};

const KYCTicket = mongoose.model('KYCTicket', kycTicketSchema);

module.exports = KYCTicket;
