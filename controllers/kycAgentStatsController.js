const crypto = require('crypto');
const { WebClient } = require('@slack/web-api');
const KYCAgent = require('../models/KYCAgent');
const KYCAgentActivity = require('../models/KYCAgentActivity');

// Slack client for KYC Stats (read-only bot)
let slackClient = null;

const getSlackClient = () => {
  if (!slackClient && process.env.KYC_STATS_SLACK_BOT_TOKEN) {
    slackClient = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);
  }
  return slackClient;
};

/**
 * Verify Slack request signature
 */
const verifySlackSignature = (req, rawBody) => {
  const slackSignature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];

  if (!slackSignature || !timestamp) {
    console.warn('Missing Slack signature headers');
    return false;
  }

  // Prevent replay attacks
  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - parseInt(timestamp)) > 300) {
    console.warn('Slack request timestamp too old');
    return false;
  }

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
 * Handle Slack Events for KYC Stats
 * POST /api/kyc-stats/slack-events
 */
exports.handleSlackEvents = async (req, res) => {
  try {
    let rawBody, payload;

    // Parse the body
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


    // Handle URL verification challenge
    if (payload.type === 'url_verification') {
      return res.json({ challenge: payload.challenge });
    }

    // Verify signature for all other events
    if (!verifySlackSignature(req, rawBody)) {
      console.error('❌ KYC Stats signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Handle event callbacks
    if (payload.type === 'event_callback') {
      const event = payload.event;

      // Only process events from the configured KYC channel
      const kycChannelId = process.env.KYC_STATS_CHANNEL_ID;
      if (event.channel !== kycChannelId && event.item?.channel !== kycChannelId) {
        // Event not from our channel, ignore
        return res.status(200).send();
      }


      // Handle reaction_added (⏳ emoji)
      if (event.type === 'reaction_added') {
        await handleReactionAdded(event);
      }

      // Handle message events (replies in threads)
      if (event.type === 'message' && event.thread_ts) {
        await handleThreadMessage(event);
      }

      return res.status(200).send();
    }

    res.status(200).send();
  } catch (error) {
    console.error('❌ KYC Stats webhook error:', error);
    res.status(200).send(); // Always respond 200 to prevent Slack retries
  }
};

/**
 * Handle reaction_added event (⏳ emoji = ticket taken)
 */
const handleReactionAdded = async (event) => {
  try {
    // Check if it's the hourglass emoji (⏳)
    // Slack uses 'hourglass_flowing_sand' or 'hourglass' for ⏳
    const hourglassEmojis = ['hourglass_flowing_sand', 'hourglass', 'timer_clock'];
    if (!hourglassEmojis.includes(event.reaction)) {
      return;
    }


    // Find the agent by Slack ID
    let agent = await KYCAgent.findBySlackId(event.user);

    if (!agent) {
      // Try to fetch user info from Slack and match by email
      const client = getSlackClient();
      if (client) {
        try {
          const userInfo = await client.users.info({ user: event.user });
          if (userInfo.ok && userInfo.user.profile.email) {
            agent = await KYCAgent.findByEmail(userInfo.user.profile.email);
            if (agent) {
              // Update agent with Slack ID
              agent.slackUserId = event.user;
              agent.slackUsername = userInfo.user.name;
              await agent.save();
            }
          }
        } catch (e) {
          console.error('Error fetching Slack user info:', e.message);
        }
      }
    }

    if (!agent) {
        return;
    }

    // Record the ticket taken activity
    // event.item.ts is the timestamp of the message the reaction was added to
    // This could be the original thread message OR a message within the thread
    await KYCAgentActivity.recordTicketTaken({
      agentId: agent._id,
      agentSlackId: event.user,
      threadTs: event.item.ts, // For thread tracking
      parentMessageTs: event.item.ts, // The specific message reacted to
      reactionTs: event.event_ts,
      channelId: event.item.channel
    });

  } catch (error) {
    console.error('❌ Error handling reaction:', error);
  }
};

/**
 * Handle message event in thread (agent reply)
 */
const handleThreadMessage = async (event) => {
  try {
    // Ignore bot messages
    if (event.bot_id || event.subtype === 'bot_message') {
      return;
    }


    // Find the agent
    let agent = await KYCAgent.findBySlackId(event.user);

    if (!agent) {
      // Try to match by email
      const client = getSlackClient();
      if (client) {
        try {
          const userInfo = await client.users.info({ user: event.user });
          if (userInfo.ok && userInfo.user.profile.email) {
            agent = await KYCAgent.findByEmail(userInfo.user.profile.email);
            if (agent) {
              agent.slackUserId = event.user;
              agent.slackUsername = userInfo.user.name;
              await agent.save();
            }
          }
        } catch (e) {
          console.error('Error fetching Slack user info:', e.message);
        }
      }
    }

    if (!agent) {
      // Not a tracked agent, ignore
      return;
    }

    // Record the message activity
    await KYCAgentActivity.recordMessage({
      agentId: agent._id,
      agentSlackId: event.user,
      threadTs: event.thread_ts,
      messageTs: event.ts,
      messagePreview: event.text,
      channelId: event.channel,
      isThreadReply: true
    });

  } catch (error) {
    console.error('❌ Error handling thread message:', error);
  }
};

// ============================================
// AGENT MANAGEMENT ENDPOINTS
// ============================================

/**
 * Get all KYC agents
 * GET /api/kyc-stats/agents
 */
exports.getAllAgents = async (req, res) => {
  try {
    const agents = await KYCAgent.getAllActive();
    res.json({ success: true, agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Failed to fetch agents', error: error.message });
  }
};

/**
 * Add a new KYC agent
 * POST /api/kyc-stats/agents
 */
exports.addAgent = async (req, res) => {
  try {
    const { name, email, defaultShift } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    // Check if agent already exists
    const existing = await KYCAgent.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'Agent with this email already exists' });
    }

    const agent = await KYCAgent.create({
      name,
      email: email.toLowerCase(),
      defaultShift
    });

    res.status(201).json({ success: true, agent });
  } catch (error) {
    console.error('Error adding agent:', error);
    res.status(500).json({ message: 'Failed to add agent', error: error.message });
  }
};

/**
 * Update agent
 * PUT /api/kyc-stats/agents/:id
 */
exports.updateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, defaultShift, isActive } = req.body;

    const agent = await KYCAgent.findByIdAndUpdate(
      id,
      { name, email, defaultShift, isActive },
      { new: true }
    );

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    res.json({ success: true, agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ message: 'Failed to update agent', error: error.message });
  }
};

/**
 * Delete agent (soft delete)
 * DELETE /api/kyc-stats/agents/:id
 */
exports.deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await KYCAgent.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    res.json({ success: true, message: 'Agent deactivated' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: 'Failed to delete agent', error: error.message });
  }
};

/**
 * Seed initial agents
 * POST /api/kyc-stats/agents/seed
 */
exports.seedAgents = async (req, res) => {
  try {
    const initialAgents = [
      { name: 'Milan Petrovic', email: 'milanpetrovic@mebit.io' },
      { name: 'Milica Vukadinovic', email: 'milicavukadinovic@mebit.io' },
      { name: 'Andrija Milovanovic', email: 'andrijamilovanovic@mebit.io' },
      { name: 'Novica Garovic', email: 'novicagarovic@mebit.io' }
    ];

    const results = [];
    for (const agentData of initialAgents) {
      const existing = await KYCAgent.findOne({ email: agentData.email });
      if (!existing) {
        const agent = await KYCAgent.create(agentData);
        results.push({ created: true, agent });
      } else {
        results.push({ created: false, agent: existing, message: 'Already exists' });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error seeding agents:', error);
    res.status(500).json({ message: 'Failed to seed agents', error: error.message });
  }
};

// ============================================
// STATISTICS ENDPOINTS
// ============================================

/**
 * Get overview statistics
 * GET /api/kyc-stats/overview
 */
exports.getOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Default to last 7 days
    const end = endDate || KYCAgentActivity.getBelgradeDateString(new Date());
    const start = startDate || KYCAgentActivity.getBelgradeDateString(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    const agents = await KYCAgent.getAllActive();

    const overview = await Promise.all(agents.map(async (agent) => {
      const stats = await KYCAgentActivity.getAgentStats(agent._id, start, end);

      const ticketsTaken = stats.find(s => s._id === 'ticket_taken');
      const threadReplies = stats.find(s => s._id === 'thread_reply');

      return {
        agent: {
          _id: agent._id,
          name: agent.name,
          email: agent.email
        },
        stats: {
          ticketsTaken: ticketsTaken?.count || 0,
          messagesCount: threadReplies?.count || 0,
          avgResponseTime: Math.round(ticketsTaken?.avgResponseTime || 0),
          minResponseTime: ticketsTaken?.minResponseTime || null,
          maxResponseTime: ticketsTaken?.maxResponseTime || null
        }
      };
    }));

    res.json({
      success: true,
      dateRange: { start, end },
      overview
    });
  } catch (error) {
    console.error('Error fetching overview:', error);
    res.status(500).json({ message: 'Failed to fetch overview', error: error.message });
  }
};

/**
 * Get detailed stats for a single agent
 * GET /api/kyc-stats/agent/:id
 */
exports.getAgentStats = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const agent = await KYCAgent.findById(id);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Default to last 30 days
    const end = endDate || KYCAgentActivity.getBelgradeDateString(new Date());
    const start = startDate || KYCAgentActivity.getBelgradeDateString(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    const [overallStats, shiftStats, dailyStats] = await Promise.all([
      KYCAgentActivity.getAgentStats(id, start, end),
      KYCAgentActivity.getStatsByShift(id, start, end),
      KYCAgentActivity.getDailyStats(id, start, end)
    ]);

    // Get recent activities
    const recentActivities = await KYCAgentActivity.find({
      agentId: id,
      activityDate: { $gte: start, $lte: end }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      agent: {
        _id: agent._id,
        name: agent.name,
        email: agent.email
      },
      dateRange: { start, end },
      overallStats,
      shiftStats,
      dailyStats,
      recentActivities
    });
  } catch (error) {
    console.error('Error fetching agent stats:', error);
    res.status(500).json({ message: 'Failed to fetch agent stats', error: error.message });
  }
};

/**
 * Get leaderboard
 * GET /api/kyc-stats/leaderboard
 */
exports.getLeaderboard = async (req, res) => {
  try {
    const { startDate, endDate, sortBy = 'ticketsTaken' } = req.query;

    const end = endDate || KYCAgentActivity.getBelgradeDateString(new Date());
    const start = startDate || KYCAgentActivity.getBelgradeDateString(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    const agents = await KYCAgent.getAllActive();

    const leaderboard = await Promise.all(agents.map(async (agent) => {
      const stats = await KYCAgentActivity.getAgentStats(agent._id, start, end);
      const ticketsTaken = stats.find(s => s._id === 'ticket_taken');

      return {
        agent: {
          _id: agent._id,
          name: agent.name
        },
        ticketsTaken: ticketsTaken?.count || 0,
        avgResponseTime: Math.round(ticketsTaken?.avgResponseTime || 0),
        fastestResponse: ticketsTaken?.minResponseTime || null
      };
    }));

    // Sort leaderboard
    leaderboard.sort((a, b) => {
      if (sortBy === 'avgResponseTime') {
        // Lower is better for response time
        return (a.avgResponseTime || Infinity) - (b.avgResponseTime || Infinity);
      }
      // Higher is better for tickets taken
      return b.ticketsTaken - a.ticketsTaken;
    });

    res.json({
      success: true,
      dateRange: { start, end },
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Failed to fetch leaderboard', error: error.message });
  }
};

/**
 * Get stats by shift
 * GET /api/kyc-stats/by-shift
 */
exports.getStatsByShift = async (req, res) => {
  try {
    const { startDate, endDate, shift } = req.query;

    const end = endDate || KYCAgentActivity.getBelgradeDateString(new Date());
    const start = startDate || KYCAgentActivity.getBelgradeDateString(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    const match = {
      activityDate: { $gte: start, $lte: end }
    };

    if (shift) {
      match.shift = shift;
    }

    const stats = await KYCAgentActivity.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            agentSlackId: '$agentSlackId',
            shift: '$shift'
          },
          ticketsTaken: {
            $sum: { $cond: [{ $eq: ['$activityType', 'ticket_taken'] }, 1, 0] }
          },
          messagesCount: {
            $sum: { $cond: [{ $eq: ['$activityType', 'thread_reply'] }, 1, 0] }
          },
          avgResponseTime: {
            $avg: {
              $cond: [
                { $and: [
                  { $eq: ['$activityType', 'ticket_taken'] },
                  { $gt: ['$responseTimeSeconds', 0] }
                ]},
                '$responseTimeSeconds',
                null
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'kycagents',
          localField: '_id.agentSlackId',
          foreignField: 'slackUserId',
          as: 'agentInfo'
        }
      },
      {
        $project: {
          shift: '$_id.shift',
          agentSlackId: '$_id.agentSlackId',
          agentName: { $arrayElemAt: ['$agentInfo.name', 0] },
          ticketsTaken: 1,
          messagesCount: 1,
          avgResponseTime: { $round: ['$avgResponseTime', 0] }
        }
      },
      { $sort: { shift: 1, ticketsTaken: -1 } }
    ]);

    res.json({
      success: true,
      dateRange: { start, end },
      stats
    });
  } catch (error) {
    console.error('Error fetching stats by shift:', error);
    res.status(500).json({ message: 'Failed to fetch stats', error: error.message });
  }
};

/**
 * Get activity feed
 * GET /api/kyc-stats/activity-feed
 */
exports.getActivityFeed = async (req, res) => {
  try {
    const { startDate, endDate, activityType, agentId, limit = 100 } = req.query;

    // Default to last 7 days
    const end = endDate || KYCAgentActivity.getBelgradeDateString(new Date());
    const start = startDate || KYCAgentActivity.getBelgradeDateString(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    // Build match query
    const match = {
      activityDate: { $gte: start, $lte: end }
    };

    if (activityType) {
      match.activityType = activityType;
    }

    if (agentId) {
      const mongoose = require('mongoose');
      match.agentId = new mongoose.Types.ObjectId(agentId);
    }

    // Fetch activities with agent info
    const activities = await KYCAgentActivity.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $limit: parseInt(limit, 10) },
      {
        $lookup: {
          from: 'kycagents',
          localField: 'agentId',
          foreignField: '_id',
          as: 'agentInfo'
        }
      },
      {
        $project: {
          _id: 1,
          activityType: 1,
          agentId: 1,
          agentSlackId: 1,
          agentName: { $arrayElemAt: ['$agentInfo.name', 0] },
          threadTs: 1,
          messagePreview: 1,
          responseTimeSeconds: 1,
          shift: 1,
          activityDate: 1,
          reactionAddedAt: 1,
          firstReplyAt: 1,
          createdAt: 1
        }
      }
    ]);

    res.json({
      success: true,
      dateRange: { start, end },
      activities
    });
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({ message: 'Failed to fetch activity feed', error: error.message });
  }
};

/**
 * Get comprehensive statistics for analytics dashboard
 * GET /api/kyc-stats/statistics
 */
exports.getStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Default to last 7 days
    const end = endDate || KYCAgentActivity.getBelgradeDateString(new Date());
    const start = startDate || KYCAgentActivity.getBelgradeDateString(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    // Calculate previous period for comparison
    const startD = new Date(start);
    const endD = new Date(end);
    const daysDiff = Math.ceil((endD - startD) / (1000 * 60 * 60 * 24)) + 1;

    const prevEnd = new Date(startD);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - daysDiff + 1);
    const prevStartStr = KYCAgentActivity.getBelgradeDateString(prevStart);
    const prevEndStr = KYCAgentActivity.getBelgradeDateString(prevEnd);

    // ============================================
    // 1. CURRENT PERIOD SUMMARY
    // ============================================
    const summaryStats = await KYCAgentActivity.aggregate([
      { $match: { activityDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 },
          avgResponseTime: {
            $avg: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          },
          minResponseTime: {
            $min: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          },
          maxResponseTime: {
            $max: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          },
          medianData: {
            $push: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', '$$REMOVE'] }
          }
        }
      }
    ]);

    // ============================================
    // 2. PREVIOUS PERIOD FOR COMPARISON
    // ============================================
    const prevSummaryStats = await KYCAgentActivity.aggregate([
      { $match: { activityDate: { $gte: prevStartStr, $lte: prevEndStr } } },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 },
          avgResponseTime: {
            $avg: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          }
        }
      }
    ]);

    const ticketStats = summaryStats.find(s => s._id === 'ticket_taken') || { count: 0, medianData: [] };
    const messageStats = summaryStats.find(s => s._id === 'thread_reply') || { count: 0 };
    const prevTicketStats = prevSummaryStats.find(s => s._id === 'ticket_taken') || { count: 0 };
    const prevMessageStats = prevSummaryStats.find(s => s._id === 'thread_reply') || { count: 0 };

    // Calculate median response time
    const sortedResponseTimes = (ticketStats.medianData || []).sort((a, b) => a - b);
    const medianResponseTime = sortedResponseTimes.length > 0
      ? sortedResponseTimes[Math.floor(sortedResponseTimes.length / 2)]
      : 0;

    // Calculate percentage changes
    const ticketChange = prevTicketStats.count > 0
      ? Math.round(((ticketStats.count - prevTicketStats.count) / prevTicketStats.count) * 100)
      : 0;
    const messageChange = prevMessageStats.count > 0
      ? Math.round(((messageStats.count - prevMessageStats.count) / prevMessageStats.count) * 100)
      : 0;
    const responseTimeChange = prevTicketStats.avgResponseTime > 0
      ? Math.round((((ticketStats.avgResponseTime || 0) - prevTicketStats.avgResponseTime) / prevTicketStats.avgResponseTime) * 100)
      : 0;

    // ============================================
    // 3. DETAILED AGENT STATISTICS
    // ============================================
    const detailedAgentStats = await KYCAgentActivity.aggregate([
      { $match: { activityDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { agentId: '$agentId', type: '$activityType', shift: '$shift' },
          count: { $sum: 1 },
          avgResponseTime: {
            $avg: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          },
          minResponseTime: {
            $min: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          },
          maxResponseTime: {
            $max: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          },
          responseTimes: {
            $push: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', '$$REMOVE'] }
          }
        }
      },
      {
        $group: {
          _id: '$_id.agentId',
          activities: {
            $push: {
              type: '$_id.type',
              shift: '$_id.shift',
              count: '$count',
              avgResponseTime: '$avgResponseTime',
              minResponseTime: '$minResponseTime',
              maxResponseTime: '$maxResponseTime',
              responseTimes: '$responseTimes'
            }
          },
          totalActivities: { $sum: '$count' }
        }
      },
      {
        $lookup: {
          from: 'kycagents',
          localField: '_id',
          foreignField: '_id',
          as: 'agent'
        }
      },
      { $sort: { totalActivities: -1 } }
    ]);

    // Process agent data into detailed comparison
    const agentComparison = detailedAgentStats.map(a => {
      const ticketActivities = a.activities.filter(act => act.type === 'ticket_taken');
      const messageActivities = a.activities.filter(act => act.type === 'thread_reply');

      const totalTickets = ticketActivities.reduce((sum, act) => sum + act.count, 0);
      const totalMessages = messageActivities.reduce((sum, act) => sum + act.count, 0);

      const allResponseTimes = ticketActivities.flatMap(act => act.responseTimes || []);
      const avgResponseTime = allResponseTimes.length > 0
        ? allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
        : 0;
      const minResponseTime = allResponseTimes.length > 0 ? Math.min(...allResponseTimes) : 0;
      const maxResponseTime = allResponseTimes.length > 0 ? Math.max(...allResponseTimes) : 0;

      // Calculate consistency score (lower std deviation = more consistent)
      let consistencyScore = 100;
      if (allResponseTimes.length > 1) {
        const mean = avgResponseTime;
        const variance = allResponseTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / allResponseTimes.length;
        const stdDev = Math.sqrt(variance);
        // Normalize: if stdDev is 0, score is 100; if stdDev equals mean, score is 0
        consistencyScore = Math.max(0, Math.round(100 - (stdDev / (mean || 1)) * 100));
      }

      // Shift breakdown
      const shiftBreakdown = {
        morning: ticketActivities.filter(a => a.shift === 'morning').reduce((s, a) => s + a.count, 0),
        afternoon: ticketActivities.filter(a => a.shift === 'afternoon').reduce((s, a) => s + a.count, 0),
        night: ticketActivities.filter(a => a.shift === 'night').reduce((s, a) => s + a.count, 0)
      };

      return {
        id: a._id,
        name: a.agent[0]?.name || 'Unknown',
        email: a.agent[0]?.email || '',
        tickets: totalTickets,
        messages: totalMessages,
        totalActivities: a.totalActivities,
        avgResponseTime: Math.round(avgResponseTime),
        minResponseTime,
        maxResponseTime,
        consistencyScore,
        shiftBreakdown,
        efficiency: totalTickets > 0 ? Math.round((totalMessages / totalTickets) * 100) / 100 : 0 // messages per ticket ratio
      };
    });

    // ============================================
    // 4. RANKINGS
    // ============================================
    const rankings = {
      byTickets: [...agentComparison].sort((a, b) => b.tickets - a.tickets).map((a, i) => ({ ...a, rank: i + 1 })),
      bySpeed: [...agentComparison].filter(a => a.avgResponseTime > 0).sort((a, b) => a.avgResponseTime - b.avgResponseTime).map((a, i) => ({ ...a, rank: i + 1 })),
      byConsistency: [...agentComparison].filter(a => a.tickets > 0).sort((a, b) => b.consistencyScore - a.consistencyScore).map((a, i) => ({ ...a, rank: i + 1 })),
      byEfficiency: [...agentComparison].filter(a => a.tickets > 0).sort((a, b) => b.efficiency - a.efficiency).map((a, i) => ({ ...a, rank: i + 1 }))
    };

    // ============================================
    // 5. DAILY TREND WITH MORE METRICS
    // ============================================
    const dailyTrendData = await KYCAgentActivity.aggregate([
      { $match: { activityDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { date: '$activityDate', type: '$activityType' },
          count: { $sum: 1 },
          avgResponseTime: {
            $avg: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          },
          uniqueAgents: { $addToSet: '$agentId' }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          activities: {
            $push: {
              type: '$_id.type',
              count: '$count',
              avgResponseTime: '$avgResponseTime',
              uniqueAgents: '$uniqueAgents'
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const dailyTrend = dailyTrendData.map(day => {
      const ticketData = day.activities.find(a => a.type === 'ticket_taken') || { count: 0, uniqueAgents: [] };
      const messageData = day.activities.find(a => a.type === 'thread_reply') || { count: 0 };
      return {
        date: day._id.substring(5),
        fullDate: day._id,
        tickets: ticketData.count,
        messages: messageData.count,
        avgResponseTime: Math.round(ticketData.avgResponseTime || 0),
        activeAgents: ticketData.uniqueAgents?.length || 0
      };
    });

    // ============================================
    // 6. SHIFT ANALYSIS
    // ============================================
    const shiftAnalysis = await KYCAgentActivity.aggregate([
      { $match: { activityDate: { $gte: start, $lte: end }, activityType: 'ticket_taken' } },
      {
        $group: {
          _id: '$shift',
          count: { $sum: 1 },
          avgResponseTime: {
            $avg: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          },
          minResponseTime: {
            $min: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          },
          uniqueAgents: { $addToSet: '$agentId' },
          uniqueDays: { $addToSet: '$activityDate' }
        }
      }
    ]);

    const shiftNames = {
      morning: 'Morning (7-15)',
      afternoon: 'Afternoon (15-23)',
      night: 'Night (23-7)'
    };

    const totalShiftTickets = shiftAnalysis.reduce((sum, s) => sum + s.count, 0);
    const shiftDistribution = shiftAnalysis.map(s => ({
      shift: s._id,
      name: shiftNames[s._id] || s._id,
      value: s.count,
      percentage: totalShiftTickets > 0 ? Math.round((s.count / totalShiftTickets) * 100) : 0,
      avgResponseTime: Math.round(s.avgResponseTime || 0),
      minResponseTime: s.minResponseTime || 0,
      activeAgents: s.uniqueAgents?.length || 0,
      activeDays: s.uniqueDays?.length || 0,
      avgTicketsPerDay: s.uniqueDays?.length > 0 ? Math.round((s.count / s.uniqueDays.length) * 10) / 10 : 0
    }));

    // ============================================
    // 7. RESPONSE TIME DISTRIBUTION (MORE GRANULAR)
    // ============================================
    const responseTimeData = await KYCAgentActivity.aggregate([
      {
        $match: {
          activityDate: { $gte: start, $lte: end },
          activityType: 'ticket_taken',
          responseTimeSeconds: { $gt: 0 }
        }
      },
      {
        $bucket: {
          groupBy: '$responseTimeSeconds',
          boundaries: [0, 30, 60, 120, 180, 300, 600, 900, 1800, Infinity],
          default: 'other',
          output: { count: { $sum: 1 } }
        }
      }
    ]);

    const responseRanges = {
      0: '< 30s',
      30: '30s-1m',
      60: '1-2m',
      120: '2-3m',
      180: '3-5m',
      300: '5-10m',
      600: '10-15m',
      900: '15-30m',
      1800: '30m+',
      'other': 'Other'
    };

    const responseTimeDistribution = responseTimeData.map(r => ({
      range: responseRanges[r._id] || r._id,
      count: r.count,
      percentage: ticketStats.count > 0 ? Math.round((r.count / ticketStats.count) * 100) : 0
    }));

    // ============================================
    // 8. HOURLY ACTIVITY PATTERN
    // ============================================
    const hourlyData = await KYCAgentActivity.aggregate([
      { $match: { activityDate: { $gte: start, $lte: end } } },
      {
        $project: {
          hour: { $hour: { date: '$createdAt', timezone: 'Europe/Belgrade' } },
          activityType: 1
        }
      },
      {
        $group: {
          _id: { hour: '$hour', type: '$activityType' },
          count: { $sum: 1 }
        }
      }
    ]);

    const hourlyActivity = Array.from({ length: 24 }, (_, i) => {
      const hourTickets = hourlyData.find(h => h._id.hour === i && h._id.type === 'ticket_taken')?.count || 0;
      const hourMessages = hourlyData.find(h => h._id.hour === i && h._id.type === 'thread_reply')?.count || 0;
      return {
        hour: `${i.toString().padStart(2, '0')}:00`,
        hourNum: i,
        tickets: hourTickets,
        messages: hourMessages,
        total: hourTickets + hourMessages
      };
    });

    // Find peak hours
    const sortedByTotal = [...hourlyActivity].sort((a, b) => b.total - a.total);
    const peakHours = sortedByTotal.slice(0, 3).map(h => h.hour);
    const quietHours = sortedByTotal.filter(h => h.total > 0).slice(-3).map(h => h.hour);

    // ============================================
    // 9. WEEKDAY ANALYSIS
    // ============================================
    const weekdayData = await KYCAgentActivity.aggregate([
      { $match: { activityDate: { $gte: start, $lte: end }, activityType: 'ticket_taken' } },
      {
        $project: {
          dayOfWeek: { $dayOfWeek: { date: '$createdAt', timezone: 'Europe/Belgrade' } },
          responseTimeSeconds: 1
        }
      },
      {
        $group: {
          _id: '$dayOfWeek',
          count: { $sum: 1 },
          avgResponseTime: {
            $avg: { $cond: [{ $gt: ['$responseTimeSeconds', 0] }, '$responseTimeSeconds', null] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const dayNames = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayDistribution = weekdayData.map(d => ({
      day: dayNames[d._id],
      dayNum: d._id,
      tickets: d.count,
      avgResponseTime: Math.round(d.avgResponseTime || 0)
    }));

    // ============================================
    // 10. PERFORMANCE METRICS & INSIGHTS
    // ============================================
    const performanceMetrics = {
      // Best/Worst performers
      fastestAgent: rankings.bySpeed[0]?.name || null,
      fastestTime: rankings.bySpeed[0]?.minResponseTime || 0,
      slowestAgent: rankings.bySpeed[rankings.bySpeed.length - 1]?.name || null,
      slowestAvgTime: rankings.bySpeed[rankings.bySpeed.length - 1]?.avgResponseTime || 0,
      mostActiveAgent: rankings.byTickets[0]?.name || null,
      mostActiveCount: rankings.byTickets[0]?.tickets || 0,
      mostConsistentAgent: rankings.byConsistency[0]?.name || null,
      consistencyScore: rankings.byConsistency[0]?.consistencyScore || 0,

      // Overall metrics
      totalResponsesUnder1Min: responseTimeDistribution.filter(r => r.range === '< 30s' || r.range === '30s-1m').reduce((s, r) => s + r.count, 0),
      totalResponsesOver10Min: responseTimeDistribution.filter(r => r.range.includes('10') || r.range.includes('15') || r.range.includes('30')).reduce((s, r) => s + r.count, 0),
      peakHours,
      quietHours,
      busiestDay: weekdayDistribution.sort((a, b) => b.tickets - a.tickets)[0]?.day || null,
      busiestDayCount: weekdayDistribution.sort((a, b) => b.tickets - a.tickets)[0]?.tickets || 0,
      busiestShift: shiftDistribution.sort((a, b) => b.value - a.value)[0]?.name || null
    };

    // ============================================
    // 11. SUMMARY WITH COMPARISONS
    // ============================================
    const summary = {
      // Current period
      totalTickets: ticketStats.count || 0,
      totalMessages: messageStats.count || 0,
      totalActivities: (ticketStats.count || 0) + (messageStats.count || 0),
      avgTicketsPerDay: daysDiff > 0 ? Math.round(((ticketStats.count || 0) / daysDiff) * 10) / 10 : 0,
      avgMessagesPerDay: daysDiff > 0 ? Math.round(((messageStats.count || 0) / daysDiff) * 10) / 10 : 0,

      // Response time metrics
      avgResponseTime: Math.round(ticketStats.avgResponseTime || 0),
      medianResponseTime: Math.round(medianResponseTime),
      minResponseTime: ticketStats.minResponseTime || 0,
      maxResponseTime: ticketStats.maxResponseTime || 0,

      // Comparisons with previous period
      ticketChange,
      ticketChangeDirection: ticketChange > 0 ? 'up' : ticketChange < 0 ? 'down' : 'same',
      messageChange,
      messageChangeDirection: messageChange > 0 ? 'up' : messageChange < 0 ? 'down' : 'same',
      responseTimeChange,
      responseTimeChangeDirection: responseTimeChange < 0 ? 'improved' : responseTimeChange > 0 ? 'slower' : 'same',

      // Previous period values
      prevTickets: prevTicketStats.count || 0,
      prevMessages: prevMessageStats.count || 0,
      prevAvgResponseTime: Math.round(prevTicketStats.avgResponseTime || 0),

      // Agent stats
      activeAgents: agentComparison.length,
      avgTicketsPerAgent: agentComparison.length > 0 ? Math.round((ticketStats.count || 0) / agentComparison.length) : 0
    };

    // ============================================
    // 12. AGENT EFFICIENCY MATRIX
    // ============================================
    const agentEfficiencyMatrix = agentComparison.map(agent => ({
      name: agent.name,
      volume: agent.tickets, // X axis
      speed: agent.avgResponseTime > 0 ? Math.round(600 / agent.avgResponseTime * 100) : 0, // Y axis (inverted - higher is better)
      consistency: agent.consistencyScore,
      quadrant: agent.tickets >= (summary.avgTicketsPerAgent || 0)
        ? (agent.avgResponseTime <= (summary.avgResponseTime || 300) ? 'Star' : 'Workhorse')
        : (agent.avgResponseTime <= (summary.avgResponseTime || 300) ? 'Potential' : 'Needs Attention')
    }));

    res.json({
      success: true,
      dateRange: { start, end, days: daysDiff },
      previousPeriod: { start: prevStartStr, end: prevEndStr },
      summary,
      dailyTrend,
      shiftDistribution,
      responseTimeDistribution,
      agentComparison,
      rankings,
      hourlyActivity,
      weekdayDistribution,
      performanceMetrics,
      agentEfficiencyMatrix
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ message: 'Failed to fetch statistics', error: error.message });
  }
};

/**
 * Get configuration status
 * GET /api/kyc-stats/config-status
 */
exports.getConfigStatus = async (req, res) => {
  try {
    const status = {
      hasToken: !!process.env.KYC_STATS_SLACK_BOT_TOKEN,
      hasSigningSecret: !!process.env.KYC_STATS_SLACK_SIGNING_SECRET,
      hasChannelId: !!process.env.KYC_STATS_CHANNEL_ID,
      channelId: process.env.KYC_STATS_CHANNEL_ID || 'Not configured'
    };

    // Test Slack connection if token exists
    if (status.hasToken) {
      const client = getSlackClient();
      try {
        const authTest = await client.auth.test();
        status.slackConnected = authTest.ok;
        status.botName = authTest.user;
        status.teamName = authTest.team;
      } catch (e) {
        status.slackConnected = false;
        status.slackError = e.message;
      }
    }

    res.json({ success: true, status });
  } catch (error) {
    console.error('Error checking config status:', error);
    res.status(500).json({ message: 'Failed to check config', error: error.message });
  }
};
