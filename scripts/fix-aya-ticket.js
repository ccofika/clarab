const { WebClient } = require('@slack/web-api');
const mongoose = require('mongoose');
require('dotenv').config();
const client = new WebClient(process.env.KYC_STATS_SLACK_BOT_TOKEN);

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');
  const KYCAgent = require('../models/KYCAgent');

  // fraud-abuse-kyc = C058YDDMWAD
  // Find Aya's ticket around 12:44 PM today
  const tickets = await KYCTicket.find({
    slackChannelId: 'C058YDDMWAD',
    status: { $in: ['open', 'claimed', 'in_progress'] }
  }).lean();

  console.log('Unresolved fraud-abuse tickets:', tickets.length);

  // Find the Aya ticket
  const ayaTicket = tickets.find(t => (t.messageText || '').includes('shiroo0301') || (t.messageText || '').includes('Please check again'));

  if (!ayaTicket) {
    // Search broader
    for (const t of tickets) {
      console.log('  ', t._id, '| status:', t.status, '| ts:', t.slackMessageTs, '| threadTs:', t.threadTs, '| text:', (t.messageText || '').substring(0, 60));
    }
    console.log('\nSearching by text pattern...');
    const allAya = await KYCTicket.find({
      slackChannelId: 'C058YDDMWAD',
      messageText: { $regex: /shiroo|check again/i }
    }).lean();
    console.log('Found by text:', allAya.length);
    allAya.forEach(t => console.log('  ', t._id, '| status:', t.status, '| ts:', t.slackMessageTs, '| threadTs:', t.threadTs));
  }

  // Also check ts from the Slack URL: p1772797489142079 -> 1772797489.142079
  const slackTs = '1772797489.142079';
  const byTs = await KYCTicket.findOne({ slackMessageTs: slackTs });
  console.log('\nTicket by exact ts:', byTs ? byTs._id + ' | status: ' + byTs.status + ' | threadTs: ' + byTs.threadTs : 'NOT FOUND');

  // Check what Slack says about this message
  try {
    const r = await client.conversations.replies({ channel: 'C058YDDMWAD', ts: slackTs, limit: 1 });
    if (r.messages && r.messages[0]) {
      const msg = r.messages[0];
      console.log('Slack msg:', msg.ts, '| user:', msg.user, '| thread_ts:', msg.thread_ts, '| text:', (msg.text || '').substring(0, 60));
    }
  } catch (e) {
    console.log('Slack error for message ts:', e.message);
  }

  // Check parent thread
  const parentTs = '1707728363.034309';
  try {
    const r = await client.conversations.replies({ channel: 'C058YDDMWAD', ts: parentTs });
    console.log('\nParent thread replies:', r.messages.length);
    const agents = await KYCAgent.find({}).lean();
    const agentSlackIds = new Set(agents.filter(a => a.slackUserId).map(a => a.slackUserId));

    // Show messages around Aya's message
    for (const m of r.messages) {
      const isAgent = agentSlackIds.has(m.user);
      const date = new Date(parseFloat(m.ts) * 1000);
      if (parseFloat(m.ts) >= parseFloat(slackTs) - 100) {
        console.log(`  ${date.toISOString()} | ${m.user} | agent:${isAgent} | ${(m.text || '').substring(0, 80)}`);
      }
    }
  } catch (e) {
    console.log('Parent thread error:', e.message);
  }

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
