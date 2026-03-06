const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
require('dotenv').config();
const client = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCAgent = require('../models/KYCAgent');
  const agents = await KYCAgent.find({}).select('slackUserId name').lean();
  const agentNameMap = {};
  agents.forEach(a => { if (a.slackUserId) agentNameMap[a.slackUserId] = a.name; });

  // Parent thread ts from the URL
  const parentTs = '1707728363.034309';
  const ayaTs = '1772797489.142079'; // Aya's message ts

  const result = await client.conversations.replies({
    channel: 'C058YDDMWAD',
    ts: parentTs,
    oldest: ayaTs // only get replies after Aya's message
  });

  console.log('Replies in parent thread after Aya\'s message:');
  result.messages.forEach(m => {
    const d = new Date(parseFloat(m.ts) * 1000);
    const name = agentNameMap[m.user] || m.user;
    const isAgent = !!agentNameMap[m.user];
    console.log(`  ${d.toISOString().slice(11,16)} | ${name}${isAgent ? ' (AGENT)' : ''} | ${(m.text || '').substring(0, 100)}`);
  });

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
