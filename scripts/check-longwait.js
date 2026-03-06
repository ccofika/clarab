const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const KYCTicket = require('../models/KYCTicket');

  const tickets = await KYCTicket.find({
    slackChannelId: 'C03CNGD0L9W',
    status: { $in: ['open', 'claimed', 'in_progress'] },
  }).select('createdAt lastExternalMessageAt status activityDate').sort({ createdAt: 1 }).limit(10).lean();

  console.log('Open tickets in mebit-kyc:', tickets.length);
  tickets.forEach(t => {
    const waitFrom = t.lastExternalMessageAt || t.createdAt;
    const waitSec = Math.floor((Date.now() - new Date(waitFrom).getTime()) / 1000);
    const waitHrs = (waitSec / 3600).toFixed(1);
    console.log(t.activityDate, '| status:', t.status, '| created:', new Date(t.createdAt).toISOString().slice(0,16), '| lastExt:', new Date(waitFrom).toISOString().slice(0,16), '| wait:', waitHrs + 'h');
  });

  // Also check long waiting filter
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const lwFilter = {
    status: { $in: ['open', 'claimed', 'in_progress'] },
    dismissed: { $ne: true },
    $or: [
      { lastExternalMessageAt: { $exists: true, $lte: tenMinAgo } },
      { lastExternalMessageAt: { $exists: false }, createdAt: { $lte: tenMinAgo } }
    ]
  };
  const lwCount = await KYCTicket.countDocuments(lwFilter);
  console.log('\nLong waiting (new filter):', lwCount);

  const lwTickets = await KYCTicket.find(lwFilter).sort({ lastExternalMessageAt: 1 }).limit(5).select('activityDate status createdAt lastExternalMessageAt').lean();
  lwTickets.forEach(t => {
    const waitFrom = t.lastExternalMessageAt || t.createdAt;
    const waitHrs = ((Date.now() - new Date(waitFrom).getTime()) / 3600000).toFixed(1);
    console.log('  ', t.activityDate, '| wait:', waitHrs + 'h', '| lastExt:', new Date(waitFrom).toISOString().slice(0,16));
  });

  mongoose.disconnect();
}).catch(err => { console.error(err); process.exit(1); });
