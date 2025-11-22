const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const quickLinkController = require('../controllers/quickLinkController');

// ===== CATEGORY ROUTES =====

// Get all categories and links for current user
router.get('/', protect, quickLinkController.getCategories);

// Get recently clicked links
router.get('/recent', protect, quickLinkController.getRecentLinks);

// Create new category
router.post('/category', protect, quickLinkController.createCategory);

// Update category
router.put('/category/:categoryId', protect, quickLinkController.updateCategory);

// Delete category
router.delete('/category/:categoryId', protect, quickLinkController.deleteCategory);

// Duplicate category
router.post('/category/:categoryId/duplicate', protect, quickLinkController.duplicateCategory);

// Reorder categories
router.post('/reorder-categories', protect, quickLinkController.reorderCategories);

// Toggle category privacy (public/private)
router.post('/category/:categoryId/toggle-privacy', protect, quickLinkController.togglePrivacy);

// Share category with users
router.post('/category/:categoryId/share', protect, quickLinkController.shareCategory);

// Unshare category from user
router.delete('/category/:categoryId/share/:userId', protect, quickLinkController.unshareCategory);

// Get all links in category (for "Open All" feature)
router.get('/category/:categoryId/all-links', protect, quickLinkController.getAllLinksInCategory);

// ===== LINK ROUTES =====

// Add link to category
router.post('/link', protect, quickLinkController.addLink);

// Update link
router.put('/link/:categoryId/:linkId', protect, quickLinkController.updateLink);

// Delete link
router.delete('/link/:categoryId/:linkId', protect, quickLinkController.deleteLink);

// Toggle pin status
router.post('/link/:categoryId/:linkId/toggle-pin', protect, quickLinkController.togglePin);

// Track link click
router.post('/link/:categoryId/:linkId/track-click', protect, quickLinkController.trackClick);

// Reorder links within category
router.post('/category/:categoryId/reorder-links', protect, quickLinkController.reorderLinks);

// ===== BULK OPERATIONS =====

// Bulk delete categories and/or links
router.post('/bulk-delete', protect, quickLinkController.bulkDelete);

// ===== IMPORT/EXPORT =====

// Export links (JSON or HTML bookmarks)
router.get('/export', protect, quickLinkController.exportLinks);

// Import links from JSON
router.post('/import', protect, quickLinkController.importLinks);

module.exports = router;
