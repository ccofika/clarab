const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
require('dotenv').config();
const client = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');
  const tickets = await KYCTicket.find({
    slackChannelId: 'C07JQN3QSRZ',
    status: 'open'
  }).select('slackMessageTs threadTs messageAuthorSlackId caseType').lean();

  for (const t of tickets) {
    try {
      const r = await client.conversations.replies({ channel: 'C07JQN3QSRZ', ts: t.slackMessageTs, limit: 1 });
      const m = r.messages[0];
      const isThreadReply = m.thread_ts && m.thread_ts !== m.ts;
      console.log('ts:', t.slackMessageTs, '| author:', t.messageAuthorSlackId || 'N/A', '| isThreadReply:', isThreadReply, '| parent:', m.thread_ts || 'N/A');
    } catch(e) {
      console.log('ts:', t.slackMessageTs, '| error:', e.message);
    }
    await new Promise(r => setTimeout(r, 200));
  }
  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
