const mongoose = require('mongoose');

const KBPageAnalyticsSchema = new mongoose.Schema({
  page: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KBPage',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  views: {
    type: Number,
    default: 0
  },
  uniqueViewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  avgTimeOnPage: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

KBPageAnalyticsSchema.index({ page: 1, date: 1 }, { unique: true });
KBPageAnalyticsSchema.index({ date: -1 });

// Static: track a page view
KBPageAnalyticsSchema.statics.trackView = async function(pageId, userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await this.findOneAndUpdate(
    { page: pageId, date: today },
    {
      $inc: { views: 1 },
      $addToSet: { uniqueViewers: userId }
    },
    { upsert: true, new: true }
  );

  return result;
};

// Static: get analytics for a page
KBPageAnalyticsSchema.statics.getPageAnalytics = async function(pageId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  return this.find({
    page: pageId,
    date: { $gte: startDate }
  }).sort({ date: 1 }).lean();
};

// Static: get top pages by views
KBPageAnalyticsSchema.statics.getTopPages = async function(days = 30, limit = 10) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    { $match: { date: { $gte: startDate } } },
    {
      $group: {
        _id: '$page',
        totalViews: { $sum: '$views' },
        uniqueViewerCount: { $addToSet: '$uniqueViewers' }
      }
    },
    { $sort: { totalViews: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'kbpages',
        localField: '_id',
        foreignField: '_id',
        as: 'page'
      }
    },
    { $unwind: '$page' },
    {
      $project: {
        page: { title: 1, slug: 1, icon: 1 },
        totalViews: 1
      }
    }
  ]);
};

// Static: get overall stats
KBPageAnalyticsSchema.statics.getOverallStats = async function(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    { $match: { date: { $gte: startDate } } },
    {
      $group: {
        _id: null,
        totalViews: { $sum: '$views' },
        totalDays: { $addToSet: '$date' },
        pagesViewed: { $addToSet: '$page' }
      }
    }
  ]);

  return stats[0] || { totalViews: 0, totalDays: [], pagesViewed: [] };
};

module.exports = mongoose.model('KBPageAnalytics', KBPageAnalyticsSchema);
