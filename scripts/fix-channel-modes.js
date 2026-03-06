const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCChannel = require('../models/KYCChannel');
  const KYCTicket = require('../models/KYCTicket');
  const KYCAgent = require('../models/KYCAgent');

  // Step 1: Fix trackingMode for kyc-payments and kyc-poker
  const r1 = await KYCChannel.updateOne({ slackChannelId: 'C07JQN3QSRZ' }, { $set: { trackingMode: 'hybrid' } });
  const r2 = await KYCChannel.updateOne({ slackChannelId: 'C07U69U0FFS' }, { $set: { trackingMode: 'hybrid' } });
  console.log('kyc-payments trackingMode updated:', r1.modifiedCount);
  console.log('kyc-poker trackingMode updated:', r2.modifiedCount);

  // Verify
  const hybridChannels = await KYCChannel.find({ trackingMode: 'hybrid' }).lean();
  const hybridIds = hybridChannels.map(c => c.slackChannelId);
  console.log('\nHybrid channels:', hybridChannels.map(c => c.name + ' | ' + c.slackChannelId).join(', '));

  // Step 2: Get all agents
  const agents = await KYCAgent.find({}).lean();
  const agentSlackIds = new Set(agents.filter(a => a.slackUserId).map(a => a.slackUserId));
  const agentBySlackId = {};
  agents.forEach(a => { if (a.slackUserId) agentBySlackId[a.slackUserId] = a; });

  // Step 3: Find unresolved tickets in hybrid channels authored by agents
  const tickets = await KYCTicket.find({
    slackChannelId: { $in: hybridIds },
    status: { $in: ['open', 'claimed', 'in_progress'] }
  }).lean();

  console.log('\nUnresolved tickets in hybrid channels:', tickets.length);

  let resolved = 0;
  for (const t of tickets) {
    const authorSlackId = t.messageAuthorSlackId;
    if (authorSlackId && agentSlackIds.has(authorSlackId)) {
      const agent = agentBySlackId[authorSlackId];
      const msgDate = t.createdAt;
      await KYCTicket.updateOne({ _id: t._id }, { $set: {
        status: 'resolved',
        caseType: 'agent_initiated',
        claimedAt: msgDate,
        resolvedAt: msgDate,
        claimedByAgentId: agent._id,
        claimedBySlackId: authorSlackId,
        resolvedByAgentId: agent._id,
        resolvedBySlackId: authorSlackId,
        timeToClaimSeconds: 0,
        responseTimeSeconds: 0,
        totalHandlingTimeSeconds: 0
      }});
      resolved++;
      console.log('RESOLVED:', t.activityDate, '|', agent.name, '(agent_initiated) |', t._id);
    }
  }

  console.log('\n=== RESULTS ===');
  console.log('Agent-authored tickets auto-resolved:', resolved);

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
