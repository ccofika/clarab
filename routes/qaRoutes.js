const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const QAAllowedEmail = require('../models/QAAllowedEmail');

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
  getAgentPerformanceHistory,
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
  bulkRestoreTickets,
  bulkChangeStatus,
  archiveAllFiltered,
  bulkDeleteTickets,
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
  parseExcelAssignments,
  // Backup & Reassign All Grader Tickets
  backupGraderTickets,
  reassignAllGraderTickets,
  // Grade button click tracking
  recordGradeClick,
  getWeeklyGradeClicks,
  // Coaching
  generateCoachingReport,
  saveCoachingSession,
  getCoachingSessions,
  getCoachingSession,
  updateCoachingSession,
  deleteCoachingSession,
  shareCoachingSession,
  unshareCoachingSession,
  getQAGradersForCoaching,
  // QA Archive Admin
  getQAAdminStatus,
  getAdminAllTickets,
  // Review controllers
  getReviewTickets,
  getReviewTicket,
  updateReviewTicket,
  approveTicket,
  denyTicket,
  getReviewAnalytics,
  getReviewHistory,
  getReviewHistoryStats,
  getReviewReviewers,
  getReviewPendingCount,
  // Minimized ticket (dock feature)
  getMinimizedTicket,
  saveMinimizedTicket,
  saveMinimizedTicketBeacon,
  clearMinimizedTicket,
  // ZenMove controllers
  getExtractionCounts,
  getZenMoveSettings,
  updateZenMoveSettings
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
  getAllSummariesFromAllUsers,
  getSummaryGraders,
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
  getMacroTickets,
  getQAGradersForSharing,
  getQAGradersWithMacroCounts,
  getMacroAnalytics,
  getMacroSuggestions
} = require('../controllers/macroController');

const {
  // Macro Ticket controllers (send ticket to another grader)
  sendMacroTicket,
  getPendingMacroTickets,
  acceptMacroTicket,
  declineMacroTicket,
  getMacroTicket
} = require('../controllers/macroTicketController');

const { analyzeAllAgents } = require('../scripts/analyzeAgentIssues');

const {
  getReportTemplates,
  createReportTemplate,
  updateReportTemplate,
  deleteReportTemplate,
  getIntercomReferenceData,
  countReport,
  executeReport,
  getConversationMeta
} = require('../controllers/intercomReportController');

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

// Authorization middleware - check QA roles or database for allowed emails
const qaAuthorization = async (req, res, next) => {
  try {
    // Check if user has QA role (qa, qa-admin, or admin)
    const qaRoles = ['qa', 'qa-admin', 'admin', 'tl'];
    if (qaRoles.includes(req.user.role)) {
      return next();
    }

    // Fallback: Check if user's email is in the allowed list
    const allowedEmail = await QAAllowedEmail.findOne({ email: req.user.email.toLowerCase() });

    if (!allowedEmail) {
      return res.status(403).json({
        message: 'Access denied. You do not have permission to access QA Manager.'
      });
    }

    next();
  } catch (error) {
    console.error('QA Authorization error:', error);
    return res.status(500).json({
      message: 'Authorization check failed'
    });
  }
};

// Admin authorization - qa-admin or admin roles only
const allAgentsAdminAuth = (req, res, next) => {
  const qaAdminRoles = ['qa-admin', 'admin'];
  if (qaAdminRoles.includes(req.user.role)) {
    return next();
  }

  return res.status(403).json({
    message: 'Access denied. Only QA admins can manage all agents.'
  });
};

// Statistics authorization - qa-admin or admin roles only
const statisticsAuth = (req, res, next) => {
  const qaAdminRoles = ['qa-admin', 'admin'];
  if (qaAdminRoles.includes(req.user.role)) {
    return next();
  }

  return res.status(403).json({
    message: 'Access denied. Statistics is only available for QA admins.'
  });
};

// Review authorization - qa-admin or admin roles can access review functionality
const reviewAuth = (req, res, next) => {
  const reviewerRoles = ['qa-admin', 'admin'];
  if (reviewerRoles.includes(req.user.role)) {
    return next();
  }

  return res.status(403).json({
    message: 'Access denied. Only reviewers can access this resource.'
  });
};

// Check access endpoint - needs to be BEFORE qaAuthorization middleware
// This allows frontend to check if user has QA access without getting 403
router.get('/check-access', protect, async (req, res) => {
  try {
    // Check if user has QA role (qa, qa-admin, or admin)
    const qaRoles = ['qa', 'qa-admin', 'admin'];
    if (qaRoles.includes(req.user.role)) {
      return res.json({
        hasAccess: true,
        isQaAdmin: req.user.role === 'qa-admin' || req.user.role === 'admin',
        accessType: 'role'
      });
    }

    // Fallback: check allowed emails list
    const allowedEmail = await QAAllowedEmail.findOne({ email: req.user.email.toLowerCase() });
    res.json({
      hasAccess: !!allowedEmail,
      isQaAdmin: allowedEmail?.isAdmin || false,
      accessType: 'email'
    });
  } catch (error) {
    console.error('Check access error:', error);
    res.json({ hasAccess: false });
  }
});

// Beacon endpoint for minimized ticket (handles own auth - sendBeacon can't set headers)
router.post('/minimized-ticket/beacon', saveMinimizedTicketBeacon);

// Apply authentication and authorization to all other routes
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

// Get agent's performance history (last 3 weeks)
router.get('/agents/:id/performance-history', getAgentPerformanceHistory);

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
router.post('/tickets/bulk-restore', bulkRestoreTickets);
router.post('/tickets/bulk-status', bulkChangeStatus);
router.post('/tickets/bulk-delete', bulkDeleteTickets);
router.post('/tickets/archive-all-filtered', archiveAllFiltered);
router.post('/tickets/:id/grade', gradeTicket);
router.post('/tickets/:id/archive', archiveTicket);
router.post('/tickets/:id/restore', restoreTicket);

// ============================================
// MINIMIZED TICKET ROUTES (Dock Feature)
// ============================================

router.get('/minimized-ticket', getMinimizedTicket);
router.post('/minimized-ticket', saveMinimizedTicket);
router.delete('/minimized-ticket', clearMinimizedTicket);

// ============================================
// REVIEW ROUTES (Reviewers only - Filip, Nevena, Maja, Ana)
// ============================================

// Get pending review count (for notification badge)
router.get('/review/pending-count', reviewAuth, getReviewPendingCount);

// Review analytics
router.get('/review/analytics', reviewAuth, getReviewAnalytics);

// Review history (all tickets that passed through review)
router.get('/review/history', reviewAuth, getReviewHistory);

// Review history KPI stats (aggregated, same filters)
router.get('/review/history/stats', reviewAuth, getReviewHistoryStats);

// Review reviewers list (for filter dropdown - cached separately)
router.get('/review/reviewers', reviewAuth, getReviewReviewers);

// Review tickets CRUD
router.get('/review/tickets', reviewAuth, getReviewTickets);
router.get('/review/tickets/:id', reviewAuth, getReviewTicket);
router.put('/review/tickets/:id', reviewAuth, updateReviewTicket);

// Approve/Deny actions
router.post('/review/tickets/:id/approve', reviewAuth, approveTicket);
router.post('/review/tickets/:id/deny', reviewAuth, denyTicket);

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
// QA ADMIN STATUS ROUTE
// ============================================

// Check if current user is a QA admin (for archive permissions)
router.get('/admin/status', getQAAdminStatus);

// Get all tickets for admin advanced view (admin only)
router.get('/admin/tickets', getAdminAllTickets);

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

router.get('/summaries/all', getAllSummariesFromAllUsers);
router.get('/summaries/graders', getSummaryGraders);
router.get('/summaries/dates', getSummaryDates);

// Coaching Report (generate preview)
router.get('/coaching/report/:agentId', generateCoachingReport);

// Coaching Sessions CRUD
router.get('/coaching/graders', getQAGradersForCoaching);
router.route('/coaching/sessions')
  .get(getCoachingSessions)
  .post(saveCoachingSession);

router.route('/coaching/sessions/:id')
  .get(getCoachingSession)
  .put(updateCoachingSession)
  .delete(deleteCoachingSession);

router.put('/coaching/sessions/:id/share', shareCoachingSession);
router.delete('/coaching/sessions/:id/share/:sharedUserId', unshareCoachingSession);

router.route('/summaries/:id')
  .get(getSummary)
  .put(updateSummary)
  .delete(deleteSummary);

// ============================================
// MACRO ROUTES
// ============================================

// Search must be before :id route
router.get('/macros/search', searchMacros);

// Get QA graders for sharing macros (must be before :id route)
router.get('/macros/graders', getQAGradersForSharing);

// Get QA graders with macro counts (admin only, for dropdown)
router.get('/macros/graders-with-counts', getQAGradersWithMacroCounts);

// Macro analytics
router.get('/macros/analytics', getMacroAnalytics);

// Macro suggestions based on categories
router.get('/macros/suggestions', getMacroSuggestions);

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

// Trigger AI analysis of agent issues (manual run of weekly cron job)
router.post('/all-agents/analyze-issues', allAgentsAdminAuth, async (req, res) => {
  try {
    const results = await analyzeAllAgents(false);
    const totalUnresolved = results.reduce((sum, r) => sum + (r.unresolvedCount || 0), 0);
    const totalBadGrades = results.reduce((sum, r) => sum + (r.badGrades || 0), 0);

    res.json({
      message: 'Analysis complete',
      stats: {
        agentsAnalyzed: results.length,
        totalBadGrades,
        totalUnresolved
      },
      results
    });
  } catch (error) {
    console.error('Error running agent issues analysis:', error);
    res.status(500).json({ message: 'Failed to run analysis', error: error.message });
  }
});

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

// Backup grader tickets (creates JSON backup file)
router.post('/active-overview/backup-grader-tickets', allAgentsAdminAuth, backupGraderTickets);

// Reassign ALL non-archived tickets from one grader to another (with auto agent assignment)
router.post('/active-overview/reassign-grader-tickets', allAgentsAdminAuth, reassignAllGraderTickets);

// ============================================
// GRADE BUTTON CLICK TRACKING
// ============================================

// Record a grade button click (any QA user)
router.post('/grade-clicks', recordGradeClick);

// Get weekly grade click counts (admin only, for Active Overview)
router.get('/grade-clicks/weekly', allAgentsAdminAuth, getWeeklyGradeClicks);

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

// Bug report admin authorization - qa-admin or admin roles
const bugReportAdminAuth = (req, res, next) => {
  const adminRoles = ['qa-admin', 'admin'];
  if (!adminRoles.includes(req.user.role)) {
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

// ============================================
// ZENMOVE ROUTES
// ============================================

router.get('/zenmove/extraction-counts', getExtractionCounts);
router.get('/zenmove/settings', getZenMoveSettings);
router.put('/zenmove/settings', allAgentsAdminAuth, updateZenMoveSettings);

// ============================================
// ACP ROUTES (Cloudflare Access Proxy)
// ============================================

const AcpToken = require('../models/AcpToken');
const { encrypt: acpEncrypt, decrypt: acpDecrypt } = require('../utils/acpEncryption');

// Save ACP token (encrypted)
router.post('/acp/token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    // Parse JWT exp claim to determine expiry
    let expiresAt;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      expiresAt = new Date(payload.exp * 1000);
    } catch (e) {
      // Fallback: 24 hours from now
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const { encrypted, iv, authTag } = acpEncrypt(token);

    await AcpToken.findOneAndUpdate(
      { user: req.user._id },
      { encryptedToken: encrypted, iv, authTag, expiresAt },
      { upsert: true, new: true }
    );

    res.json({ success: true, expiresAt });
  } catch (error) {
    console.error('Error saving ACP token:', error);
    res.status(500).json({ message: 'Failed to save ACP token' });
  }
});

// Get ACP connection status
router.get('/acp/status', async (req, res) => {
  try {
    const acpToken = await AcpToken.findOne({ user: req.user._id });

    if (!acpToken) {
      return res.json({ connected: false, expired: false });
    }

    const expired = acpToken.expiresAt < new Date();
    res.json({ connected: !expired, expired, expiresAt: acpToken.expiresAt });
  } catch (error) {
    console.error('Error checking ACP status:', error);
    res.status(500).json({ message: 'Failed to check ACP status' });
  }
});

// Proxy GraphQL query to ACP
router.post('/acp/query', async (req, res) => {
  try {
    const acpToken = await AcpToken.findOne({ user: req.user._id });
    if (!acpToken) {
      return res.status(401).json({ message: 'ACP not connected. Please connect first.' });
    }

    if (acpToken.expiresAt < new Date()) {
      return res.status(401).json({ message: 'ACP token expired. Please reconnect.' });
    }

    let cfToken;
    try {
      cfToken = acpDecrypt({
        encrypted: acpToken.encryptedToken,
        iv: acpToken.iv,
        authTag: acpToken.authTag
      });
    } catch (e) {
      return res.status(500).json({ message: 'Failed to decrypt ACP token' });
    }

    const { query, variables } = req.body;
    if (!query) {
      return res.status(400).json({ message: 'GraphQL query is required' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'Cookie': `CF_Authorization=${cfToken}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://buyconcorde.club',
      'Referer': 'https://buyconcorde.club/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"'
    };

    // Add Stake API token if configured
    if (process.env.STAKE_API_TOKEN) {
      headers['x-access-token'] = process.env.STAKE_API_TOKEN;
    }

    const acpResponse = await fetch('https://buyconcorde.club/_api/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      redirect: 'follow'
    });

    if (!acpResponse.ok) {
      const errorText = await acpResponse.text();
      console.error(`ACP GraphQL error ${acpResponse.status}:`, errorText);

      if (acpResponse.status === 403 || acpResponse.status === 401) {
        return res.status(401).json({ message: 'ACP token rejected. Please reconnect.' });
      }

      return res.status(acpResponse.status).json({ message: 'ACP query failed' });
    }

    const data = await acpResponse.json();
    res.json(data);
  } catch (error) {
    console.error('ACP proxy error:', error);
    res.status(500).json({ message: 'Failed to proxy ACP query' });
  }
});

// ============ TEMPORARY MIGRATION ENDPOINT - DELETE AFTER USE ============
const Ticket = require('../models/Ticket');

router.get('/migrate-v2-scorecard', protect, async (req, res) => {
  try {
    if (req.user.email !== 'filipkozomara@mebit.io') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const dryRun = req.query.apply !== 'true';

    // Today's date range (2026-02-16)
    const todayStart = new Date('2026-02-16T00:00:00.000Z');
    const todayEnd = new Date('2026-02-17T00:00:00.000Z');

    // Find today's Selected, non-archived, non-V2 tickets (all graders)
    const tickets = await Ticket.find({
      dateEntered: { $gte: todayStart, $lt: todayEnd },
      status: 'Selected',
      isArchived: { $ne: true },
      scorecardVersion: { $ne: 'v2' }
    }).populate('agent', 'name position').populate('createdBy', 'name email').lean();

    const summary = tickets.map(t => ({
      _id: t._id,
      ticketId: t.ticketId,
      agent: t.agent?.name,
      grader: t.createdBy?.email,
      score: t.qualityScorePercent,
      scorecardVersion: t.scorecardVersion || 'legacy'
    }));

    if (dryRun) {
      return res.json({
        mode: 'DRY RUN',
        message: `Found ${tickets.length} legacy tickets to migrate. Add ?apply=true to execute.`,
        tickets: summary
      });
    }

    const results = [];
    for (const t of tickets) {
      const result = await Ticket.updateOne(
        { _id: t._id },
        {
          $set: {
            scorecardVersion: 'v2',
            scorecardValues: {},
            scorecardVariant: null,
            qualityScorePercent: null,
            reoccurringError: null,
            reoccurringErrorCategories: []
          }
        }
      );
      results.push({ ticketId: t.ticketId, agent: t.agent?.name, grader: t.createdBy?.email, modified: result.modifiedCount });
    }

    return res.json({
      mode: 'APPLIED',
      message: `Migrated ${results.length} tickets to V2`,
      results
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message });
  }
});
// ============ END TEMPORARY MIGRATION ENDPOINT ============

// ============================================
// INTERCOM CONVERSATION ROUTE
// ============================================

router.get('/intercom-conversation/:conversationId', async (req, res) => {
  try {
    const t0 = Date.now();
    const { conversationId } = req.params;
    const token = process.env.INTERCOM_API_TOKEN;

    if (!token) {
      return res.status(500).json({ error: 'Intercom API token not configured' });
    }

    const response = await fetch(
      `https://api.intercom.io/conversations/${conversationId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Intercom-Version': '2.11'
        }
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const errorText = await response.text();
      console.error(`Intercom API error ${response.status}:`, errorText);
      return res.status(response.status).json({ error: 'Failed to fetch conversation from Intercom' });
    }

    const conversation = await response.json();

    // Parse HTML body into ordered content blocks: { type: 'text'|'image', content/url }
    const parseHtmlBody = (html) => {
      if (!html) return [];
      const blocks = [];
      // Split by <img> tags, keeping the tags
      const parts = html.split(/(<img[^>]*>)/gi);
      for (const part of parts) {
        const imgMatch = part.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
        if (imgMatch) {
          blocks.push({ type: 'image', url: imgMatch[1] });
        } else {
          // Strip HTML tags, decode entities, normalize whitespace
          let text = part
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
            .replace(/<\/div>\s*<div[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, ''); // zero-width & invisible chars
          if (text.trim()) {
            blocks.push({ type: 'text', content: text });
          }
        }
      }
      return blocks;
    };

    // Build messages array from source + conversation_parts
    const messages = [];

    // Add source (initial message)
    if (conversation.source) {
      const srcBody = conversation.source.body || '';
      const srcBlocks = parseHtmlBody(srcBody);
      messages.push({
        id: conversation.source.id || 'source',
        type: 'message',
        body: srcBlocks.filter(b => b.type === 'text').map(b => b.content).join('\n'),
        contentBlocks: srcBlocks,
        authorType: conversation.source.author?.type || 'user',
        authorName: conversation.source.author?.name || 'Unknown',
        authorEmail: conversation.source.author?.email || '',
        authorAvatar: null,
        createdAt: conversation.created_at,
        attachments: conversation.source.attachments || []
      });
    }

    // Add conversation parts
    if (conversation.conversation_parts?.conversation_parts) {
      for (const part of conversation.conversation_parts.conversation_parts) {
        const partBody = part.body || '';
        const partBlocks = parseHtmlBody(partBody);
        messages.push({
          id: part.id,
          type: part.part_type || 'comment',
          body: partBlocks.filter(b => b.type === 'text').map(b => b.content).join('\n'),
          contentBlocks: partBlocks,
          authorType: part.author?.type || 'unknown',
          authorName: part.author?.name || 'System',
          authorEmail: part.author?.email || '',
          authorAvatar: null,
          createdAt: part.created_at,
          attachments: part.attachments || []
        });
      }
    }

    // Detect if conversation is email-based
    const sourceType = conversation.source?.delivered_as || conversation.source?.type || '';
    const isEmail = sourceType === 'customer_initiated'
      ? (conversation.source?.subject ? true : false)
      : ['email', 'automated'].includes(sourceType);
    const subject = conversation.source?.subject || '';

    console.log(`[PERF] intercom-conversation(${conversationId}): total=${Date.now() - t0}ms, ${messages.length} messages`);
    res.json({
      id: conversation.id,
      title: conversation.title || '',
      state: conversation.state,
      channel: isEmail || subject ? 'email' : 'chat',
      subject: subject,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages
    });
  } catch (error) {
    console.error('Intercom conversation fetch error:', error);
    res.status(500).json({ error: 'Internal server error fetching conversation' });
  }
});

// ============================================
// INTERCOM REPORT ROUTES
// ============================================

router.get('/intercom-report/reference-data', getIntercomReferenceData);
router.get('/intercom-report/templates', getReportTemplates);
router.post('/intercom-report/templates', createReportTemplate);
router.put('/intercom-report/templates/:id', updateReportTemplate);
router.delete('/intercom-report/templates/:id', deleteReportTemplate);
router.post('/intercom-report/count', countReport);
router.post('/intercom-report/execute', executeReport);
router.get('/intercom-report/conversation/:id', getConversationMeta);

module.exports = router;
