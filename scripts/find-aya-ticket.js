const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
require('dotenv').config();
const client = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');
  const KYCAgent = require('../models/KYCAgent');

  // Find tickets around 12:44 Belgrade time (11:44 UTC) in fraud-abuse-kyc
  const tickets = await KYCTicket.find({
    slackChannelId: 'C058YDDMWAD',
    createdAt: { $gte: new Date('2026-03-06T11:40:00Z'), $lte: new Date('2026-03-06T11:50:00Z') }
  }).lean();

  console.log('Tickets around 12:44:', tickets.length);
  for (const t of tickets) {
    console.log('---');
    console.log('  _id:', t._id, '| status:', t.status, '| msgTs:', t.slackMessageTs);
    console.log('  created:', t.createdAt, '| claimed:', t.claimedAt);
    console.log('  repliedByAgents:', t.repliedByAgents?.length || 0);

    // Check thread replies from Slack API
    try {
      const result = await client.conversations.replies({ channel: 'C058YDDMWAD', ts: t.slackMessageTs });
      const replies = result.messages.slice(1); // minus parent
      console.log('  Slack thread replies:', replies.length);
      for (const m of replies) {
        const d = new Date(parseFloat(m.ts) * 1000);
        const agent = await KYCAgent.findOne({ slackUserId: m.user }).lean();
        console.log(`    user: ${m.user} (${agent ? agent.name : 'NOT AGENT'}) | time: ${d.toISOString().slice(11,19)} | text: ${(m.text || '').substring(0, 80)}`);
      }
    } catch(e) {
      console.log('  Error:', e.message);
    }
  }
  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
