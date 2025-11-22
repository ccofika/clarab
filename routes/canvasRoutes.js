const express = require('express');
const router = express.Router();
const {
  getCanvasByWorkspace,
  getCanvasElements,
  createCanvasElement,
  updateCanvasElement,
  deleteCanvasElement,
  updateCanvasViewState,
  searchCanvasElements,
  generateElementEmbeddingEndpoint,
  generateAllEmbeddings,
  aiSemanticSearch,
  parseQuery,
  aiAssistant,
  createChatSession,
  getChatSessions,
  getChatSession,
  addMessageToSession,
  deleteChatSession
} = require('../controllers/canvasController');
const { protect } = require('../middleware/auth');

// Search routes
router.get('/search', protect, searchCanvasElements);
router.get('/ai-search', protect, aiSemanticSearch);
router.post('/parse-query', protect, parseQuery);

// AI Assistant routes
router.post('/ai-assistant', protect, aiAssistant);

// AI Chat Session routes
router.post('/chat-sessions', protect, createChatSession);
router.get('/chat-sessions', protect, getChatSessions);
router.get('/chat-sessions/:sessionId', protect, getChatSession);
router.post('/chat-sessions/:sessionId/messages', protect, addMessageToSession);
router.delete('/chat-sessions/:sessionId', protect, deleteChatSession);

// Embedding generation routes
router.post('/generate-all-embeddings', protect, generateAllEmbeddings);
router.post('/elements/:elementId/generate-embedding', protect, generateElementEmbeddingEndpoint);

// Canvas routes
router.get('/workspace/:workspaceId', protect, getCanvasByWorkspace);
router.put('/:canvasId/viewstate', protect, updateCanvasViewState);

// Canvas element routes
router.route('/:canvasId/elements')
  .get(protect, getCanvasElements)
  .post(protect, createCanvasElement);

router.route('/elements/:elementId')
  .put(protect, updateCanvasElement)
  .delete(protect, deleteCanvasElement);

module.exports = router;
