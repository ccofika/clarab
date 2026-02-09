const mongoose = require('mongoose');

const kbSearchBoostSchema = new mongoose.Schema({
  query: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  page: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KBPage',
    required: true
  },
  clickCount: {
    type: Number,
    default: 0
  },
  lastClicked: {
    type: Date
  }
}, { timestamps: true });

// Compound unique index: one record per (query, page) pair
kbSearchBoostSchema.index({ query: 1, page: 1 }, { unique: true });
// For fast lookup sorted by clicks
kbSearchBoostSchema.index({ query: 1, clickCount: -1 });

/**
 * Record a click: upsert the (query, page) pair, increment clickCount
 */
kbSearchBoostSchema.statics.recordClick = async function (query, pageId) {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  return this.findOneAndUpdate(
    { query: normalized, page: pageId },
    {
      $inc: { clickCount: 1 },
      $set: { lastClicked: new Date() }
    },
    { upsert: true, new: true }
  );
};

/**
 * Get boost map for a query: returns { pageId: clickCount }
 */
kbSearchBoostSchema.statics.getBoosts = async function (query) {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const boosts = await this.find({ query: normalized })
    .select('page clickCount')
    .lean();

  const map = {};
  for (const b of boosts) {
    map[b.page.toString()] = b.clickCount;
  }
  return map;
};

module.exports = mongoose.model('KBSearchBoost', kbSearchBoostSchema);
