const crypto = require('crypto');
const mongoose = require('mongoose');
const { WebClient } = require('@slack/web-api');
const KYCChannel = require('../models/KYCChannel');
const KYCTicket = require('../models/KYCTicket');
const KYCAgent = require('../models/KYCAgent');

// Slack client (reuse same bot token as KYC Stats)
let slackClient = null;
const getSlackClient = () => {
  if (!slackClient && process.env.KYC_STATS_SLACK_BOT_TOKEN) {
    slackClient = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);
  }
  return slackClient;
};

/**
 * Verify Slack request signature (copied from kycAgentStatsController)
 */
const verifySlackSignature = (req, rawBody) => {
  const slackSignature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  if (!slackSignature || !timestamp) return false;

  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', process.env.KYC_STATS_SLACK_SIGNING_SECRET)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature, 'utf8'),
      Buffer.from(slackSignature, 'utf8')
    );
  } catch (e) {
    return false;
  }
};

/**
 * Resolve agent from Slack user ID — find by slackId, fallback to email via Slack API
 */
const resolveAgent = async (slackUserId) => {
  let agent = await KYCAgent.findBySlackId(slackUserId);
  if (agent) return agent;

  const client = getSlackClient();
  if (!client) return null;

  try {
    const userInfo = await client.users.info({ user: slackUserId });
    if (userInfo.ok && userInfo.user.profile.email) {
      agent = await KYCAgent.findByEmail(userInfo.user.profile.email);
      if (agent) {
        agent.slackUserId = slackUserId;
        agent.slackUsername = userInfo.user.name;
        await agent.save();
      }
    }
  } catch (e) {
    console.error('Error fetching Slack user info:', e.message);
  }
  return agent;
};

/**
 * Ensure agent has channel in their channels array
 */
const ensureAgentChannel = async (agent, channelDoc) => {
  if (!agent.channels) agent.channels = [];
  const hasChannel = agent.channels.some(c => c.toString() === channelDoc._id.toString());
  if (!hasChannel) {
    agent.channels.push(channelDoc._id);
    await agent.save();
  }
};

// ============================================
// SLACK WEBHOOK HANDLER
// ============================================

/**
 * Handle Slack Events for KYC Goals (multi-channel)
 * POST /api/kyc-stats/slack-events
 */
/**
 * Fetch a message's thread_ts from Slack to find the parent message
 */
const getMessageThreadTs = async (channel, messageTs) => {
  const client = getSlackClient();
  if (!client) return null;

  try {
    const result = await client.conversations.replies({
      channel,
      ts: messageTs,
      limit: 1,
      inclusive: true
    });
    if (result.ok && result.messages?.length > 0) {
      const msg = result.messages[0];
      // If the message has thread_ts different from its own ts, it's a thread reply
      if (msg.thread_ts && msg.thread_ts !== msg.ts) {
        return msg.thread_ts;
      }
    }
  } catch (e) {
    // Fallback: try conversations.history for top-level messages
    try {
      const result = await client.conversations.history({
        channel,
        latest: messageTs,
        oldest: messageTs,
        inclusive: true,
        limit: 1
      });
      if (result.ok && result.messages?.length > 0) {
        return result.messages[0].thread_ts || null;
      }
    } catch (e2) {
      console.error('Error fetching message thread_ts:', e2.message);
    }
  }
  return null;
};

exports.handleSlackEvents = async (req, res) => {
  try {
    let rawBody, payload;

    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
      payload = JSON.parse(rawBody);
    } else if (typeof req.body === 'object' && req.body !== null && '0' in req.body) {
      const bodyArray = Object.values(req.body);
      const buffer = Buffer.from(bodyArray);
      rawBody = buffer.toString('utf8');
      payload = JSON.parse(rawBody);
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
      payload = JSON.parse(rawBody);
    } else {
      rawBody = JSON.stringify(req.body);
      payload = req.body;
    }

    // URL verification challenge
    if (payload.type === 'url_verification') {
      return res.json({ challenge: payload.challenge });
    }

    // Verify signature
    if (!verifySlackSignature(req, rawBody)) {
      console.error('❌ KYC Goals signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (payload.type === 'event_callback') {
      const event = payload.event;
      const eventChannel = event.channel || event.item?.channel;

      // Multi-channel: look up channel in KYCChannel collection
      const channelDoc = await KYCChannel.findBySlackId(eventChannel);
      if (!channelDoc) {
        // Not a tracked channel, ignore
        return res.status(200).send();
      }

      // === MESSAGE_COUNT mode: each top-level agent message = 1 resolved case ===
      if (channelDoc.trackingMode === 'message_count') {
        if (event.type === 'message' && !event.thread_ts && !event.bot_id && !event.subtype) {
          await handleMessageCountCase(event, channelDoc);
        }
        // Ignore reactions and thread replies for message_count channels
        return res.status(200).send();
      }

      // === FULL mode: ⏳/✅ lifecycle ===
      // Route reaction events
      if (event.type === 'reaction_added') {
        const config = channelDoc.trackingConfig || {};

        // Check claim emojis
        if ((config.claimDetection?.emojis || []).includes(event.reaction)) {
          await handleClaimReaction(event, channelDoc);
        }
        // Check resolve emojis
        else if ((config.resolveDetection?.emojis || []).includes(event.reaction)) {
          await handleResolveReaction(event, channelDoc);
        }
      }

      // New top-level message → open ticket
      if (event.type === 'message' && !event.thread_ts && !event.bot_id && !event.subtype) {
        await handleNewMessage(event, channelDoc);
      }

      // Thread reply → record reply + fallback claim
      if (event.type === 'message' && event.thread_ts && !event.bot_id && event.subtype !== 'bot_message') {
        await handleThreadReply(event, channelDoc);
      }

      return res.status(200).send();
    }

    res.status(200).send();
  } catch (error) {
    console.error('❌ KYC Goals webhook error:', error);
    res.status(200).send();
  }
};

// --- Event handlers ---

/**
 * message_count mode: each top-level message from a KYC agent = 1 instantly resolved case
 */
const handleMessageCountCase = async (event, channelDoc) => {
  try {
    const agent = await resolveAgent(event.user);
    if (!agent) {
      // Not a tracked KYC agent, ignore
      return;
    }

    await ensureAgentChannel(agent, channelDoc);

    const msgDate = new Date(parseFloat(event.ts) * 1000);

    console.log(`📨 KYC Goals [message_count]: ${agent.name} sent message in ${channelDoc.name}`);

    await KYCTicket.create({
      channelId: channelDoc._id,
      slackChannelId: event.channel,
      slackMessageTs: event.ts,
      threadTs: event.ts,
      createdAt: msgDate,
      claimedAt: msgDate,
      resolvedAt: msgDate,
      claimedByAgentId: agent._id,
      claimedBySlackId: event.user,
      resolvedByAgentId: agent._id,
      resolvedBySlackId: event.user,
      status: 'resolved',
      timeToClaimSeconds: 0,
      responseTimeSeconds: 0,
      totalHandlingTimeSeconds: 0,
      shift: KYCTicket.getShiftFromHour(KYCTicket.getBelgradeHour(msgDate)),
      activityDate: KYCTicket.getBelgradeDateString(msgDate)
    });
  } catch (error) {
    // Duplicate message ts — ignore
    if (error.code === 11000) return;
    console.error('❌ Error handling message_count case:', error);
  }
};

const handleNewMessage = async (event, channelDoc) => {
  try {
    console.log(`📨 KYC Goals: New message in ${channelDoc.name} (${event.channel}), ts: ${event.ts}`);
    await KYCTicket.findOrCreateFromMessage({
      channelId: channelDoc._id,
      slackChannelId: event.channel,
      slackMessageTs: event.ts
    });
  } catch (error) {
    console.error('❌ Error handling new message:', error);
  }
};

const handleClaimReaction = async (event, channelDoc) => {
  try {
    const agent = await resolveAgent(event.user);
    if (!agent) return;

    await ensureAgentChannel(agent, channelDoc);

    const messageTs = event.item.ts;
    const slackChannelId = event.item.channel;

    // First try direct lookup by the reacted message ts
    let ticket = await KYCTicket.findOne({ slackChannelId, slackMessageTs: messageTs });

    // If not found, check if the reaction was on a thread reply → find parent ticket
    if (!ticket) {
      const parentTs = await getMessageThreadTs(slackChannelId, messageTs);
      if (parentTs && parentTs !== messageTs) {
        ticket = await KYCTicket.findOne({ slackChannelId, slackMessageTs: parentTs });
      }
    }

    // If still no ticket, auto-create one (the reacted message IS the case)
    if (!ticket) {
      console.log(`📝 KYC Goals: Auto-creating ticket for claim on ${messageTs} in ${channelDoc.name}`);
    }

    await KYCTicket.claimTicket({
      channelId: channelDoc._id,
      slackChannelId,
      messageTs: ticket ? ticket.slackMessageTs : messageTs,
      agentId: agent._id,
      agentSlackId: event.user,
      eventTs: event.event_ts
    });
  } catch (error) {
    console.error('❌ Error handling claim reaction:', error);
  }
};

const handleResolveReaction = async (event, channelDoc) => {
  try {
    const agent = await resolveAgent(event.user);
    if (!agent) return;

    await ensureAgentChannel(agent, channelDoc);

    const messageTs = event.item.ts;
    const slackChannelId = event.item.channel;

    // First try direct lookup by the reacted message ts
    let ticket = await KYCTicket.findOne({ slackChannelId, slackMessageTs: messageTs });

    // If not found, check if the reaction was on a thread reply → find parent ticket
    if (!ticket) {
      const parentTs = await getMessageThreadTs(slackChannelId, messageTs);
      if (parentTs && parentTs !== messageTs) {
        ticket = await KYCTicket.findOne({ slackChannelId, slackMessageTs: parentTs });
      }
    }

    // If still no ticket, auto-create one
    if (!ticket) {
      console.log(`📝 KYC Goals: Auto-creating ticket for resolve on ${messageTs} in ${channelDoc.name}`);
    }

    await KYCTicket.resolveTicket({
      channelId: channelDoc._id,
      slackChannelId,
      messageTs: ticket ? ticket.slackMessageTs : messageTs,
      agentId: agent._id,
      agentSlackId: event.user,
      eventTs: event.event_ts
    });
  } catch (error) {
    console.error('❌ Error handling resolve reaction:', error);
  }
};

const handleThreadReply = async (event, channelDoc) => {
  try {
    const agent = await resolveAgent(event.user);
    if (!agent) return;

    await ensureAgentChannel(agent, channelDoc);

    await KYCTicket.recordReply({
      channelId: channelDoc._id,
      slackChannelId: event.channel,
      threadTs: event.thread_ts,
      agentId: agent._id,
      agentSlackId: event.user,
      messageTs: event.ts
    });
  } catch (error) {
    console.error('❌ Error handling thread reply:', error);
  }
};

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Helper: build date + channel + agent match filter
 */
const buildMatchFilter = (query) => {
  const match = {};

  if (query.startDate) {
    match.activityDate = match.activityDate || {};
    match.activityDate.$gte = query.startDate;
  }
  if (query.endDate) {
    match.activityDate = match.activityDate || {};
    match.activityDate.$lte = query.endDate;
  }

  if (query.channelIds) {
    const ids = Array.isArray(query.channelIds) ? query.channelIds : [query.channelIds];
    match.slackChannelId = { $in: ids };
  }

  if (query.agentIds) {
    const ids = Array.isArray(query.agentIds) ? query.agentIds : [query.agentIds];
    match.claimedByAgentId = { $in: ids.map(id => new mongoose.Types.ObjectId(id)) };
  }

  // Default date range: last 7 days
  if (!query.startDate && !query.endDate) {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    match.activityDate = {
      $gte: KYCTicket.getBelgradeDateString(sevenDaysAgo),
      $lte: KYCTicket.getBelgradeDateString(now)
    };
  }

  return match;
};

/**
 * GET /api/kyc-goals/overview
 * Summary cards data
 */
exports.getOverview = async (req, res) => {
  try {
    const match = buildMatchFilter(req.query);

    const today = KYCTicket.getBelgradeDateString(new Date());

    // Current period stats
    const [totalTickets, resolvedTickets, claimTimeStats, activeAgentCount, openCases, resolvedToday] = await Promise.all([
      KYCTicket.countDocuments(match),
      KYCTicket.countDocuments({ ...match, status: 'resolved' }),
      KYCTicket.aggregate([
        { $match: { ...match, responseTimeSeconds: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            avgResponseTime: { $avg: '$responseTimeSeconds' },
            avgHandlingTime: { $avg: '$totalHandlingTimeSeconds' },
            avgFirstReply: { $avg: '$timeToFirstReplySeconds' }
          }
        }
      ]),
      KYCTicket.distinct('claimedByAgentId', { ...match, claimedByAgentId: { $ne: null } }),
      KYCTicket.countDocuments({ ...match, status: { $ne: 'resolved' } }),
      KYCTicket.countDocuments({ ...match, status: 'resolved', activityDate: today })
    ]);

    const times = claimTimeStats[0] || { avgResponseTime: 0, avgHandlingTime: 0, avgFirstReply: 0 };

    // Previous period comparison
    let prevMatch = {};
    if (match.activityDate) {
      const start = match.activityDate.$gte;
      const end = match.activityDate.$lte;
      if (start && end) {
        const daysDiff = Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
        const prevEnd = new Date(new Date(start));
        prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd);
        prevStart.setDate(prevStart.getDate() - daysDiff);
        prevMatch = {
          ...match,
          activityDate: {
            $gte: KYCTicket.getBelgradeDateString(prevStart),
            $lte: KYCTicket.getBelgradeDateString(prevEnd)
          }
        };
      }
    }

    const [prevTotal, prevClaimTimeStats, prevActiveAgents] = await Promise.all([
      Object.keys(prevMatch).length ? KYCTicket.countDocuments(prevMatch) : Promise.resolve(0),
      Object.keys(prevMatch).length ? KYCTicket.aggregate([
        { $match: { ...prevMatch, responseTimeSeconds: { $gt: 0 } } },
        { $group: { _id: null, avgResponseTime: { $avg: '$responseTimeSeconds' } } }
      ]) : Promise.resolve([]),
      Object.keys(prevMatch).length ? KYCTicket.distinct('claimedByAgentId', { ...prevMatch, claimedByAgentId: { $ne: null } }) : Promise.resolve([])
    ]);

    const prevTimes = prevClaimTimeStats[0] || { avgResponseTime: 0 };
    const agentCount = activeAgentCount.length;
    const prevAgentCount = prevActiveAgents.length;
    const casesPerAgent = agentCount > 0 ? Math.round(totalTickets / agentCount) : 0;
    const prevCasesPerAgent = prevAgentCount > 0 ? Math.round(prevTotal / prevAgentCount) : 0;

    const pctChange = (curr, prev) => {
      if (!prev || prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    res.json({
      success: true,
      data: {
        totalCases: { value: totalTickets, change: pctChange(totalTickets, prevTotal) },
        avgResponseTime: { value: Math.round(times.avgResponseTime || 0), change: pctChange(times.avgResponseTime, prevTimes.avgResponseTime) },
        activeAgents: { value: agentCount, change: pctChange(agentCount, prevAgentCount) },
        casesPerAgent: { value: casesPerAgent, change: pctChange(casesPerAgent, prevCasesPerAgent) },
        resolvedCases: resolvedTickets,
        openCases,
        resolvedToday,
        avgHandlingTime: Math.round(times.avgHandlingTime || 0),
        avgFirstReplyTime: Math.round(times.avgFirstReply || 0)
      }
    });
  } catch (error) {
    console.error('Error in getOverview:', error);
    res.status(500).json({ message: 'Failed to fetch overview', error: error.message });
  }
};

/**
 * GET /api/kyc-goals/agents
 * Per-agent performance data
 */
exports.getAgents = async (req, res) => {
  try {
    const match = buildMatchFilter(req.query);

    const agentStats = await KYCTicket.aggregate([
      { $match: { ...match, claimedByAgentId: { $ne: null } } },
      {
        $group: {
          _id: '$claimedByAgentId',
          totalCases: { $sum: 1 },
          resolvedCases: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          channels: { $addToSet: '$slackChannelId' },
          avgResponseTime: { $avg: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] } },
          fastestResponse: { $min: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] } },
          responseTimes: { $push: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', '$$REMOVE'] } },
          casesByDay: { $push: { date: '$activityDate', status: '$status' } },
          shifts: { $push: '$shift' }
        }
      },
      { $sort: { totalCases: -1 } }
    ]);

    // Enrich with agent info and compute consistency
    const agents = await KYCAgent.find({
      _id: { $in: agentStats.map(s => s._id) }
    }).lean();

    const agentMap = {};
    agents.forEach(a => { agentMap[a._id.toString()] = a; });

    // Get channel docs for name mapping
    const allChannelIds = [...new Set(agentStats.flatMap(s => s.channels))];
    const channelDocs = await KYCChannel.find({ slackChannelId: { $in: allChannelIds } }).lean();
    const channelMap = {};
    channelDocs.forEach(c => { channelMap[c.slackChannelId] = c; });

    // Week comparison data
    const now = new Date();
    const thisWeekStart = KYCTicket.getBelgradeDateString(new Date(now.getTime() - 7 * 86400000));
    const thisWeekEnd = KYCTicket.getBelgradeDateString(now);
    const lastWeekStart = KYCTicket.getBelgradeDateString(new Date(now.getTime() - 14 * 86400000));
    const lastWeekEnd = KYCTicket.getBelgradeDateString(new Date(now.getTime() - 7 * 86400000));

    const [thisWeekStats, lastWeekStats] = await Promise.all([
      KYCTicket.aggregate([
        { $match: { activityDate: { $gte: thisWeekStart, $lte: thisWeekEnd }, claimedByAgentId: { $ne: null } } },
        { $group: { _id: '$claimedByAgentId', cases: { $sum: 1 }, avgTime: { $avg: '$responseTimeSeconds' } } }
      ]),
      KYCTicket.aggregate([
        { $match: { activityDate: { $gte: lastWeekStart, $lt: lastWeekEnd }, claimedByAgentId: { $ne: null } } },
        { $group: { _id: '$claimedByAgentId', cases: { $sum: 1 }, avgTime: { $avg: '$responseTimeSeconds' } } }
      ])
    ]);

    const thisWeekMap = {};
    thisWeekStats.forEach(s => { thisWeekMap[s._id.toString()] = s; });
    const lastWeekMap = {};
    lastWeekStats.forEach(s => { lastWeekMap[s._id.toString()] = s; });

    const result = agentStats.map((stat, idx) => {
      const agentInfo = agentMap[stat._id.toString()] || {};
      const responseTimes = stat.responseTimes || [];

      // Consistency: 100 - (stdDev / mean * 100), capped at 0-100
      let consistency = 0;
      if (responseTimes.length > 1) {
        const mean = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const variance = responseTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / responseTimes.length;
        const stdDev = Math.sqrt(variance);
        consistency = mean > 0 ? Math.max(0, Math.min(100, Math.round(100 - (stdDev / mean * 100)))) : 0;
      } else if (responseTimes.length === 1) {
        consistency = 100;
      }

      // Cases by day
      const dayMap = {};
      (stat.casesByDay || []).forEach(c => {
        dayMap[c.date] = (dayMap[c.date] || 0) + 1;
      });

      // Shift distribution
      const shiftDist = { morning: 0, afternoon: 0, night: 0 };
      (stat.shifts || []).forEach(s => {
        if (s) shiftDist[s] = (shiftDist[s] || 0) + 1;
      });

      const channelTags = stat.channels.map(cId => {
        const ch = channelMap[cId];
        return ch ? { name: ch.name, org: ch.organization } : { name: cId, org: 'Unknown' };
      });

      const agentId = stat._id.toString();
      const thisWeek = thisWeekMap[agentId];
      const lastWeek = lastWeekMap[agentId];

      return {
        _id: stat._id,
        rank: idx + 1,
        name: agentInfo.name || 'Unknown',
        email: agentInfo.email || '',
        channels: channelTags,
        totalCases: stat.totalCases,
        resolvedCases: stat.resolvedCases,
        avgResponseTime: Math.round(stat.avgResponseTime || 0),
        fastestResponse: stat.fastestResponse || 0,
        consistency,
        casesByDay: dayMap,
        shiftDistribution: shiftDist,
        weekComparison: {
          thisWeek: { cases: thisWeek?.cases || 0, avgTime: Math.round(thisWeek?.avgTime || 0) },
          lastWeek: { cases: lastWeek?.cases || 0, avgTime: Math.round(lastWeek?.avgTime || 0) }
        }
      };
    });

    res.json({ success: true, agents: result });
  } catch (error) {
    console.error('Error in getAgents:', error);
    res.status(500).json({ message: 'Failed to fetch agents', error: error.message });
  }
};

/**
 * GET /api/kyc-goals/agents/:id
 * Single agent detail
 */
exports.getAgentDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const match = buildMatchFilter(req.query);
    match.claimedByAgentId = new mongoose.Types.ObjectId(id);

    const agent = await KYCAgent.findById(id).lean();
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const tickets = await KYCTicket.find(match).sort({ createdAt: -1 }).limit(200).lean();

    const channelDocs = await KYCChannel.find({ slackChannelId: { $in: [...new Set(tickets.map(t => t.slackChannelId))] } }).lean();
    const channelMap = {};
    channelDocs.forEach(c => { channelMap[c.slackChannelId] = c; });

    // Per-channel breakdown
    const channelBreakdown = {};
    tickets.forEach(t => {
      const ch = channelMap[t.slackChannelId];
      const key = t.slackChannelId;
      if (!channelBreakdown[key]) {
        channelBreakdown[key] = { name: ch?.name || key, cases: 0, resolved: 0, totalResponseTime: 0, responseCount: 0 };
      }
      channelBreakdown[key].cases++;
      if (t.status === 'resolved') channelBreakdown[key].resolved++;
      if (t.responseTimeSeconds > 0) {
        channelBreakdown[key].totalResponseTime += t.responseTimeSeconds;
        channelBreakdown[key].responseCount++;
      }
    });

    Object.values(channelBreakdown).forEach(cb => {
      cb.avgResponseTime = cb.responseCount > 0 ? Math.round(cb.totalResponseTime / cb.responseCount) : 0;
      delete cb.totalResponseTime;
      delete cb.responseCount;
    });

    res.json({
      success: true,
      agent: {
        ...agent,
        channelBreakdown: Object.values(channelBreakdown),
        recentTickets: tickets.slice(0, 50).map(t => ({
          _id: t._id,
          channel: channelMap[t.slackChannelId]?.name || t.slackChannelId,
          status: t.status,
          createdAt: t.createdAt,
          responseTimeSeconds: t.responseTimeSeconds,
          shift: t.shift
        }))
      }
    });
  } catch (error) {
    console.error('Error in getAgentDetail:', error);
    res.status(500).json({ message: 'Failed to fetch agent detail', error: error.message });
  }
};

/**
 * GET /api/kyc-goals/channels
 * Per-channel data grouped by org
 */
exports.getChannels = async (req, res) => {
  try {
    const match = buildMatchFilter(req.query);

    const allChannels = await KYCChannel.find({ isActive: true }).lean();

    const channelStats = await KYCTicket.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$slackChannelId',
          totalCases: { $sum: 1 },
          resolvedCases: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          openCases: { $sum: { $cond: [{ $in: ['$status', ['open', 'claimed', 'in_progress']] }, 1, 0] } },
          activeAgents: { $addToSet: '$claimedByAgentId' },
          avgResponseTime: { $avg: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] } },
          avgHandlingTime: { $avg: { $cond: [{ $gt: ['$totalHandlingTimeSeconds', 0] }, '$totalHandlingTimeSeconds', null] } },
          dailyData: { $push: { date: '$activityDate', agentId: '$claimedByAgentId' } }
        }
      }
    ]);

    const statsMap = {};
    channelStats.forEach(s => { statsMap[s._id] = s; });

    // Agent breakdown per channel
    const agentBreakdowns = await KYCTicket.aggregate([
      { $match: { ...match, claimedByAgentId: { $ne: null } } },
      {
        $group: {
          _id: { channel: '$slackChannelId', agent: '$claimedByAgentId' },
          cases: { $sum: 1 },
          avgTime: { $avg: '$responseTimeSeconds' }
        }
      }
    ]);

    const agentIds = [...new Set(agentBreakdowns.map(a => a._id.agent?.toString()).filter(Boolean))];
    const agentDocs = await KYCAgent.find({ _id: { $in: agentIds } }).lean();
    const agentMap = {};
    agentDocs.forEach(a => { agentMap[a._id.toString()] = a; });

    // Group by org
    const orgGroups = {};
    allChannels.forEach(ch => {
      if (!orgGroups[ch.organization]) orgGroups[ch.organization] = [];
      const stat = statsMap[ch.slackChannelId] || {};

      // Daily volume for sparkline
      const dailyMap = {};
      (stat.dailyData || []).forEach(d => {
        dailyMap[d.date] = (dailyMap[d.date] || 0) + 1;
      });

      // Agent cards for this channel
      const channelAgents = agentBreakdowns
        .filter(a => a._id.channel === ch.slackChannelId)
        .map(a => ({
          _id: a._id.agent,
          name: agentMap[a._id.agent?.toString()]?.name || 'Unknown',
          cases: a.cases,
          avgResponseTime: Math.round(a.avgTime || 0)
        }))
        .sort((a, b) => b.cases - a.cases);

      orgGroups[ch.organization].push({
        _id: ch._id,
        name: ch.name,
        slackChannelId: ch.slackChannelId,
        trackingMode: ch.trackingMode || 'full',
        totalCases: stat.totalCases || 0,
        resolvedCases: stat.resolvedCases || 0,
        backlog: stat.openCases || 0,
        activeAgents: (stat.activeAgents || []).filter(Boolean).length,
        avgResponseTime: Math.round(stat.avgResponseTime || 0),
        avgHandlingTime: Math.round(stat.avgHandlingTime || 0),
        dailyVolume: dailyMap,
        agents: channelAgents
      });
    });

    res.json({ success: true, channels: orgGroups });
  } catch (error) {
    console.error('Error in getChannels:', error);
    res.status(500).json({ message: 'Failed to fetch channels', error: error.message });
  }
};

/**
 * GET /api/kyc-goals/channels/:id
 * Single channel detail
 */
exports.getChannelDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const channel = await KYCChannel.findById(id).lean();
    if (!channel) return res.status(404).json({ message: 'Channel not found' });

    const match = buildMatchFilter(req.query);
    match.slackChannelId = channel.slackChannelId;

    const [stats, dailyStats] = await Promise.all([
      KYCTicket.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalCases: { $sum: 1 },
            resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
            open: { $sum: { $cond: [{ $ne: ['$status', 'resolved'] }, 1, 0] } },
            avgClaimTime: { $avg: '$responseTimeSeconds' },
            avgHandling: { $avg: '$totalHandlingTimeSeconds' },
            agents: { $addToSet: '$claimedByAgentId' }
          }
        }
      ]),
      KYCTicket.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$activityDate',
            cases: { $sum: 1 },
            resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      success: true,
      channel: {
        ...channel,
        stats: stats[0] || {},
        dailyStats
      }
    });
  } catch (error) {
    console.error('Error in getChannelDetail:', error);
    res.status(500).json({ message: 'Failed to fetch channel detail', error: error.message });
  }
};

/**
 * GET /api/kyc-goals/config
 * List all KYCChannel docs
 */
exports.getConfig = async (req, res) => {
  try {
    const channels = await KYCChannel.find().sort({ organization: 1, name: 1 }).lean();

    // Check if bot token is configured
    const botConfigured = !!process.env.KYC_STATS_SLACK_BOT_TOKEN;
    const signingConfigured = !!process.env.KYC_STATS_SLACK_SIGNING_SECRET;

    res.json({
      success: true,
      channels,
      botStatus: {
        tokenConfigured: botConfigured,
        signingSecretConfigured: signingConfigured,
        webhookUrl: '/api/kyc-stats/slack-events'
      }
    });
  } catch (error) {
    console.error('Error in getConfig:', error);
    res.status(500).json({ message: 'Failed to fetch config', error: error.message });
  }
};

/**
 * GET /api/kyc-goals/trends
 * Daily aggregated data for charts
 */
exports.getTrends = async (req, res) => {
  try {
    const match = buildMatchFilter(req.query);

    // Fetch channel docs for name mapping
    const allChannels = await KYCChannel.find({ isActive: true }).lean();
    const channelNameMap = {};
    allChannels.forEach(c => { channelNameMap[c.slackChannelId] = c.name; });

    const [dailyCasesAgg, dailyResponseTimeAgg, dailyActiveAgentsAgg, shiftDistAgg] = await Promise.all([
      // Daily cases with per-channel breakdown
      KYCTicket.aggregate([
        { $match: match },
        {
          $group: {
            _id: { date: '$activityDate', channel: '$slackChannelId' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.date': 1 } }
      ]),
      // Daily response time stats
      KYCTicket.aggregate([
        { $match: { ...match, responseTimeSeconds: { $gt: 0 } } },
        {
          $group: {
            _id: '$activityDate',
            avg: { $avg: '$responseTimeSeconds' },
            min: { $min: '$responseTimeSeconds' },
            max: { $max: '$responseTimeSeconds' }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Daily active agents
      KYCTicket.aggregate([
        { $match: { ...match, claimedByAgentId: { $ne: null } } },
        {
          $group: {
            _id: '$activityDate',
            agents: { $addToSet: '$claimedByAgentId' }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      // Shift distribution by day
      KYCTicket.aggregate([
        { $match: match },
        {
          $group: {
            _id: { date: '$activityDate', shift: '$shift' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.date': 1 } }
      ])
    ]);

    // Build dailyCases
    const dailyCasesMap = {};
    dailyCasesAgg.forEach(row => {
      const date = row._id.date;
      if (!dailyCasesMap[date]) dailyCasesMap[date] = { date, total: 0, byChannel: {} };
      const channelName = channelNameMap[row._id.channel] || row._id.channel;
      dailyCasesMap[date].total += row.count;
      dailyCasesMap[date].byChannel[channelName] = (dailyCasesMap[date].byChannel[channelName] || 0) + row.count;
    });
    const dailyCases = Object.values(dailyCasesMap).sort((a, b) => a.date.localeCompare(b.date));

    // Build dailyResponseTime
    const dailyResponseTime = dailyResponseTimeAgg.map(row => ({
      date: row._id,
      avg: Math.round(row.avg || 0),
      min: row.min || 0,
      max: row.max || 0
    }));

    // Build dailyActiveAgents
    const dailyActiveAgents = dailyActiveAgentsAgg.map(row => ({
      date: row._id,
      count: row.agents.filter(Boolean).length
    }));

    // Build shiftDistribution
    const shiftMap = {};
    shiftDistAgg.forEach(row => {
      const date = row._id.date;
      if (!shiftMap[date]) shiftMap[date] = { date, morning: 0, afternoon: 0, night: 0 };
      const shift = row._id.shift;
      if (shift && shiftMap[date][shift] !== undefined) {
        shiftMap[date][shift] = row.count;
      }
    });
    const shiftDistribution = Object.values(shiftMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: {
        dailyCases,
        dailyResponseTime,
        dailyActiveAgents,
        shiftDistribution
      }
    });
  } catch (error) {
    console.error('Error in getTrends:', error);
    res.status(500).json({ message: 'Failed to fetch trends', error: error.message });
  }
};

/**
 * POST /api/kyc-goals/seed
 * Upsert 4 channels + 73 agents
 */
exports.seed = async (req, res) => {
  try {
    // Seed channels
    const channelSeeds = [
      // Stake.com (6 channels)
      { name: 'mebit-kyc', slackChannelId: 'C03CNGD0L9W', organization: 'Stake.com' },
      { name: 'fraud-abuse-kyc', slackChannelId: 'C058YDDMWAD', organization: 'Stake.com' },
      { name: 'kyc-payments', slackChannelId: 'C07JQN3QSRZ', organization: 'Stake.com' },
      { name: 'kyc-poker', slackChannelId: 'C07U69U0FFS', organization: 'Stake.com', trackingMode: 'message_count' },
      { name: 'sportsbook-kyc_team', slackChannelId: 'C03UNB9F5BP', organization: 'Stake.com' },
      { name: 'vip-hosts-kyc', slackChannelId: 'C069WRZHMKP', organization: 'Stake.com' },
      // Stake.us (2 channels)
      { name: 'po-box-stake-us', slackChannelId: 'C07AP7TBLD9', organization: 'Stake.us' },
      { name: 'stake-us-veriff-pd', slackChannelId: 'C07AP8VT2RG', organization: 'Stake.us' },
      // Stake Brazil (1 channel)
      { name: 'br-kyc-support', slackChannelId: 'C086ZK47KNE', organization: 'Stake Brazil' },
      // Stake Denmark (2 channels)
      { name: 'dk-kyc-compliance', slackChannelId: 'C09RQM4T11B', organization: 'Stake Denmark' },
      { name: 'dk-kyc-support', slackChannelId: 'C09M61ADX97', organization: 'Stake Denmark' },
      // Stake Italy (1 channel)
      { name: 'italy-support-kyc', slackChannelId: 'C0909QR6W21', organization: 'Stake Italy' }
    ];

    const channelResults = [];
    for (const ch of channelSeeds) {
      const result = await KYCChannel.findOneAndUpdate(
        { slackChannelId: ch.slackChannelId },
        { $set: ch, $setOnInsert: { isActive: true } },
        { upsert: true, new: true }
      );
      channelResults.push(result);
    }

    // Seed agents (74 from MarkoT's email list) — explicit name+email pairs
    const agentSeeds = [
      { email: 'markotodorovic@mebit.io', name: 'Marko Todorovic' },
      { email: 'milanradisavljevic@mebit.io', name: 'Milan Radisavljevic' },
      { email: 'jelenaradisavljevic@mebit.io', name: 'Jelena Radisavljevic' },
      { email: 'dragana@mebit.io', name: 'Dragana' },
      { email: 'miljana@mebit.io', name: 'Miljana' },
      { email: 'draganat@mebit.io', name: 'Dragana T' },
      { email: 'slavisa@mebit.io', name: 'Slavisa' },
      { email: 'aleksandarrakovac@mebit.io', name: 'Aleksandar Rakovac' },
      { email: 'milicazamboni@mebit.io', name: 'Milica Zamboni' },
      { email: 'anica@mebit.io', name: 'Anica' },
      { email: 'dragan@mebit.io', name: 'Dragan' },
      { email: 'braca@mebit.io', name: 'Braca' },
      { email: 'branislava@mebit.io', name: 'Branislava' },
      { email: 'andrijana@mebit.io', name: 'Andrijana' },
      { email: 'nina@mebit.io', name: 'Nina' },
      { email: 'aleksandrastankovic@mebit.io', name: 'Aleksandra Stankovic' },
      { email: 'vesna@mebit.io', name: 'Vesna' },
      { email: 'tijanam@mebit.io', name: 'Tijana M' },
      { email: 'simeon@mebit.io', name: 'Simeon' },
      { email: 'nadjamarkovic@mebit.io', name: 'Nadja Markovic' },
      { email: 'malisa@mebit.io', name: 'Malisa' },
      { email: 'jelenaignjatovic@mebit.io', name: 'Jelena Ignjatovic' },
      { email: 'aleksandramiljkovic@mebit.io', name: 'Aleksandra Miljkovic' },
      { email: 'ivanamiljkovic@mebit.io', name: 'Ivana Miljkovic' },
      { email: 'sylvia@mebit.io', name: 'Sylvia' },
      { email: 'ignjattimotijevic@mebit.io', name: 'Ignjat Timotijevic' },
      { email: 'milosdjurovic@mebit.io', name: 'Milos Djurovic' },
      { email: 'vojin@mebit.io', name: 'Vojin' },
      { email: 'nemanjazivkovic@mebit.io', name: 'Nemanja Zivkovic' },
      { email: 'daliborka@mebit.io', name: 'Daliborka' },
      { email: 'marina@mebit.io', name: 'Marina' },
      { email: 'danilo@mebit.io', name: 'Danilo' },
      { email: 'ksenija@mebit.io', name: 'Ksenija' },
      { email: 'stefanlazovic@mebit.io', name: 'Stefan Lazovic' },
      { email: 'mihailo@mebit.io', name: 'Mihailo' },
      { email: 'aleksamihajlovic@mebit.io', name: 'Aleksa Mihajlovic' },
      { email: 'djordjemako@mebit.io', name: 'Djordje Mako' },
      { email: 'ninanovicic@mebit.io', name: 'Nina Novicic' },
      { email: 'katarinakuzmanovic@mebit.io', name: 'Katarina Kuzmanovic' },
      { email: 'mileva@mebit.io', name: 'Mileva' },
      { email: 'vucko@mebit.io', name: 'Vucko' },
      { email: 'andrijamilovanovic@mebit.io', name: 'Andrija Milovanovic' },
      { email: 'kristina@mebit.io', name: 'Kristina' },
      { email: 'mionaacimovic@mebit.io', name: 'Miona Acimovic' },
      { email: 'pavledjokic@mebit.io', name: 'Pavle Djokic' },
      { email: 'radovanstanojcic@mebit.io', name: 'Radovan Stanojcic' },
      { email: 'milicavukadinovic@mebit.io', name: 'Milica Vukadinovic' },
      { email: 'filipminasevic@mebit.io', name: 'Filip Minasevic' },
      { email: 'novicagarovic@mebit.io', name: 'Novica Garovic' },
      { email: 'ljiljanajankovic@mebit.io', name: 'Ljiljana Jankovic' },
      { email: 'tamaracvetkovic@mebit.io', name: 'Tamara Cvetkovic' },
      { email: 'dusankacarevic@mebit.io', name: 'Dusanka Carevic' },
      { email: 'valentinadjokovic@mebit.io', name: 'Valentina Djokovic' },
      { email: 'momcilocrnoglavac@mebit.io', name: 'Momcilo Crnoglavac' },
      { email: 'lazarstevanovic@mebit.io', name: 'Lazar Stevanovic' },
      { email: 'dunja@mebit.io', name: 'Dunja' },
      { email: 'markoilic@mebit.io', name: 'Marko Ilic' },
      { email: 'milanpetrovic@mebit.io', name: 'Milan Petrovic' },
      { email: 'jelenadimitrijevic@mebit.io', name: 'Jelena Dimitrijevic' },
      { email: 'ivanbanovic@mebit.io', name: 'Ivan Banovic' },
      { email: 'brankobegovic@mebit.io', name: 'Branko Begovic' },
      { email: 'branislavatijanic@mebit.io', name: 'Branislava Tijanic' },
      { email: 'aleksandarmarkovic@mebit.io', name: 'Aleksandar Markovic' },
      { email: 'marijanakrasic@mebit.io', name: 'Marijana Krasic' },
      { email: 'emamiodragovic@mebit.io', name: 'Ema Miodragovic' },
      { email: 'lazarkrstic@mebit.io', name: 'Lazar Krstic' },
      { email: 'markolukic@mebit.io', name: 'Marko Lukic' },
      { email: 'aleksakrstic@mebit.io', name: 'Aleksa Krstic' },
      { email: 'stefanjargic@mebit.io', name: 'Stefan Jargic' },
      { email: 'andjelapuric@mebit.io', name: 'Andjela Puric' },
      { email: 'zeljkotrifunovic@mebit.io', name: 'Zeljko Trifunovic' },
      { email: 'stefanandjelkovic@mebit.io', name: 'Stefan Andjelkovic' },
      { email: 'marijanajakovljevic@mebit.io', name: 'Marijana Jakovljevic' },
      { email: 'sarapajic@mebit.io', name: 'Sara Pajic' }
    ];

    const agentResults = { created: 0, existing: 0 };
    for (const { email, name } of agentSeeds) {
      const existing = await KYCAgent.findOne({ email: email.toLowerCase() });
      if (!existing) {
        await KYCAgent.create({ name, email: email.toLowerCase() });
        agentResults.created++;
      } else {
        agentResults.existing++;
      }
    }

    res.json({
      success: true,
      channels: { seeded: channelResults.length },
      agents: agentResults
    });
  } catch (error) {
    console.error('Error in seed:', error);
    res.status(500).json({ message: 'Failed to seed data', error: error.message });
  }
};
