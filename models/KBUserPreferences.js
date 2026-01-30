const mongoose = require('mongoose');

const KBUserPreferencesSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KBPage'
  }],
  recentPages: [{
    page: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KBPage'
    },
    visitedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

// Static: get or create preferences for user
KBUserPreferencesSchema.statics.getOrCreate = async function(userId) {
  let prefs = await this.findOne({ user: userId });
  if (!prefs) {
    prefs = await this.create({ user: userId, favorites: [], recentPages: [] });
  }
  return prefs;
};

// Static: toggle favorite
KBUserPreferencesSchema.statics.toggleFavorite = async function(userId, pageId) {
  const prefs = await this.getOrCreate(userId);
  const index = prefs.favorites.indexOf(pageId);

  if (index > -1) {
    prefs.favorites.splice(index, 1);
  } else {
    prefs.favorites.push(pageId);
  }

  await prefs.save();
  return { isFavorite: index === -1, favorites: prefs.favorites };
};

// Static: track page visit
KBUserPreferencesSchema.statics.trackVisit = async function(userId, pageId) {
  const prefs = await this.getOrCreate(userId);

  // Remove existing entry for this page
  prefs.recentPages = prefs.recentPages.filter(
    r => r.page.toString() !== pageId.toString()
  );

  // Add to front
  prefs.recentPages.unshift({ page: pageId, visitedAt: new Date() });

  // Keep only last 20
  if (prefs.recentPages.length > 20) {
    prefs.recentPages = prefs.recentPages.slice(0, 20);
  }

  await prefs.save();
  return prefs.recentPages;
};

// Static: get favorites with page data
KBUserPreferencesSchema.statics.getFavorites = async function(userId) {
  const prefs = await this.getOrCreate(userId);
  await prefs.populate('favorites', 'title slug icon isDeleted isPublished');
  return prefs.favorites.filter(p => p && !p.isDeleted && p.isPublished);
};

// Static: get recent pages with page data
KBUserPreferencesSchema.statics.getRecentPages = async function(userId, limit = 10) {
  const prefs = await this.getOrCreate(userId);
  await prefs.populate('recentPages.page', 'title slug icon isDeleted isPublished');
  return prefs.recentPages
    .filter(r => r.page && !r.page.isDeleted && r.page.isPublished)
    .slice(0, limit);
};

module.exports = mongoose.model('KBUserPreferences', KBUserPreferencesSchema);
