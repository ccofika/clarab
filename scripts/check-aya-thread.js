const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');

  // Find ALL tickets related to this thread or message
  const parentTs = '1707728363.034309';
  const msgTs = '1772797489.142079';

  const tickets = await KYCTicket.find({
    slackChannelId: 'C058YDDMWAD',
    $or: [
      { slackMessageTs: msgTs },
      { threadTs: parentTs },
      { slackMessageTs: parentTs }
    ]
  }).lean();

  console.log('Tickets for Aya thread:', tickets.length);
  tickets.forEach(t => {
    console.log('---');
    console.log('  _id:', t._id);
    console.log('  status:', t.status, '| caseType:', t.caseType);
    console.log('  slackMessageTs:', t.slackMessageTs);
    console.log('  threadTs:', t.threadTs);
    console.log('  claimedBy:', t.claimedBySlackId, '| resolvedBy:', t.resolvedBySlackId);
    console.log('  resolvedAt:', t.resolvedAt);
    console.log('  text:', (t.messageText || '').substring(0, 80));
  });

  // Also check: is IvanaMi (U06AA5552J3) a known agent?
  const KYCAgent = require('../models/KYCAgent');
  const ivana = await KYCAgent.findOne({ slackUserId: 'U06AA5552J3' }).lean();
  console.log('\nIvanaMi agent:', ivana ? ivana.name : 'NOT FOUND');

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
