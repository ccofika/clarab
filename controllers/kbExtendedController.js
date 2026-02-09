const KBTemplate = require('../models/KBTemplate');
const KBPageVersion = require('../models/KBPageVersion');
const KBComment = require('../models/KBComment');
const KBPageAnalytics = require('../models/KBPageAnalytics');
const KBUserPreferences = require('../models/KBUserPreferences');
const KBPage = require('../models/KBPage');
const KBEditLog = require('../models/KBEditLog');
const KBSearchBoost = require('../models/KBSearchBoost');
const crypto = require('crypto');
const Fuse = require('fuse.js');
const { extractPageText, extractExcerpts } = require('../utils/kbTextExtractor');

// ===================== TEMPLATES =====================

exports.getTemplates = async (req, res) => {
  try {
    const { category, search } = req.query;
    const query = {};

    if (category) query.category = category;
    if (search) {
      query.$text = { $search: search };
    }

    const templates = await KBTemplate.find(query)
      .populate('createdBy', 'name email')
      .sort({ usageCount: -1, createdAt: -1 })
      .lean();

    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch templates', error: error.message });
  }
};

exports.getTemplateById = async (req, res) => {
  try {
    const template = await KBTemplate.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch template', error: error.message });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const { title, description, icon, category, blocks, dropdowns, tags, isPublic } = req.body;

    const template = await KBTemplate.create({
      title,
      description,
      icon: icon || '📋',
      category: category || 'custom',
      blocks: blocks || [],
      dropdowns: dropdowns || [],
      tags: tags || [],
      isPublic: isPublic || false,
      createdBy: req.user._id
    });

    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create template', error: error.message });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const template = await KBTemplate.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update template', error: error.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const template = await KBTemplate.findByIdAndDelete(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json({ message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete template', error: error.message });
  }
};

exports.useTemplate = async (req, res) => {
  try {
    const template = await KBTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    const { title, parentPage, sectionId } = req.body;

    // Generate unique slug
    let slug = (title || template.title)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    const existing = await KBPage.findOne({ slug });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Calculate order
    const siblings = await KBPage.find({
      parentPage: parentPage || null,
      isDeleted: false
    });

    const page = await KBPage.create({
      title: title || template.title,
      slug,
      icon: template.icon,
      coverImage: template.coverImage,
      blocks: template.blocks,
      dropdowns: template.dropdowns,
      parentPage: parentPage || null,
      sectionId: sectionId || null,
      order: siblings.length,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    // Increment usage count
    await KBTemplate.findByIdAndUpdate(req.params.id, { $inc: { usageCount: 1 } });

    await KBEditLog.logEdit(page._id, req.user._id, 'create', {
      summary: `Created from template: ${template.title}`
    });

    res.status(201).json(page);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create page from template', error: error.message });
  }
};

exports.saveAsTemplate = async (req, res) => {
  try {
    const page = await KBPage.findById(req.params.id);
    if (!page) return res.status(404).json({ message: 'Page not found' });

    const { title, description, category, isPublic } = req.body;

    const template = await KBTemplate.create({
      title: title || `${page.title} Template`,
      description: description || '',
      icon: page.icon,
      coverImage: page.coverImage,
      category: category || 'custom',
      blocks: page.blocks,
      dropdowns: page.dropdowns,
      isPublic: isPublic || false,
      createdBy: req.user._id
    });

    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ message: 'Failed to save as template', error: error.message });
  }
};

// ===================== VERSION HISTORY =====================

exports.getVersions = async (req, res) => {
  try {
    const versions = await KBPageVersion.getVersions(req.params.id, parseInt(req.query.limit) || 50);
    res.json(versions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch versions', error: error.message });
  }
};

exports.getVersion = async (req, res) => {
  try {
    const version = await KBPageVersion.findOne({
      page: req.params.id,
      version: parseInt(req.params.version)
    }).populate('createdBy', 'name email');

    if (!version) return res.status(404).json({ message: 'Version not found' });
    res.json(version);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch version', error: error.message });
  }
};

exports.restoreVersion = async (req, res) => {
  try {
    const version = await KBPageVersion.findOne({
      page: req.params.id,
      version: parseInt(req.params.version)
    });

    if (!version) return res.status(404).json({ message: 'Version not found' });

    const page = await KBPage.findById(req.params.id);
    if (!page) return res.status(404).json({ message: 'Page not found' });

    // Save current state as a new version before restoring
    await KBPageVersion.createVersion(page, req.user._id, 'Auto-saved before restore');

    // Restore
    page.title = version.title;
    page.icon = version.icon;
    page.coverImage = version.coverImage;
    page.blocks = version.blocks;
    page.dropdowns = version.dropdowns;
    page.lastModifiedBy = req.user._id;
    await page.save();

    await KBEditLog.logEdit(page._id, req.user._id, 'restore', {
      summary: `Restored to version ${version.version}`
    });

    res.json(page);
  } catch (error) {
    res.status(500).json({ message: 'Failed to restore version', error: error.message });
  }
};

// ===================== COMMENTS =====================

exports.getComments = async (req, res) => {
  try {
    const comments = await KBComment.getPageComments(req.params.id);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch comments', error: error.message });
  }
};

exports.addComment = async (req, res) => {
  try {
    const { content, blockId, parentComment, mentions } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    const comment = await KBComment.create({
      page: req.params.id,
      blockId: blockId || null,
      parentComment: parentComment || null,
      content: content.trim(),
      mentions: mentions || [],
      author: req.user._id
    });

    await comment.populate('author', 'name email');
    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ message: 'Failed to add comment', error: error.message });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const comment = await KBComment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Can only edit your own comments' });
    }

    comment.content = req.body.content;
    await comment.save();
    await comment.populate('author', 'name email');

    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update comment', error: error.message });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const comment = await KBComment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    comment.isDeleted = true;
    await comment.save();

    res.json({ message: 'Comment deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete comment', error: error.message });
  }
};

exports.resolveComment = async (req, res) => {
  try {
    const comment = await KBComment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    comment.isResolved = !comment.isResolved;
    if (comment.isResolved) {
      comment.resolvedBy = req.user._id;
      comment.resolvedAt = new Date();
    } else {
      comment.resolvedBy = null;
      comment.resolvedAt = null;
    }

    await comment.save();
    await comment.populate('resolvedBy', 'name email');

    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: 'Failed to resolve comment', error: error.message });
  }
};

exports.reactToComment = async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ message: 'Emoji is required' });

    const comment = await KBComment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const existingReaction = comment.reactions.find(r => r.emoji === emoji);

    if (existingReaction) {
      const userIndex = existingReaction.users.indexOf(req.user._id);
      if (userIndex > -1) {
        existingReaction.users.splice(userIndex, 1);
        if (existingReaction.users.length === 0) {
          comment.reactions = comment.reactions.filter(r => r.emoji !== emoji);
        }
      } else {
        existingReaction.users.push(req.user._id);
      }
    } else {
      comment.reactions.push({ emoji, users: [req.user._id] });
    }

    await comment.save();
    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: 'Failed to react', error: error.message });
  }
};

// ===================== FAVORITES & RECENT =====================

exports.getFavorites = async (req, res) => {
  try {
    const favorites = await KBUserPreferences.getFavorites(req.user._id);
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch favorites', error: error.message });
  }
};

exports.toggleFavorite = async (req, res) => {
  try {
    const result = await KBUserPreferences.toggleFavorite(req.user._id, req.params.pageId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to toggle favorite', error: error.message });
  }
};

exports.getRecentPages = async (req, res) => {
  try {
    const recent = await KBUserPreferences.getRecentPages(req.user._id, parseInt(req.query.limit) || 10);
    res.json(recent);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch recent pages', error: error.message });
  }
};

exports.trackPageVisit = async (req, res) => {
  try {
    await KBUserPreferences.trackVisit(req.user._id, req.params.pageId);
    await KBPageAnalytics.trackView(req.params.pageId, req.user._id);
    res.json({ message: 'Visit tracked' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to track visit', error: error.message });
  }
};

// ===================== SEARCH =====================

exports.search = async (req, res) => {
  try {
    const { q, tags, author, dateFrom, dateTo, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const query = {
      isDeleted: false,
      isPublished: true,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { 'blocks.defaultContent': { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ]
    };

    if (tags) {
      query.tags = { $in: tags.split(',').map(t => t.trim().toLowerCase()) };
    }

    if (author) {
      query.createdBy = author;
    }

    if (dateFrom || dateTo) {
      query.updatedAt = {};
      if (dateFrom) query.updatedAt.$gte = new Date(dateFrom);
      if (dateTo) query.updatedAt.$lte = new Date(dateTo);
    }

    const pages = await KBPage.find(query)
      .select('title slug icon tags createdBy updatedAt')
      .populate('createdBy', 'name email')
      .limit(parseInt(limit))
      .sort({ updatedAt: -1 })
      .lean();

    // Highlight matching content
    const results = pages.map(page => ({
      page: {
        _id: page._id,
        title: page.title,
        slug: page.slug,
        icon: page.icon,
        tags: page.tags
      },
      author: page.createdBy,
      updatedAt: page.updatedAt
    }));

    res.json({ results, totalCount: results.length });
  } catch (error) {
    res.status(500).json({ message: 'Search failed', error: error.message });
  }
};

exports.searchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      // Return popular tags and recent pages when no query
      const popularTags = await KBPage.aggregate([
        { $match: { isDeleted: false } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $project: { tag: '$_id', count: 1, _id: 0 } }
      ]);

      const recentPages = await KBPage.find({ isDeleted: false, isPublished: true })
        .select('title slug icon')
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean();

      return res.json({ tags: popularTags, pages: recentPages });
    }

    // Auto-complete suggestions
    const pages = await KBPage.find({
      isDeleted: false,
      isPublished: true,
      title: { $regex: q, $options: 'i' }
    })
      .select('title slug icon')
      .limit(5)
      .sort({ updatedAt: -1 })
      .lean();

    const matchingTags = await KBPage.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: '$tags' },
      { $match: { tags: { $regex: q, $options: 'i' } } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { tag: '$_id', count: 1, _id: 0 } }
    ]);

    res.json({ pages, tags: matchingTags });
  } catch (error) {
    res.status(500).json({ message: 'Suggestions failed', error: error.message });
  }
};

// ===================== FUZZY SEARCH =====================

// In-memory cache for search index
let searchCache = { pages: null, timestamp: 0 };
const CACHE_TTL = 60000; // 60 seconds

async function getSearchablePages() {
  const now = Date.now();
  if (searchCache.pages && (now - searchCache.timestamp) < CACHE_TTL) {
    return searchCache.pages;
  }

  const pages = await KBPage.find({ isDeleted: false, isPublished: true })
    .select('title slug icon tags blocks')
    .lean();

  const searchablePages = pages.map(page => ({
    _id: page._id,
    title: page.title,
    slug: page.slug,
    icon: page.icon,
    tags: page.tags || [],
    fullText: extractPageText(page),
    blocks: page.blocks
  }));

  searchCache = { pages: searchablePages, timestamp: now };
  return searchablePages;
}

exports.clearSearchCache = () => {
  searchCache = { pages: null, timestamp: 0 };
};

exports.fuzzySearch = async (req, res) => {
  try {
    const { q, tags, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const query = q.trim();
    let pages = await getSearchablePages();

    // Pre-filter by tags if provided
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim().toLowerCase());
      pages = pages.filter(p => p.tags.some(t => tagList.includes(t)));
    }

    // Fuse.js fuzzy search
    const fuse = new Fuse(pages, {
      keys: [
        { name: 'title', weight: 3 },
        { name: 'tags', weight: 2 },
        { name: 'fullText', weight: 1 }
      ],
      threshold: 0.4,
      distance: 200,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 2,
      ignoreLocation: true,
      findAllMatches: true
    });

    let fuseResults = fuse.search(query);

    // Count exact match frequency in full text
    const queryLower = query.toLowerCase();
    fuseResults = fuseResults.map(result => {
      const fullTextLower = result.item.fullText.toLowerCase();
      let matchCount = 0;
      let pos = 0;
      while ((pos = fullTextLower.indexOf(queryLower, pos)) !== -1) {
        matchCount++;
        pos += queryLower.length;
      }
      // Also count in title
      const titleLower = result.item.title.toLowerCase();
      let titlePos = 0;
      while ((titlePos = titleLower.indexOf(queryLower, titlePos)) !== -1) {
        matchCount += 3; // Title matches count extra
        titlePos += queryLower.length;
      }
      const fuseMatchCount = result.matches ? result.matches.length : 0;

      return {
        ...result,
        matchCount: Math.max(matchCount, fuseMatchCount)
      };
    });

    // Get search boosts for this query
    let boosts = {};
    try {
      boosts = await KBSearchBoost.getBoosts(queryLower);
    } catch (e) {
      // Non-critical, continue without boosts
    }

    // Combined scoring
    fuseResults.sort((a, b) => {
      const boostA = boosts[a.item._id.toString()] || 0;
      const boostB = boosts[b.item._id.toString()] || 0;

      // Primary: Fuse score (lower = better match)
      const scoreDiff = a.score - b.score;
      if (Math.abs(scoreDiff) > 0.1) return scoreDiff;

      // Secondary: match count (higher = better)
      const matchDiff = b.matchCount - a.matchCount;
      if (matchDiff !== 0) return matchDiff;

      // Tertiary: boost (higher = better)
      return boostB - boostA;
    });

    const limitedResults = fuseResults.slice(0, parseInt(limit));

    const results = limitedResults.map(result => {
      const page = result.item;
      const excerpts = extractExcerpts(page.blocks, query, 2);

      return {
        _id: page._id,
        title: page.title,
        slug: page.slug,
        icon: page.icon,
        tags: page.tags,
        score: result.score,
        matchCount: result.matchCount,
        excerpts
      };
    });

    res.json({ results, totalCount: fuseResults.length, query });
  } catch (error) {
    console.error('Fuzzy search error:', error);
    res.status(500).json({ message: 'Search failed', error: error.message });
  }
};

exports.recordSearchBoost = async (req, res) => {
  try {
    const { query, pageId } = req.body;

    if (!query || !pageId) {
      return res.status(400).json({ message: 'query and pageId are required' });
    }

    await KBSearchBoost.recordClick(query, pageId);
    res.json({ message: 'Boost recorded' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to record boost', error: error.message });
  }
};

// ===================== PERMISSIONS & SHARING =====================

exports.getPermissions = async (req, res) => {
  try {
    const page = await KBPage.findById(req.params.id)
      .select('permissions')
      .populate('permissions.users.user', 'name email');

    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json(page.permissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch permissions', error: error.message });
  }
};

exports.updatePermissions = async (req, res) => {
  try {
    const page = await KBPage.findById(req.params.id);
    if (!page) return res.status(404).json({ message: 'Page not found' });

    const { visibility, inheritFromParent, users } = req.body;

    if (visibility) page.permissions.visibility = visibility;
    if (typeof inheritFromParent === 'boolean') page.permissions.inheritFromParent = inheritFromParent;
    if (users) page.permissions.users = users;

    page.lastModifiedBy = req.user._id;
    await page.save();

    res.json(page.permissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update permissions', error: error.message });
  }
};

exports.generateShareLink = async (req, res) => {
  try {
    const page = await KBPage.findById(req.params.id);
    if (!page) return res.status(404).json({ message: 'Page not found' });

    const { allowComments, allowDuplication, expiresIn } = req.body;

    const token = crypto.randomBytes(32).toString('hex');
    let expiresAt = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000); // days
    }

    page.permissions.shareLink = {
      enabled: true,
      token,
      expiresAt,
      allowComments: allowComments || false,
      allowDuplication: allowDuplication || false
    };

    await page.save();

    res.json({
      token,
      expiresAt,
      url: `${req.protocol}://${req.get('host')}/knowledge-base/shared/${token}`
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate share link', error: error.message });
  }
};

exports.revokeShareLink = async (req, res) => {
  try {
    const page = await KBPage.findById(req.params.id);
    if (!page) return res.status(404).json({ message: 'Page not found' });

    page.permissions.shareLink = {
      enabled: false,
      token: null,
      expiresAt: null,
      allowComments: false,
      allowDuplication: false
    };

    await page.save();
    res.json({ message: 'Share link revoked' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to revoke share link', error: error.message });
  }
};

exports.accessSharedPage = async (req, res) => {
  try {
    const page = await KBPage.findOne({
      'permissions.shareLink.token': req.params.token,
      'permissions.shareLink.enabled': true,
      isDeleted: false
    }).populate('createdBy', 'name email');

    if (!page) {
      return res.status(404).json({ message: 'Shared page not found or link expired' });
    }

    // Check expiration
    if (page.permissions.shareLink.expiresAt && new Date() > page.permissions.shareLink.expiresAt) {
      return res.status(410).json({ message: 'Share link has expired' });
    }

    const breadcrumbs = await page.getBreadcrumbs();

    res.json({
      ...page.toObject(),
      breadcrumbs,
      shareSettings: {
        allowComments: page.permissions.shareLink.allowComments,
        allowDuplication: page.permissions.shareLink.allowDuplication
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to access shared page', error: error.message });
  }
};

// ===================== ANALYTICS =====================

exports.getPageAnalytics = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const analytics = await KBPageAnalytics.getPageAnalytics(req.params.id, days);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch analytics', error: error.message });
  }
};

exports.getTopPages = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 10;
    const topPages = await KBPageAnalytics.getTopPages(days, limit);
    res.json(topPages);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch top pages', error: error.message });
  }
};

exports.getOverallStats = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = await KBPageAnalytics.getOverallStats(days);

    // Also get page counts
    const totalPages = await KBPage.countDocuments({ isDeleted: false });
    const publishedPages = await KBPage.countDocuments({ isDeleted: false, isPublished: true });
    const draftPages = await KBPage.countDocuments({ isDeleted: false, isPublished: false });
    const deletedPages = await KBPage.countDocuments({ isDeleted: true });
    const totalComments = await KBComment.countDocuments({ isDeleted: false });

    res.json({
      ...stats,
      totalPages,
      publishedPages,
      draftPages,
      deletedPages,
      totalComments
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch stats', error: error.message });
  }
};

// ===================== TAGS =====================

exports.getAllTags = async (req, res) => {
  try {
    const tags = await KBPage.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { name: '$_id', count: 1, _id: 0 } }
    ]);

    res.json(tags);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch tags', error: error.message });
  }
};

// ===================== EXPORT =====================

exports.exportPage = async (req, res) => {
  try {
    const page = await KBPage.findById(req.params.id);
    if (!page) return res.status(404).json({ message: 'Page not found' });

    const format = req.params.format || 'json';

    if (format === 'json') {
      res.json({
        title: page.title,
        icon: page.icon,
        coverImage: page.coverImage,
        blocks: page.blocks,
        dropdowns: page.dropdowns,
        tags: page.tags,
        exportedAt: new Date()
      });
    } else if (format === 'markdown') {
      let md = `# ${page.icon || ''} ${page.title}\n\n`;

      for (const block of page.blocks) {
        md += blockToMarkdown(block) + '\n\n';
      }

      res.set('Content-Type', 'text/markdown');
      res.set('Content-Disposition', `attachment; filename="${page.slug}.md"`);
      res.send(md);
    } else if (format === 'html') {
      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${page.title}</title>
        <style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;line-height:1.6}
        code{background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:0.9em}
        pre{background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;overflow-x:auto}
        blockquote{border-left:4px solid #e5e7eb;margin:0;padding:0 16px;color:#6b7280}
        table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:8px 12px;text-align:left}
        th{background:#f9fafb}img{max-width:100%;border-radius:8px}</style></head><body>`;
      html += `<h1>${page.icon || ''} ${page.title}</h1>`;

      for (const block of page.blocks) {
        html += blockToHtml(block);
      }

      html += '</body></html>';

      res.set('Content-Type', 'text/html');
      res.set('Content-Disposition', `attachment; filename="${page.slug}.html"`);
      res.send(html);
    } else {
      res.status(400).json({ message: 'Unsupported format. Use: json, markdown, html' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to export page', error: error.message });
  }
};

exports.importPage = async (req, res) => {
  try {
    const { title, icon, blocks, dropdowns, tags, parentPage, sectionId } = req.body;

    if (!title) return res.status(400).json({ message: 'Title is required' });

    let slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    const existing = await KBPage.findOne({ slug });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const siblings = await KBPage.find({
      parentPage: parentPage || null,
      isDeleted: false
    });

    const page = await KBPage.create({
      title,
      slug,
      icon: icon || '📄',
      blocks: blocks || [],
      dropdowns: dropdowns || [],
      tags: tags || [],
      parentPage: parentPage || null,
      sectionId: sectionId || null,
      order: siblings.length,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    await KBEditLog.logEdit(page._id, req.user._id, 'create', {
      summary: 'Imported page'
    });

    res.status(201).json(page);
  } catch (error) {
    res.status(500).json({ message: 'Failed to import page', error: error.message });
  }
};

// ===================== BULK OPERATIONS =====================

exports.bulkDelete = async (req, res) => {
  try {
    const { pageIds } = req.body;
    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return res.status(400).json({ message: 'pageIds array required' });
    }

    const result = await KBPage.updateMany(
      { _id: { $in: pageIds } },
      { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id }
    );

    for (const pageId of pageIds) {
      await KBEditLog.logEdit(pageId, req.user._id, 'delete', { summary: 'Bulk deleted' });
    }

    res.json({ message: `${result.modifiedCount} pages deleted`, count: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: 'Bulk delete failed', error: error.message });
  }
};

exports.bulkMove = async (req, res) => {
  try {
    const { pageIds, targetParentId, targetSectionId } = req.body;
    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return res.status(400).json({ message: 'pageIds array required' });
    }

    const updates = {};
    if (targetParentId !== undefined) updates.parentPage = targetParentId || null;
    if (targetSectionId !== undefined) updates.sectionId = targetSectionId || null;

    const result = await KBPage.updateMany(
      { _id: { $in: pageIds } },
      updates
    );

    for (const pageId of pageIds) {
      await KBEditLog.logEdit(pageId, req.user._id, 'update', { summary: 'Bulk moved' });
    }

    res.json({ message: `${result.modifiedCount} pages moved`, count: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: 'Bulk move failed', error: error.message });
  }
};

exports.bulkPermissions = async (req, res) => {
  try {
    const { pageIds, visibility } = req.body;
    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return res.status(400).json({ message: 'pageIds array required' });
    }
    if (!['private', 'workspace', 'public'].includes(visibility)) {
      return res.status(400).json({ message: 'Invalid visibility value' });
    }

    const result = await KBPage.updateMany(
      { _id: { $in: pageIds } },
      { $set: { 'permissions.visibility': visibility } }
    );

    res.json({ message: `${result.modifiedCount} pages updated`, count: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: 'Bulk permissions failed', error: error.message });
  }
};

exports.bulkTag = async (req, res) => {
  try {
    const { pageIds, addTags, removeTags } = req.body;
    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return res.status(400).json({ message: 'pageIds array required' });
    }

    let modifiedCount = 0;
    for (const pageId of pageIds) {
      const page = await KBPage.findById(pageId);
      if (!page) continue;

      let tags = [...(page.tags || [])];
      if (addTags && Array.isArray(addTags)) {
        addTags.forEach(t => {
          const tag = t.toLowerCase().trim();
          if (tag && !tags.includes(tag)) tags.push(tag);
        });
      }
      if (removeTags && Array.isArray(removeTags)) {
        tags = tags.filter(t => !removeTags.map(r => r.toLowerCase().trim()).includes(t));
      }

      page.tags = tags;
      await page.save();
      modifiedCount++;
    }

    res.json({ message: `${modifiedCount} pages updated`, count: modifiedCount });
  } catch (error) {
    res.status(500).json({ message: 'Bulk tag failed', error: error.message });
  }
};

// ===================== SETTINGS =====================

exports.getSettings = async (req, res) => {
  try {
    const KBSettings = require('../models/KBSettings');
    const settings = await KBSettings.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch settings', error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const KBSettings = require('../models/KBSettings');
    const settings = await KBSettings.getSettings();

    const { defaultPermissions, allowedBlockTypes, branding, contentSettings } = req.body;

    if (defaultPermissions) {
      if (defaultPermissions.visibility) settings.defaultPermissions.visibility = defaultPermissions.visibility;
    }
    if (allowedBlockTypes !== undefined) {
      settings.allowedBlockTypes = allowedBlockTypes;
    }
    if (branding) {
      if (branding.name !== undefined) settings.branding.name = branding.name;
      if (branding.description !== undefined) settings.branding.description = branding.description;
    }
    if (contentSettings) {
      if (contentSettings.maxPageDepth !== undefined) settings.contentSettings.maxPageDepth = contentSettings.maxPageDepth;
      if (contentSettings.versionRetentionCount !== undefined) settings.contentSettings.versionRetentionCount = contentSettings.versionRetentionCount;
      if (contentSettings.allowPublicSharing !== undefined) settings.contentSettings.allowPublicSharing = contentSettings.allowPublicSharing;
      if (contentSettings.allowComments !== undefined) settings.contentSettings.allowComments = contentSettings.allowComments;
    }

    settings.updatedBy = req.user._id;
    await settings.save();

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update settings', error: error.message });
  }
};

// ===================== BOOKMARK METADATA =====================

exports.fetchMetadata = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ message: 'URL is required' });

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ message: 'Invalid URL' });
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ message: 'Only HTTP/HTTPS URLs are supported' });
    }

    const https = require('https');
    const http = require('http');
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const fetchHtml = (targetUrl) => new Promise((resolve, reject) => {
      const request = client.get(targetUrl, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KBBot/1.0)' } }, (response) => {
        // Follow redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return resolve(fetchHtml(response.headers.location));
        }
        let data = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          data += chunk;
          if (data.length > 50000) response.destroy(); // Limit response size
        });
        response.on('end', () => resolve(data));
        response.on('error', reject);
      });
      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('Timeout')); });
    });

    const html = await fetchHtml(url);

    // Parse Open Graph and meta tags
    const getMetaContent = (name) => {
      const ogMatch = html.match(new RegExp(`<meta[^>]+property=["']og:${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${name}["']`, 'i'));
      if (ogMatch) return ogMatch[1];

      const metaMatch = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'));
      return metaMatch ? metaMatch[1] : null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = getMetaContent('title') || (titleMatch ? titleMatch[1].trim() : '');
    const description = getMetaContent('description') || '';
    const image = getMetaContent('image') || '';

    // Favicon
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i)
      || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i);
    let favicon = faviconMatch ? faviconMatch[1] : '';
    if (favicon && !favicon.startsWith('http')) {
      favicon = new URL(favicon, url).href;
    }
    if (!favicon) {
      favicon = `${parsedUrl.origin}/favicon.ico`;
    }

    res.json({ title, description, image, favicon, url });
  } catch (error) {
    res.json({ title: '', description: '', image: '', favicon: '', url: req.query.url || '' });
  }
};

// ===================== CONTENT STATS =====================

exports.getContentStats = async (req, res) => {
  try {
    // Get block and word counts via aggregation
    const blockStats = await KBPage.aggregate([
      { $match: { isDeleted: false } },
      {
        $project: {
          blockCount: { $size: { $ifNull: ['$blocks', []] } },
          blockTypes: '$blocks.type'
        }
      },
      {
        $group: {
          _id: null,
          totalBlocks: { $sum: '$blockCount' },
          allTypes: { $push: '$blockTypes' }
        }
      }
    ]);

    // Count words across all text blocks
    const textBlocks = await KBPage.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: '$blocks' },
      { $match: { 'blocks.type': { $in: ['paragraph', 'heading_1', 'heading_2', 'heading_3', 'quote', 'callout'] } } },
      {
        $group: {
          _id: null,
          contents: { $push: '$blocks.defaultContent' }
        }
      }
    ]);

    let totalWords = 0;
    if (textBlocks.length > 0) {
      textBlocks[0].contents.forEach(c => {
        const text = typeof c === 'string' ? c : (typeof c === 'object' && c?.text ? c.text : '');
        if (text) totalWords += text.split(/\s+/).filter(Boolean).length;
      });
    }

    // Block type distribution
    const blockTypeDist = await KBPage.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: '$blocks' },
      { $group: { _id: '$blocks.type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Page status counts
    const totalPages = await KBPage.countDocuments({ isDeleted: false });
    const publishedPages = await KBPage.countDocuments({ isDeleted: false, isPublished: true });
    const draftPages = await KBPage.countDocuments({ isDeleted: false, isPublished: false });
    const deletedPages = await KBPage.countDocuments({ isDeleted: true });

    // Pages created over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const pagesOverTime = await KBPage.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      totalPages,
      publishedPages,
      draftPages,
      deletedPages,
      totalBlocks: blockStats.length > 0 ? blockStats[0].totalBlocks : 0,
      totalWords,
      blockTypeDistribution: blockTypeDist.map(b => ({ type: b._id, count: b.count })),
      pagesOverTime: pagesOverTime.map(p => ({ date: p._id, count: p.count }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch content stats', error: error.message });
  }
};

// ===================== ACTIVE EDITORS =====================

exports.getActiveEditors = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const editors = await KBEditLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$user',
          editCount: { $sum: 1 },
          lastEdit: { $max: '$createdAt' },
          actions: { $push: '$action' }
        }
      },
      { $sort: { editCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          editCount: 1,
          lastEdit: 1,
          creates: {
            $size: {
              $filter: { input: '$actions', cond: { $eq: ['$$this', 'create'] } }
            }
          },
          updates: {
            $size: {
              $filter: { input: '$actions', cond: { $eq: ['$$this', 'update'] } }
            }
          },
          deletes: {
            $size: {
              $filter: { input: '$actions', cond: { $eq: ['$$this', 'delete'] } }
            }
          },
          name: { $ifNull: ['$userInfo.name', '$userInfo.email'] },
          email: '$userInfo.email'
        }
      }
    ]);

    res.json(editors);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch active editors', error: error.message });
  }
};

// ===================== HELPERS =====================

function blockToMarkdown(block) {
  const content = block.defaultContent;

  switch (block.type) {
    case 'paragraph':
      return typeof content === 'string' ? content : '';
    case 'heading_1':
      return `# ${typeof content === 'string' ? content : ''}`;
    case 'heading_2':
      return `## ${typeof content === 'string' ? content : ''}`;
    case 'heading_3':
      return `### ${typeof content === 'string' ? content : ''}`;
    case 'bulleted_list':
      return (typeof content === 'string' ? content.split('\n') : []).map(i => `- ${i}`).join('\n');
    case 'numbered_list':
      return (typeof content === 'string' ? content.split('\n') : []).map((i, idx) => `${idx + 1}. ${i}`).join('\n');
    case 'quote':
      return `> ${typeof content === 'string' ? content : ''}`;
    case 'code':
      const code = typeof content === 'object' ? content : { code: content, language: '' };
      return `\`\`\`${code.language || ''}\n${code.code || ''}\n\`\`\``;
    case 'divider':
      return '---';
    case 'callout':
      const callout = typeof content === 'object' ? content : { text: content };
      return `> **${(block.properties?.variant || 'info').toUpperCase()}:** ${callout.text || ''}`;
    case 'toggle':
      const toggle = typeof content === 'object' ? content : { title: content, body: '' };
      return `<details><summary>${toggle.title || ''}</summary>\n\n${toggle.body || ''}\n\n</details>`;
    case 'image':
      const img = typeof content === 'object' ? content : { url: content };
      return `![${img.alt || ''}](${img.url || ''})${img.caption ? `\n*${img.caption}*` : ''}`;
    case 'table':
      const table = typeof content === 'object' ? content : { headers: [], rows: [] };
      if (!table.headers || table.headers.length === 0) return '';
      let md = `| ${table.headers.join(' | ')} |\n`;
      md += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
      (table.rows || []).forEach(row => {
        md += `| ${row.join(' | ')} |\n`;
      });
      return md;
    case 'equation':
      const eq = typeof content === 'object' ? content : { latex: content };
      return `$$${eq.latex || ''}$$`;
    case 'bookmark':
      const bm = typeof content === 'object' ? content : { url: content };
      return `[${bm.title || bm.url || ''}](${bm.url || ''})`;
    default:
      return '';
  }
}

function blockToHtml(block) {
  const content = block.defaultContent;

  switch (block.type) {
    case 'paragraph':
      return `<p>${typeof content === 'string' ? content : ''}</p>`;
    case 'heading_1':
      return `<h1>${typeof content === 'string' ? content : ''}</h1>`;
    case 'heading_2':
      return `<h2>${typeof content === 'string' ? content : ''}</h2>`;
    case 'heading_3':
      return `<h3>${typeof content === 'string' ? content : ''}</h3>`;
    case 'bulleted_list':
      const items = typeof content === 'string' ? content.split('\n') : [];
      return `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
    case 'numbered_list':
      const nitems = typeof content === 'string' ? content.split('\n') : [];
      return `<ol>${nitems.map(i => `<li>${i}</li>`).join('')}</ol>`;
    case 'quote':
      return `<blockquote><p>${typeof content === 'string' ? content : ''}</p></blockquote>`;
    case 'code':
      const code = typeof content === 'object' ? content : { code: content, language: '' };
      return `<pre><code class="language-${code.language || ''}">${(code.code || '').replace(/</g, '&lt;')}</code></pre>`;
    case 'divider':
      return '<hr>';
    case 'callout':
      const callout = typeof content === 'object' ? content : { text: content };
      return `<div style="padding:16px;background:#f0f9ff;border-left:4px solid #3b82f6;border-radius:4px;margin:16px 0"><strong>${(block.properties?.variant || 'info').toUpperCase()}:</strong> ${callout.text || ''}</div>`;
    case 'image':
      const img = typeof content === 'object' ? content : { url: content };
      return `<figure><img src="${img.url || ''}" alt="${img.alt || ''}">${img.caption ? `<figcaption>${img.caption}</figcaption>` : ''}</figure>`;
    case 'table':
      const table = typeof content === 'object' ? content : { headers: [], rows: [] };
      if (!table.headers || table.headers.length === 0) return '';
      let html = '<table><thead><tr>';
      table.headers.forEach(h => html += `<th>${h}</th>`);
      html += '</tr></thead><tbody>';
      (table.rows || []).forEach(row => {
        html += '<tr>';
        row.forEach(cell => html += `<td>${cell}</td>`);
        html += '</tr>';
      });
      html += '</tbody></table>';
      return html;
    default:
      return '';
  }
}
