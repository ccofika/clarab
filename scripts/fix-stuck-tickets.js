/**
 * Fix stuck tickets: in_progress/claimed tickets that have agent replies
 * should be resolved. The agent reply IS the resolution.
 */
const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');

  // Find all unresolved tickets that have agent replies
  const stuckTickets = await KYCTicket.find({
    status: { $in: ['claimed', 'in_progress'] },
    'repliedByAgents.0': { $exists: true } // has at least one agent reply
  }).lean();

  console.log('Stuck tickets with agent replies:', stuckTickets.length);

  let fixed = 0;
  for (const t of stuckTickets) {
    // Get the last agent reply
    const lastReply = t.repliedByAgents[t.repliedByAgents.length - 1];
    const replyDate = lastReply.repliedAt;
    const waitStart = t.lastExternalMessageAt || t.createdAt;
    const claimTime = t.claimedAt || replyDate;

    const update = {
      status: 'resolved',
      resolvedAt: replyDate,
      resolvedByAgentId: lastReply.agentId,
      resolvedBySlackId: lastReply.slackId,
      responseTimeSeconds: Math.floor((replyDate - claimTime) / 1000),
      totalHandlingTimeSeconds: Math.floor((replyDate - waitStart) / 1000)
    };

    await KYCTicket.updateOne({ _id: t._id }, { $set: update });
    fixed++;
  }

  console.log('Fixed:', fixed);

  // Also check tickets that are claimed but have no replies — these are truly waiting
  const trueWaiting = await KYCTicket.countDocuments({
    status: { $in: ['open', 'claimed', 'in_progress'] },
    'repliedByAgents.0': { $exists: false }
  });
  console.log('Truly waiting (no agent reply):', trueWaiting);

  // Final counts
  const openCount = await KYCTicket.countDocuments({ status: 'open' });
  const claimedCount = await KYCTicket.countDocuments({ status: 'claimed' });
  const inProgressCount = await KYCTicket.countDocuments({ status: 'in_progress' });
  const resolvedCount = await KYCTicket.countDocuments({ status: 'resolved' });
  console.log('\nFinal status counts:');
  console.log('  open:', openCount);
  console.log('  claimed:', claimedCount);
  console.log('  in_progress:', inProgressCount);
  console.log('  resolved:', resolvedCount);

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
