const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const ext = require('../controllers/kbExtendedController');
const KBAdmin = require('../models/KBAdmin');

// Middleware: check if user is KB admin
const kbAdminAuth = async (req, res, next) => {
  try {
    const SUPERADMIN_EMAIL = 'filipkozomara@mebit.io';
    if (req.user.email === SUPERADMIN_EMAIL) {
      req.isSuperAdmin = true;
      req.isKBAdmin = true;
      return next();
    }

    const admin = await KBAdmin.findOne({ user: req.user._id });
    if (!admin) {
      return res.status(403).json({ message: 'KB Admin access required' });
    }

    req.isKBAdmin = true;
    req.isSuperAdmin = admin.role === 'superadmin';
    next();
  } catch (error) {
    res.status(500).json({ message: 'Auth check failed' });
  }
};

// ===================== TEMPLATES =====================
router.get('/templates', protect, ext.getTemplates);
router.get('/templates/:id', protect, ext.getTemplateById);
router.post('/templates', protect, kbAdminAuth, ext.createTemplate);
router.put('/templates/:id', protect, kbAdminAuth, ext.updateTemplate);
router.delete('/templates/:id', protect, kbAdminAuth, ext.deleteTemplate);
router.post('/templates/:id/use', protect, kbAdminAuth, ext.useTemplate);
router.post('/pages/:id/save-as-template', protect, kbAdminAuth, ext.saveAsTemplate);

// ===================== VERSION HISTORY =====================
router.get('/pages/:id/versions', protect, kbAdminAuth, ext.getVersions);
router.get('/pages/:id/versions/:version', protect, kbAdminAuth, ext.getVersion);
router.post('/pages/:id/restore/:version', protect, kbAdminAuth, ext.restoreVersion);

// ===================== COMMENTS =====================
router.get('/pages/:id/comments', protect, ext.getComments);
router.post('/pages/:id/comments', protect, ext.addComment);
router.put('/comments/:id', protect, ext.updateComment);
router.delete('/comments/:id', protect, ext.deleteComment);
router.post('/comments/:id/resolve', protect, ext.resolveComment);
router.post('/comments/:id/react', protect, ext.reactToComment);

// ===================== FAVORITES & RECENT =====================
router.get('/favorites', protect, ext.getFavorites);
router.post('/favorites/:pageId', protect, ext.toggleFavorite);
router.get('/recent', protect, ext.getRecentPages);
router.post('/recent/:pageId', protect, ext.trackPageVisit);

// ===================== SEARCH =====================
router.get('/search/fuzzy', protect, ext.fuzzySearch);
router.post('/search/boost', protect, ext.recordSearchBoost);
router.get('/search', protect, ext.search);
router.get('/search/suggestions', protect, ext.searchSuggestions);

// ===================== BOOKMARK METADATA =====================
router.get('/fetch-metadata', protect, ext.fetchMetadata);

// ===================== PERMISSIONS & SHARING =====================
router.get('/pages/:id/permissions', protect, kbAdminAuth, ext.getPermissions);
router.put('/pages/:id/permissions', protect, kbAdminAuth, ext.updatePermissions);
router.post('/pages/:id/share', protect, kbAdminAuth, ext.generateShareLink);
router.delete('/pages/:id/share', protect, kbAdminAuth, ext.revokeShareLink);
router.get('/shared/:token', ext.accessSharedPage); // Public - no auth

// ===================== ANALYTICS =====================
router.get('/pages/:id/analytics', protect, kbAdminAuth, ext.getPageAnalytics);
router.get('/analytics/top-pages', protect, kbAdminAuth, ext.getTopPages);
router.get('/analytics/stats', protect, kbAdminAuth, ext.getOverallStats);
router.get('/analytics/content-stats', protect, kbAdminAuth, ext.getContentStats);
router.get('/analytics/active-editors', protect, kbAdminAuth, ext.getActiveEditors);

// ===================== TAGS =====================
router.get('/tags', protect, ext.getAllTags);

// ===================== BULK OPERATIONS =====================
router.post('/bulk/delete', protect, kbAdminAuth, ext.bulkDelete);
router.post('/bulk/move', protect, kbAdminAuth, ext.bulkMove);
router.post('/bulk/tag', protect, kbAdminAuth, ext.bulkTag);
router.post('/bulk/permissions', protect, kbAdminAuth, ext.bulkPermissions);

// ===================== SETTINGS =====================
router.get('/settings', protect, kbAdminAuth, ext.getSettings);
router.put('/settings', protect, kbAdminAuth, ext.updateSettings);

// ===================== IMPORT/EXPORT =====================
router.get('/pages/:id/export/:format', protect, ext.exportPage);
router.post('/import', protect, kbAdminAuth, ext.importPage);

// ===================== LEARN MODE =====================
const learn = require('../controllers/kbLearnController');
router.get('/learn/categories', protect, learn.getLearnCategories);
router.post('/learn/generate-quiz', protect, learn.generateQuiz);
router.post('/learn/history', protect, learn.saveHistory);
router.get('/learn/history', protect, learn.getHistory);

module.exports = router;
