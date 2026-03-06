const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

  // NEW Long Waiting filter (only 'open' tickets)
  const lwFilter = {
    status: 'open',
    dismissed: { $ne: true },
    $or: [
      { lastExternalMessageAt: { $exists: true, $lte: tenMinAgo } },
      { lastExternalMessageAt: { $exists: false }, createdAt: { $lte: tenMinAgo } }
    ]
  };
  const lwCount = await KYCTicket.countDocuments(lwFilter);
  console.log('=== Long Waiting (open only) ===');
  console.log('Count:', lwCount);
  const lwTickets = await KYCTicket.find(lwFilter).sort({ lastExternalMessageAt: 1 }).limit(10).lean();
  lwTickets.forEach(t => {
    const waitFrom = t.lastExternalMessageAt || t.createdAt;
    const waitH = ((Date.now() - new Date(waitFrom).getTime()) / 3600000).toFixed(1);
    console.log('  ', t.activityDate, '| wait:', waitH + 'h', '| status:', t.status);
  });

  // NEW Long Wait History filter (responseTimeSeconds >= 600)
  const lhFilter = {
    status: 'resolved',
    responseTimeSeconds: { $gte: 600 },
    dismissed: { $ne: true }
  };
  const lhCount = await KYCTicket.countDocuments(lhFilter);
  console.log('\n=== Long Wait History (responseTime >= 10min) ===');
  console.log('Count:', lhCount);
  const lhTickets = await KYCTicket.find(lhFilter).sort({ resolvedAt: -1 }).limit(10).lean();
  lhTickets.forEach(t => {
    const respH = t.responseTimeSeconds ? (t.responseTimeSeconds / 3600).toFixed(2) : 'n/a';
    const totalH = t.totalHandlingTimeSeconds ? (t.totalHandlingTimeSeconds / 3600).toFixed(2) : 'n/a';
    console.log('  ', t.activityDate, '| response:', respH + 'h', '| totalHandling:', totalH + 'h');
  });

  // Also count how many in_progress/claimed (these are NOT long waiting anymore)
  const inProgressCount = await KYCTicket.countDocuments({
    status: { $in: ['claimed', 'in_progress'] },
    dismissed: { $ne: true }
  });
  console.log('\n=== Excluded (agent is working) ===');
  console.log('Claimed/In-Progress tickets:', inProgressCount);

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
