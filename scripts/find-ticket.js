const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');

  // fraud-abuse-kyc = C058YDDMWAD, claimed, around 12:44 today
  const tickets = await KYCTicket.find({
    slackChannelId: 'C058YDDMWAD',
    status: { $in: ['open', 'claimed', 'in_progress'] }
  }).lean();

  console.log('Unresolved in fraud-abuse-kyc:', tickets.length);
  tickets.forEach(t => {
    console.log('---');
    console.log('  _id:', t._id);
    console.log('  status:', t.status);
    console.log('  createdAt:', t.createdAt);
    console.log('  claimedAt:', t.claimedAt);
    console.log('  messageText:', (t.messageText || '').substring(0, 80));
    console.log('  repliedByAgents:', t.repliedByAgents?.length || 0);
    if (t.repliedByAgents?.length) {
      t.repliedByAgents.forEach(r => console.log('    reply:', r.repliedAt, r.slackId));
    }
  });

  // Also check ALL unresolved tickets - how many have NO repliedByAgents
  const allUnresolved = await KYCTicket.find({
    status: { $in: ['open', 'claimed', 'in_progress'] }
  }).lean();

  const noReplies = allUnresolved.filter(t => !t.repliedByAgents?.length);
  const withReplies = allUnresolved.filter(t => t.repliedByAgents?.length > 0);
  console.log('\n=== All unresolved ===');
  console.log('Total:', allUnresolved.length);
  console.log('No replies recorded:', noReplies.length);
  console.log('Has replies (should have been fixed):', withReplies.length);

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
