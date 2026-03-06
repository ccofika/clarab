/**
 * Scan ALL claimed tickets and check Slack API for thread replies.
 * Find out how many actually have agent replies that we missed.
 */
const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
require('dotenv').config();
const client = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');
  const KYCAgent = require('../models/KYCAgent');

  // Get all agent slack IDs
  const agents = await KYCAgent.find({}).select('slackUserId name').lean();
  const agentSlackIds = new Set(agents.filter(a => a.slackUserId).map(a => a.slackUserId));
  const agentNameMap = {};
  agents.forEach(a => { if (a.slackUserId) agentNameMap[a.slackUserId] = a.name; });

  // Get all claimed/in_progress tickets
  const tickets = await KYCTicket.find({
    status: { $in: ['claimed', 'in_progress'] }
  }).sort({ createdAt: -1 }).lean();

  console.log('Checking', tickets.length, 'claimed/in_progress tickets for missed replies...\n');

  let withAgentReply = 0;
  let withoutReply = 0;
  let errors = 0;

  for (const t of tickets) {
    try {
      const result = await client.conversations.replies({
        channel: t.slackChannelId,
        ts: t.slackMessageTs
      });
      const replies = result.messages.slice(1);
      const agentReplies = replies.filter(m => agentSlackIds.has(m.user));

      if (agentReplies.length > 0) {
        withAgentReply++;
        const lastReply = agentReplies[agentReplies.length - 1];
        const replyDate = new Date(parseFloat(lastReply.ts) * 1000);
        console.log(`MISSED: ${t.activityDate} | ${agentNameMap[lastReply.user] || lastReply.user} replied at ${replyDate.toISOString().slice(11,16)} | ticket ${t._id}`);
      } else {
        withoutReply++;
      }
    } catch(e) {
      errors++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n=== RESULTS ===');
  console.log('With agent reply (MISSED):', withAgentReply);
  console.log('Without reply (truly waiting):', withoutReply);
  console.log('Errors:', errors);

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
