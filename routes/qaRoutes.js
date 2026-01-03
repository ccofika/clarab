const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const {
  // Agent controllers
  getAllAgents,
  getAgent,
  getAgentIssues,
  createAgent,
  updateAgent,
  deleteAgent,
  getAllExistingAgents,
  addExistingAgent,
  getAgentsWithTickets,
  checkSimilarAgents,
  // Ticket controllers
  getAllTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  gradeTicket,
  archiveTicket,
  bulkArchiveTickets,
  restoreTicket,
  // Dashboard controllers
  getDashboardStats,
  // Export controllers
  exportMaestro,
  // AI Search controllers
  aiSemanticSearch,
  generateTicketEmbeddingEndpoint,
  generateAllTicketEmbeddings,
  getSimilarFeedbacks,
  // All Agents Admin controllers
  getAllAgentsAdmin,
  updateAgentAdmin,
  mergeAgents,
  deleteAgentAdmin
} = require('../controllers/qaController');

const {
  // AI controllers
  getSuggestedFeedback,
  getAgentAnalysis
} = require('../controllers/aiController');

const {
  // Analytics controllers
  getAnalytics,
  getGraders,
  // AI Assistant controllers
  aiAssistant,
  getAISessions,
  getAISession,
  deleteAISession
} = require('../controllers/qaAnalyticsController');

const {
  // Summary controllers
  generateSummary,
  getAllSummaries,
  getSummaryDates,
  getSummary,
  updateSummary,
  deleteSummary
} = require('../controllers/summaryController');

const {
  // Statistics controllers
  getStatisticCards,
  getStatisticCardsForUser,
  getStatisticCard,
  createStatisticCard,
  createFromTemplate,
  updateStatisticCard,
  updateCardLayouts,
  deleteStatisticCard,
  fetchCardData,
  getTemplates,
  getMetadata,
  getStatisticsUsers
} = require('../controllers/statisticsController');

// Authorization middleware - only allow specific emails
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

// Admin authorization - only Filip and Nevena for All Agents management
const allAgentsAdminAuth = (req, res, next) => {
  const adminEmails = [
    'filipkozomara@mebit.io',
    'nevena@mebit.io'
  ];

  if (!adminEmails.includes(req.user.email)) {
    return res.status(403).json({
      message: 'Access denied. Only admins can manage all agents.'
    });
  }

  next();
};

// Statistics authorization - only Filip and Nevena
const statisticsAuth = (req, res, next) => {
  const allowedEmails = [
    'filipkozomara@mebit.io',
    'nevena@mebit.io'
  ];

  if (!allowedEmails.includes(req.user.email)) {
    return res.status(403).json({
      message: 'Access denied. Statistics is only available for authorized users.'
    });
  }

  next();
};

// Apply authentication and authorization to all routes
router.use(protect);
router.use(qaAuthorization);

// ============================================
// AGENT ROUTES
// ============================================

router.route('/agents')
  .get(getAllAgents)
  .post(validate('createAgent'), createAgent);

// Special agent routes (must be before :id routes)
router.get('/agents/all/existing', getAllExistingAgents);
router.get('/agents/with-tickets', getAgentsWithTickets);
router.post('/agents/check-similar', checkSimilarAgents);
router.post('/agents/:id/add-to-list', addExistingAgent);

router.route('/agents/:id')
  .get(getAgent)
  .put(validate('updateAgent'), updateAgent)
  .delete(deleteAgent);

// Get agent's unresolved issues
router.get('/agents/:id/issues', getAgentIssues);

// ============================================
// TICKET ROUTES
// ============================================

router.route('/tickets')
  .get(getAllTickets)
  .post(validate('createTicket'), createTicket);

router.route('/tickets/:id')
  .get(getTicket)
  .put(validate('updateTicket'), updateTicket)
  .delete(deleteTicket);

// Ticket actions
router.post('/tickets/bulk-archive', bulkArchiveTickets);
router.post('/tickets/:id/grade', gradeTicket);
router.post('/tickets/:id/archive', archiveTicket);
router.post('/tickets/:id/restore', restoreTicket);

// ============================================
// DASHBOARD ROUTES
// ============================================

router.get('/dashboard/stats', getDashboardStats);

// ============================================
// EXPORT ROUTES
// ============================================

router.post('/export/maestro/:agentId', exportMaestro);

// ============================================
// AI ROUTES
// ============================================

router.post('/ai/suggest-feedback', getSuggestedFeedback);
router.get('/ai/analyze-agent/:agentId', getAgentAnalysis);

// AI Search routes
router.get('/ai-search', aiSemanticSearch);
router.post('/tickets/:id/generate-embedding', generateTicketEmbeddingEndpoint);
router.post('/generate-all-embeddings', generateAllTicketEmbeddings);
router.post('/tickets/similar-feedbacks', getSimilarFeedbacks);

// ============================================
// ANALYTICS ROUTES
// ============================================

router.get('/analytics', getAnalytics);
router.get('/analytics/graders', getGraders);

// ============================================
// AI ASSISTANT ROUTES
// ============================================

router.post('/ai-assistant', aiAssistant);

router.route('/ai-sessions')
  .get(getAISessions);

router.route('/ai-sessions/:id')
  .get(getAISession)
  .delete(deleteAISession);

// ============================================
// SUMMARY ROUTES
// ============================================

router.route('/summaries')
  .get(getAllSummaries)
  .post(generateSummary);

router.get('/summaries/dates', getSummaryDates);

router.route('/summaries/:id')
  .get(getSummary)
  .put(updateSummary)
  .delete(deleteSummary);

// ============================================
// ALL AGENTS ADMIN ROUTES (Admin only - Filip & Nevena)
// ============================================

router.get('/all-agents', allAgentsAdminAuth, getAllAgentsAdmin);
router.put('/all-agents/:id', allAgentsAdminAuth, updateAgentAdmin);
router.delete('/all-agents/:id', allAgentsAdminAuth, deleteAgentAdmin);
router.post('/all-agents/merge', allAgentsAdminAuth, mergeAgents);

// ============================================
// STATISTICS ROUTES (Filip & Nevena only)
// ============================================

// Get metadata (available metrics, operators, etc.)
router.get('/statistics/metadata', statisticsAuth, getMetadata);

// Get available templates
router.get('/statistics/templates', statisticsAuth, getTemplates);

// Get statistics users (for switching views)
router.get('/statistics/users', statisticsAuth, getStatisticsUsers);

// Create from template
router.post('/statistics/from-template', statisticsAuth, createFromTemplate);

// Update multiple card layouts (for drag/resize)
router.put('/statistics/layouts', statisticsAuth, updateCardLayouts);

// Fetch data for preview or existing card
router.post('/statistics/cards/:id/data', statisticsAuth, fetchCardData);

// Get cards for another user (view mode)
router.get('/statistics/user/:userId', statisticsAuth, getStatisticCardsForUser);

// CRUD for statistic cards
router.route('/statistics/cards')
  .get(statisticsAuth, getStatisticCards)
  .post(statisticsAuth, createStatisticCard);

router.route('/statistics/cards/:id')
  .get(statisticsAuth, getStatisticCard)
  .put(statisticsAuth, updateStatisticCard)
  .delete(statisticsAuth, deleteStatisticCard);

module.exports = router;
