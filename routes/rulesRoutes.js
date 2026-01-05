const express = require('express');
const router = express.Router();
const rulesController = require('../controllers/rulesController');
const { protect } = require('../middleware/auth');

// Knowledge Admin emails (same as knowledge base)
const KNOWLEDGE_ADMIN_EMAILS = [
  'filipkozomara@mebit.io',
  'nevena@mebit.io'
];

// Middleware to check if user is knowledge admin
const knowledgeAdminAuth = (req, res, next) => {
  if (!req.user || !KNOWLEDGE_ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ message: 'Access denied. Knowledge admin required.' });
  }
  next();
};

// All routes require authentication
router.use(protect);

// GET routes (any authenticated user)
router.get('/', rulesController.getRules);
router.get('/tags', rulesController.getAllTags);
router.get('/category/:categoryId', rulesController.getRulesByCategory);
router.get('/:id', rulesController.getRule);

// POST/PUT/DELETE routes (admin only)
router.post('/', knowledgeAdminAuth, rulesController.createRule);
router.post('/bulk', knowledgeAdminAuth, rulesController.bulkCreateRules);
router.post('/sync-embeddings', knowledgeAdminAuth, rulesController.syncEmbeddings);
router.put('/:id', knowledgeAdminAuth, rulesController.updateRule);
router.delete('/:id', knowledgeAdminAuth, rulesController.deleteRule);

module.exports = router;
