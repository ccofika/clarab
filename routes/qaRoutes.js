const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

// Configure multer for Excel file uploads
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  }
});
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
  deleteAgentAdmin,
  // Active Overview Admin controllers
  getActiveOverview,
  reassignTicket,
  bulkReassignTickets,
  adminBulkArchiveTickets,
  // New Active Overview features
  reassignAgentBetweenGraders,
  swapAgentsBetweenGraders,
  archiveAllForGrader,
  getGradingVelocity,
  getAgentHistory,
  vacationModeRedistribute,
  getWeekSetup,
  saveWeekSetup,
  copyLastWeekSetup,
  getStaleTickets,
  getScoreComparison,
  parseExcelAssignments
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
  // Macro controllers
  getAllMacros,
  getMacro,
  searchMacros,
  createMacro,
  updateMacro,
  deleteMacro,
  recordMacroUsage,
  getMacroTickets
} = require('../controllers/macroController');

const {
  // Macro Ticket controllers (send ticket to another grader)
  sendMacroTicket,
  getPendingMacroTickets,
  acceptMacroTicket,
  declineMacroTicket,
  getMacroTicket
} = require('../controllers/macroTicketController');

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
// MACRO ROUTES
// ============================================

// Search must be before :id route
router.get('/macros/search', searchMacros);

router.route('/macros')
  .get(getAllMacros)
  .post(createMacro);

router.route('/macros/:id')
  .get(getMacro)
  .put(updateMacro)
  .delete(deleteMacro);

// Record macro usage for a ticket
router.post('/macros/:id/use', recordMacroUsage);

// Get tickets where macro was used (paginated)
router.get('/macros/:id/tickets', getMacroTickets);

// ============================================
// MACRO TICKET ROUTES (Send ticket to another grader)
// ============================================

// Get pending macro tickets for current user
router.get('/macro-tickets/pending', getPendingMacroTickets);

// Send a macro ticket to the grader managing an agent
router.post('/macro-tickets', sendMacroTicket);

// Get, accept, or decline a specific macro ticket
router.get('/macro-tickets/:id', getMacroTicket);
router.post('/macro-tickets/:id/accept', acceptMacroTicket);
router.post('/macro-tickets/:id/decline', declineMacroTicket);

// ============================================
// ALL AGENTS ADMIN ROUTES (Admin only - Filip & Nevena)
// ============================================

router.get('/all-agents', allAgentsAdminAuth, getAllAgentsAdmin);
router.put('/all-agents/:id', allAgentsAdminAuth, updateAgentAdmin);
router.delete('/all-agents/:id', allAgentsAdminAuth, deleteAgentAdmin);
router.post('/all-agents/merge', allAgentsAdminAuth, mergeAgents);

// ============================================
// ACTIVE OVERVIEW ROUTES (Admin only - Filip & Nevena)
// ============================================

// Get all active tickets grouped by QA grader and agent
router.get('/active-overview', allAgentsAdminAuth, getActiveOverview);

// Reassign single ticket to another QA grader
router.put('/tickets/:id/reassign', allAgentsAdminAuth, reassignTicket);

// Bulk reassign tickets to another QA grader
router.post('/tickets/bulk-reassign', allAgentsAdminAuth, bulkReassignTickets);

// Bulk archive tickets from active overview
router.post('/active-overview/bulk-archive', allAgentsAdminAuth, adminBulkArchiveTickets);

// Reassign agent between graders (move agent + tickets)
router.post('/active-overview/reassign-agent', allAgentsAdminAuth, reassignAgentBetweenGraders);

// Swap agents between two graders
router.post('/active-overview/swap-agents', allAgentsAdminAuth, swapAgentsBetweenGraders);

// Archive all tickets for a specific grader
router.post('/active-overview/archive-grader-tickets', allAgentsAdminAuth, archiveAllForGrader);

// Get grading velocity (tickets graded per day)
router.get('/active-overview/velocity', allAgentsAdminAuth, getGradingVelocity);

// Get agent evaluation history
router.get('/active-overview/agent-history/:agentId', allAgentsAdminAuth, getAgentHistory);

// Vacation mode - redistribute agents
router.post('/active-overview/vacation-mode', allAgentsAdminAuth, vacationModeRedistribute);

// Week setup management
router.get('/active-overview/week-setup', allAgentsAdminAuth, getWeekSetup);
router.post('/active-overview/week-setup', allAgentsAdminAuth, saveWeekSetup);

// Copy last week's setup
router.post('/active-overview/copy-last-week', allAgentsAdminAuth, copyLastWeekSetup);

// Get stale tickets (not graded within X days)
router.get('/active-overview/stale-tickets', allAgentsAdminAuth, getStaleTickets);

// Get score comparison between graders
router.get('/active-overview/score-comparison', allAgentsAdminAuth, getScoreComparison);

// Import agent assignments from Excel file
router.post('/active-overview/import-excel', allAgentsAdminAuth, excelUpload.single('file'), parseExcelAssignments);

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

// ============================================
// ASSIGNMENT ROUTES (MaestroQA Bot Tracking)
// ============================================

const {
  getAgentAssignments,
  createAssignment,
  updateAssignment,
  addTicketsToAssignment,
  markTicketGraded,
  getActiveAssignment,
  deleteAssignment
} = require('../controllers/assignmentController');

// Get all assignments for an agent
router.get('/assignments/:agentId', protect, qaAuthorization, getAgentAssignments);

// Get active assignment for an agent (current week)
router.get('/assignments/:agentId/active', protect, qaAuthorization, getActiveAssignment);

// Create new assignment
router.post('/assignments', protect, qaAuthorization, createAssignment);

// Update assignment
router.put('/assignments/:assignmentId', protect, qaAuthorization, updateAssignment);

// Add tickets to existing assignment
router.post('/assignments/:assignmentId/tickets', protect, qaAuthorization, addTicketsToAssignment);

// Mark ticket as graded in assignment
router.post('/assignments/:assignmentId/graded/:ticketId', protect, qaAuthorization, markTicketGraded);

// Delete assignment (reset)
router.delete('/assignments/:assignmentId', protect, qaAuthorization, deleteAssignment);

// ============================================
// BUG REPORT ROUTES
// ============================================
const BugReport = require('../models/BugReport');

// Bug report admin authorization - only Filip
const bugReportAdminAuth = (req, res, next) => {
  if (req.user.email !== 'filipkozomara@mebit.io') {
    return res.status(403).json({
      message: 'Access denied. Only admin can view bug reports.'
    });
  }
  next();
};

// Submit a bug report (any QA user)
router.post('/bug-reports', async (req, res) => {
  try {
    const { title, description, currentPage, userAgent } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const bugReport = await BugReport.create({
      title: title.trim(),
      description: description?.trim() || '',
      reportedBy: req.user._id,
      reporterEmail: req.user.email,
      currentPage: currentPage || '',
      userAgent: userAgent || ''
    });

    res.status(201).json({
      message: 'Bug report submitted successfully',
      bugReport
    });
  } catch (error) {
    console.error('Error creating bug report:', error);
    res.status(500).json({ message: 'Failed to submit bug report' });
  }
});

// Get all bug reports (admin only)
router.get('/bug-reports', bugReportAdminAuth, async (req, res) => {
  try {
    const bugReports = await BugReport.find()
      .sort({ createdAt: -1 })
      .populate('reportedBy', 'name email');

    res.json(bugReports);
  } catch (error) {
    console.error('Error fetching bug reports:', error);
    res.status(500).json({ message: 'Failed to fetch bug reports' });
  }
});

// Update bug report status (admin only)
router.patch('/bug-reports/:id', bugReportAdminAuth, async (req, res) => {
  try {
    const { status, priority } = req.body;
    const updateData = {};

    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;

    const bugReport = await BugReport.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('reportedBy', 'name email');

    if (!bugReport) {
      return res.status(404).json({ message: 'Bug report not found' });
    }

    res.json(bugReport);
  } catch (error) {
    console.error('Error updating bug report:', error);
    res.status(500).json({ message: 'Failed to update bug report' });
  }
});

// Delete bug report (admin only)
router.delete('/bug-reports/:id', bugReportAdminAuth, async (req, res) => {
  try {
    const bugReport = await BugReport.findByIdAndDelete(req.params.id);

    if (!bugReport) {
      return res.status(404).json({ message: 'Bug report not found' });
    }

    res.json({ message: 'Bug report deleted successfully' });
  } catch (error) {
    console.error('Error deleting bug report:', error);
    res.status(500).json({ message: 'Failed to delete bug report' });
  }
});

module.exports = router;
