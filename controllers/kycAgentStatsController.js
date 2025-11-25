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

    console.log('📊 KYC Stats webhook received:', {
      type: payload.type,
      event: payload.event?.type
    });

    // Handle URL verification challenge
    if (payload.type === 'url_verification') {
      console.log('✅ KYC Stats Slack URL verification');
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

      console.log('🎯 KYC Stats event:', {
        type: event.type,
        user: event.user,
        channel: event.channel || event.item?.channel
      });

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

    console.log('⏳ Hourglass reaction detected:', {
      user: event.user,
      reaction: event.reaction,
      item: event.item
    });

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
              console.log(`✅ Linked agent ${agent.name} to Slack ID ${event.user}`);
            }
          }
        } catch (e) {
          console.error('Error fetching Slack user info:', e.message);
        }
      }
    }

    if (!agent) {
      console.log('⚠️ Reaction from unknown agent:', event.user);
      return;
    }

    // Record the ticket taken activity
    await KYCAgentActivity.recordTicketTaken({
      agentId: agent._id,
      agentSlackId: event.user,
      threadTs: event.item.ts,
      reactionTs: event.event_ts,
      channelId: event.item.channel
    });

    console.log(`✅ Recorded ticket taken by ${agent.name}`);
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

    console.log('💬 Thread message detected:', {
      user: event.user,
      thread_ts: event.thread_ts,
      ts: event.ts
    });

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

    console.log(`✅ Recorded thread reply by ${agent.name}`);
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
