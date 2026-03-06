/**
 * Fix long waiting tickets in kyc-payments and kyc-poker (hybrid channels).
 * Check Slack for agent replies in threads, resolve if found.
 */
const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
require('dotenv').config();
const client = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);

const delay = (ms) => new Promise(r => setTimeout(r, ms));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');
  const KYCAgent = require('../models/KYCAgent');

  const agents = await KYCAgent.find({}).lean();
  const agentSlackIds = new Set(agents.filter(a => a.slackUserId).map(a => a.slackUserId));
  const agentBySlackId = {};
  agents.forEach(a => { if (a.slackUserId) agentBySlackId[a.slackUserId] = a; });

  const hybridChannelIds = ['C07JQN3QSRZ', 'C07U69U0FFS'];

  const tickets = await KYCTicket.find({
    slackChannelId: { $in: hybridChannelIds },
    status: { $in: ['open', 'claimed', 'in_progress'] }
  }).lean();

  console.log('Unresolved tickets in hybrid channels:', tickets.length);

  let resolved = 0;
  let agentAuthored = 0;
  let authorFixed = 0;
  let errors = 0;

  for (const t of tickets) {
    const ch = t.slackChannelId === 'C07JQN3QSRZ' ? 'payments' : 'poker';
    let authorSlackId = t.messageAuthorSlackId;

    // Step 1: If no author, fetch from Slack
    if (!authorSlackId) {
      try {
        const r = await client.conversations.replies({ channel: t.slackChannelId, ts: t.slackMessageTs, limit: 1 });
        if (r.messages && r.messages[0]) {
          authorSlackId = r.messages[0].user;
          await KYCTicket.updateOne({ _id: t._id }, { $set: { messageAuthorSlackId: authorSlackId } });
          authorFixed++;
        }
      } catch (e) { /* skip */ }
      await delay(300);
    }

    // Step 2: If author is agent → instant resolve
    if (authorSlackId && agentSlackIds.has(authorSlackId)) {
      const agent = agentBySlackId[authorSlackId];
      await KYCTicket.updateOne({ _id: t._id }, { $set: {
        status: 'resolved',
        caseType: 'agent_initiated',
        claimedAt: t.createdAt,
        resolvedAt: t.createdAt,
        claimedByAgentId: agent._id,
        claimedBySlackId: authorSlackId,
        resolvedByAgentId: agent._id,
        resolvedBySlackId: authorSlackId,
        timeToClaimSeconds: 0,
        responseTimeSeconds: 0,
        totalHandlingTimeSeconds: 0
      }});
      agentAuthored++;
      console.log(`AGENT_INITIATED: ${ch} | ${agent.name} | ${t._id}`);
      continue;
    }

    // Step 3: Check Slack thread for agent replies
    try {
      const threadToCheck = t.threadTs || t.slackMessageTs;
      const result = await client.conversations.replies({
        channel: t.slackChannelId,
        ts: threadToCheck,
        oldest: t.slackMessageTs
      });

      const agentReplies = result.messages.filter(m =>
        agentSlackIds.has(m.user) &&
        parseFloat(m.ts) > parseFloat(t.slackMessageTs)
      );

      if (agentReplies.length > 0) {
        const firstReply = agentReplies[0];
        const replyDate = new Date(parseFloat(firstReply.ts) * 1000);
        const waitStart = t.lastExternalMessageAt || t.createdAt;
        const claimTime = t.claimedAt || replyDate;
        const agentObj = agents.find(a => a.slackUserId === firstReply.user);

        const update = {
          status: 'resolved',
          resolvedAt: replyDate,
          resolvedBySlackId: firstReply.user,
          responseTimeSeconds: Math.floor((replyDate - claimTime) / 1000),
          totalHandlingTimeSeconds: Math.floor((replyDate - waitStart) / 1000)
        };
        if (agentObj) {
          update.resolvedByAgentId = agentObj._id;
        }
        if (!t.claimedByAgentId) {
          update.claimedByAgentId = agentObj ? agentObj._id : undefined;
          update.claimedBySlackId = firstReply.user;
          update.claimedAt = replyDate;
          update.timeToClaimSeconds = Math.floor((replyDate - waitStart) / 1000);
        }

        await KYCTicket.updateOne({ _id: t._id }, { $set: update });
        resolved++;
        console.log(`RESOLVED: ${ch} | ${agentObj?.name || firstReply.user} replied | ${t._id}`);
      } else {
        const waitFrom = t.lastExternalMessageAt || t.createdAt;
        const waitH = ((Date.now() - new Date(waitFrom).getTime()) / 3600000).toFixed(1);
        console.log(`STILL OPEN: ${ch} | wait: ${waitH}h | author: ${authorSlackId || 'N/A'} | ${(t.messageText || '').substring(0, 50)}`);
      }
    } catch (e) {
      errors++;
      console.log(`ERROR: ${ch} | ${t._id} | ${e.message}`);
    }

    await delay(300);
  }

  console.log('\n=== RESULTS ===');
  console.log('Author backfilled:', authorFixed);
  console.log('Agent-authored (instant):', agentAuthored);
  console.log('Resolved (agent replied):', resolved);
  console.log('Errors:', errors);

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
