const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');
  const KYCAgent = require('../models/KYCAgent');

  // kyc-payments = C07JQN3QSRZ
  const tickets = await KYCTicket.find({
    slackChannelId: 'C07JQN3QSRZ',
    status: { $in: ['open', 'claimed', 'in_progress'] }
  }).select('slackMessageTs status messageAuthorSlackId caseType messageText').lean();

  console.log('Unresolved in kyc-payments:', tickets.length);
  for (const t of tickets) {
    const agent = await KYCAgent.findOne({ slackUserId: t.messageAuthorSlackId }).lean();
    const agentByAll = t.messageAuthorSlackId
      ? await KYCAgent.findOne({ $or: [{ slackUserId: t.messageAuthorSlackId }] }).lean()
      : null;
    console.log('---');
    console.log('  status:', t.status, '| caseType:', t.caseType);
    console.log('  authorSlackId:', t.messageAuthorSlackId || 'NOT SET');
    console.log('  agent match:', agent ? agent.name : 'NOT FOUND');
    console.log('  text:', (t.messageText || '').substring(0, 60));
  }
  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
