const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  addSubcategory,
  updateSubcategory,
  deleteSubcategory,
  getKnowledgeForAI,
  getFlaggedTickets,
  getFlaggedStats,
  updateFlaggedReview,
  importFlaggedTicket,
  bulkImportFlaggedTickets,
  getEmbeddingsStatus,
  syncEmbeddings,
  regenerateAllEmbeddings
} = require('../controllers/knowledgeController');

// QA Authorization middleware - only allow specific emails
const qaAuthorization = (req, res, next) => {
  const allowedEmails = [
    'filipkozomara@mebit.io',
    'vasilijevitorovic@mebit.io',
    'nevena@mebit.io',
    'mladenjorganovic@mebit.io'
  ];

  if (!allowedEmails.includes(req.user.email)) {
    return res.status(403).json({
      message: 'Access denied. You do not have permission to access QA Manager.'
    });
  }

  next();
};

// Knowledge Base Admin Authorization - more restrictive
const knowledgeAdminAuthorization = (req, res, next) => {
  const adminEmails = [
    'filipkozomara@mebit.io',
    'nevena@mebit.io'
  ];

  if (!adminEmails.includes(req.user.email)) {
    return res.status(403).json({
      message: 'Access denied. Only Knowledge Base admins can perform this action.'
    });
  }

  next();
};

// Apply authentication to all routes
router.use(protect);

// ============================================
// CATEGORY ROUTES (Admin only)
// ============================================

// GET /api/qa/knowledge/categories - Get all categories (QA users can view)
router.get('/categories', qaAuthorization, getCategories);

// GET /api/qa/knowledge/categories/:id - Get single category
router.get('/categories/:id', qaAuthorization, getCategory);

// POST /api/qa/knowledge/categories - Create category (Admin only)
router.post('/categories', knowledgeAdminAuthorization, createCategory);

// PUT /api/qa/knowledge/categories/:id - Update category (Admin only)
router.put('/categories/:id', knowledgeAdminAuthorization, updateCategory);

// DELETE /api/qa/knowledge/categories/:id - Delete category (Admin only)
router.delete('/categories/:id', knowledgeAdminAuthorization, deleteCategory);

// ============================================
// SUBCATEGORY ROUTES (Admin only)
// ============================================

// POST /api/qa/knowledge/categories/:id/subcategories - Add subcategory
router.post('/categories/:id/subcategories', knowledgeAdminAuthorization, addSubcategory);

// PUT /api/qa/knowledge/categories/:id/subcategories/:subId - Update subcategory
router.put('/categories/:id/subcategories/:subId', knowledgeAdminAuthorization, updateSubcategory);

// DELETE /api/qa/knowledge/categories/:id/subcategories/:subId - Delete subcategory
router.delete('/categories/:id/subcategories/:subId', knowledgeAdminAuthorization, deleteSubcategory);

// ============================================
// AI KNOWLEDGE ROUTE
// ============================================

// GET /api/qa/knowledge/ai - Get knowledge formatted for AI
router.get('/ai', qaAuthorization, getKnowledgeForAI);

// ============================================
// FLAGGED TICKETS ROUTES
// ============================================

// POST /api/qa/knowledge/flagged/bulk-import - Bulk import tickets
router.post('/flagged/bulk-import', qaAuthorization, bulkImportFlaggedTickets);

// GET /api/qa/knowledge/flagged/:sessionId - Get flagged tickets for session
router.get('/flagged/:sessionId', qaAuthorization, getFlaggedTickets);

// GET /api/qa/knowledge/flagged/:sessionId/stats - Get stats for session
router.get('/flagged/:sessionId/stats', qaAuthorization, getFlaggedStats);

// PUT /api/qa/knowledge/flagged/:id/review - Update QA review
router.put('/flagged/:id/review', qaAuthorization, updateFlaggedReview);

// POST /api/qa/knowledge/flagged/:id/import - Import single ticket
router.post('/flagged/:id/import', qaAuthorization, importFlaggedTicket);

// ============================================
// EMBEDDINGS ROUTES (Admin only)
// ============================================

// GET /api/qa/knowledge/embeddings/status - Get sync status
router.get('/embeddings/status', knowledgeAdminAuthorization, getEmbeddingsStatus);

// POST /api/qa/knowledge/embeddings/sync - Sync rules to chunks
router.post('/embeddings/sync', knowledgeAdminAuthorization, syncEmbeddings);

// POST /api/qa/knowledge/embeddings/regenerate - Force regenerate all
router.post('/embeddings/regenerate', knowledgeAdminAuthorization, regenerateAllEmbeddings);

module.exports = router;
