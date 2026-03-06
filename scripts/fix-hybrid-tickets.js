/**
 * Fix hybrid channel tickets where agent messages were incorrectly marked as external_request.
 * Also fix tickets without messageAuthorSlackId by checking Slack API.
 */
const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
require('dotenv').config();
const client = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);

const delay = (ms) => new Promise(r => setTimeout(r, ms));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');
  const KYCAgent = require('../models/KYCAgent');
  const KYCChannel = require('../models/KYCChannel');

  // Get hybrid channels
  const hybridChannels = await KYCChannel.find({ trackingMode: 'hybrid' }).lean();
  const hybridIds = hybridChannels.map(c => c.slackChannelId);
  console.log('Hybrid channels:', hybridChannels.map(c => c.name).join(', '));

  // Get all agents
  const agents = await KYCAgent.find({}).lean();
  const agentSlackIds = new Set(agents.filter(a => a.slackUserId).map(a => a.slackUserId));
  const agentBySlackId = {};
  agents.forEach(a => { if (a.slackUserId) agentBySlackId[a.slackUserId] = a; });

  // Find unresolved tickets in hybrid channels
  const tickets = await KYCTicket.find({
    slackChannelId: { $in: hybridIds },
    status: { $in: ['open', 'claimed', 'in_progress'] }
  }).lean();

  console.log('Unresolved tickets in hybrid channels:', tickets.length);

  let resolved = 0;
  let authorFixed = 0;

  for (const t of tickets) {
    let authorSlackId = t.messageAuthorSlackId;

    // If no author, fetch from Slack
    if (!authorSlackId) {
      try {
        const r = await client.conversations.replies({ channel: t.slackChannelId, ts: t.slackMessageTs, limit: 1 });
        if (r.messages && r.messages[0]) {
          authorSlackId = r.messages[0].user;
          await KYCTicket.updateOne({ _id: t._id }, { $set: { messageAuthorSlackId: authorSlackId } });
          authorFixed++;
        }
      } catch(e) { /* skip */ }
      await delay(300);
    }

    // If author is a KYC agent → auto-resolve as agent_initiated
    if (authorSlackId && agentSlackIds.has(authorSlackId)) {
      const agent = agentBySlackId[authorSlackId];
      const msgDate = t.createdAt;
      await KYCTicket.updateOne({ _id: t._id }, { $set: {
        status: 'resolved',
        caseType: 'agent_initiated',
        claimedAt: msgDate,
        resolvedAt: msgDate,
        claimedByAgentId: agent._id,
        claimedBySlackId: authorSlackId,
        resolvedByAgentId: agent._id,
        resolvedBySlackId: authorSlackId,
        timeToClaimSeconds: 0,
        responseTimeSeconds: 0,
        totalHandlingTimeSeconds: 0
      }});
      resolved++;
      console.log(`RESOLVED: ${t.activityDate} | ${agent.name} (agent_initiated) | ${t._id}`);
    }
  }

  console.log('\n=== RESULTS ===');
  console.log('Author backfilled:', authorFixed);
  console.log('Auto-resolved (agent messages):', resolved);

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
