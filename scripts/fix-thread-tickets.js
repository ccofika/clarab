/**
 * Fix tickets created from thread reply messages:
 * 1. Find their parent thread_ts and update threadTs field
 * 2. Check Slack for agent replies after the ticket message
 * 3. Resolve tickets that have been replied to
 */
const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
require('dotenv').config();
const client = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);

const delay = (ms) => new Promise(r => setTimeout(r, ms));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');
  const KYCAgent = require('../models/KYCAgent');

  // Build agent lookup
  const agents = await KYCAgent.find({}).select('slackUserId name').lean();
  const agentSlackIds = new Set(agents.filter(a => a.slackUserId).map(a => a.slackUserId));

  // Get all unresolved tickets
  const tickets = await KYCTicket.find({
    status: { $in: ['open', 'claimed', 'in_progress'] }
  }).lean();

  console.log('Checking', tickets.length, 'unresolved tickets...\n');

  let resolved = 0;
  let threadFixed = 0;
  let errors = 0;

  for (const t of tickets) {
    try {
      // Step 1: Get the message info to find parent thread
      let parentThreadTs = null;
      try {
        const msgResult = await client.conversations.replies({
          channel: t.slackChannelId,
          ts: t.slackMessageTs,
          limit: 1
        });
        if (msgResult.messages && msgResult.messages[0]) {
          const msg = msgResult.messages[0];
          if (msg.thread_ts && msg.thread_ts !== msg.ts) {
            parentThreadTs = msg.thread_ts;
          }
        }
      } catch (e) {
        // Message might be in a thread — try fetching as reply
      }

      // Step 2: If this message is in a thread, check for agent replies AFTER this message
      const threadToCheck = parentThreadTs || t.slackMessageTs;

      const result = await client.conversations.replies({
        channel: t.slackChannelId,
        ts: threadToCheck,
        oldest: t.slackMessageTs
      });

      // Find agent replies that came after this ticket's message
      const agentReplies = result.messages.filter(m =>
        agentSlackIds.has(m.user) &&
        parseFloat(m.ts) > parseFloat(t.slackMessageTs)
      );

      // Update threadTs if needed
      if (parentThreadTs && t.threadTs !== parentThreadTs) {
        await KYCTicket.updateOne({ _id: t._id }, { $set: { threadTs: parentThreadTs } });
        threadFixed++;
      }

      // Resolve if agent replied
      if (agentReplies.length > 0) {
        const firstAgentReply = agentReplies[0];
        const replyDate = new Date(parseFloat(firstAgentReply.ts) * 1000);
        const waitStart = t.lastExternalMessageAt || t.createdAt;
        const claimTime = t.claimedAt || replyDate;

        const agentObj = agents.find(a => a.slackUserId === firstAgentReply.user);

        const update = {
          status: 'resolved',
          resolvedAt: replyDate,
          resolvedBySlackId: firstAgentReply.user,
          responseTimeSeconds: Math.floor((replyDate - claimTime) / 1000),
          totalHandlingTimeSeconds: Math.floor((replyDate - waitStart) / 1000)
        };
        if (agentObj) {
          update.resolvedByAgentId = agentObj._id;
        }

        await KYCTicket.updateOne({ _id: t._id }, { $set: update });
        resolved++;
        console.log(`RESOLVED: ${t.activityDate} | ${agentObj?.name || firstAgentReply.user} replied | ticket ${t._id}`);
      }
    } catch (e) {
      errors++;
    }

    await delay(300); // Slack rate limit
  }

  console.log('\n=== RESULTS ===');
  console.log('ThreadTs fixed:', threadFixed);
  console.log('Resolved:', resolved);
  console.log('Errors:', errors);

  // Final counts
  const counts = await KYCTicket.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  console.log('\nFinal status counts:');
  counts.forEach(c => console.log(`  ${c._id}: ${c.count}`));

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
