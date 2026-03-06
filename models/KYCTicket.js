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

  // Original message content
  messageText: {
    type: String,
    default: ''
  },
  messageAuthorSlackId: {
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

  // Last non-agent message in thread (for accurate wait time calculation)
  // When a thread gets a new external message, wait time resets from this point
  lastExternalMessageAt: {
    type: Date
  },

  // Dismissed from long-waiting panels (false alarm / bug)
  dismissed: {
    type: Boolean,
    default: false
  },
  dismissedAt: {
    type: Date
  },
  dismissedBy: {
    type: String
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
  const { channelId, slackChannelId, slackMessageTs, caseType, messageText, messageAuthorSlackId } = data;

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
    lastExternalMessageAt: msgDate,
    status: 'open',
    shift: getShiftFromHour(hour),
    activityDate: getBelgradeDateString(msgDate)
  };
  if (caseType) doc.caseType = caseType;
  if (messageText) doc.messageText = messageText;
  if (messageAuthorSlackId) doc.messageAuthorSlackId = messageAuthorSlackId;

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

  // Compute time to claim — from last external message (or createdAt if no thread activity)
  const waitStart = ticket.lastExternalMessageAt || ticket.createdAt;
  if (waitStart) {
    ticket.timeToClaimSeconds = Math.floor((claimDate - waitStart) / 1000);
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

  const waitStart = ticket.lastExternalMessageAt || ticket.createdAt;

  // If not previously claimed, also set claim info
  if (!ticket.claimedByAgentId) {
    ticket.claimedByAgentId = agentId;
    ticket.claimedBySlackId = agentSlackId;
    ticket.claimedAt = resolveDate;
    if (waitStart) {
      ticket.timeToClaimSeconds = Math.floor((resolveDate - waitStart) / 1000);
    }
  }

  // Compute total handling time — from last external message (not original creation)
  if (waitStart) {
    ticket.totalHandlingTimeSeconds = Math.floor((resolveDate - waitStart) / 1000);
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

  const waitStart = ticket.lastExternalMessageAt || ticket.createdAt;

  // Track first reply time
  if (!ticket.firstReplyAt) {
    ticket.firstReplyAt = replyDate;
    if (waitStart) {
      ticket.timeToFirstReplySeconds = Math.floor((replyDate - waitStart) / 1000);
    }
  }

  // Fallback claim: if ticket is still open, treat first reply as a claim
  if (ticket.status === 'open') {
    ticket.claimedByAgentId = agentId;
    ticket.claimedBySlackId = agentSlackId;
    ticket.claimedAt = replyDate;
    ticket.status = 'in_progress';
    if (waitStart) {
      ticket.timeToClaimSeconds = Math.floor((replyDate - waitStart) / 1000);
    }
  } else if (ticket.status === 'claimed') {
    ticket.status = 'in_progress';
  }

  await ticket.save();
  return ticket;
};

/**
 * Record a non-agent thread message (resets wait time)
 * Called when someone who is NOT a KYC agent posts in a thread
 */
kycTicketSchema.statics.recordExternalThreadMessage = async function(data) {
  const { slackChannelId, threadTs, messageTs } = data;

  let ticket = await this.findOne({ slackChannelId, slackMessageTs: threadTs });
  if (!ticket) return null;

  const msgDate = new Date(parseFloat(messageTs) * 1000);

  // Update the "clock start" for wait time
  ticket.lastExternalMessageAt = msgDate;

  // If ticket was resolved or in_progress, reopen it — new question needs attention
  if (ticket.status === 'resolved') {
    ticket.status = 'open';
    ticket.resolvedAt = undefined;
    ticket.resolvedByAgentId = undefined;
    ticket.resolvedBySlackId = undefined;
    ticket.responseTimeSeconds = undefined;
    ticket.totalHandlingTimeSeconds = undefined;
    // Reset claim so agents can re-claim
    ticket.claimedAt = undefined;
    ticket.claimedByAgentId = undefined;
    ticket.claimedBySlackId = undefined;
    ticket.timeToClaimSeconds = undefined;
  }

  // Update activityDate and shift to the new message's date
  const hour = getBelgradeHour(msgDate);
  ticket.shift = getShiftFromHour(hour);
  ticket.activityDate = getBelgradeDateString(msgDate);

  await ticket.save();
  return ticket;
};

const KYCTicket = mongoose.model('KYCTicket', kycTicketSchema);

module.exports = KYCTicket;
