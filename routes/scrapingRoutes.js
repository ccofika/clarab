const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getSessions,
  getSession,
  createSession,
  startScraping,
  cancelSession,
  deleteSession,
  getSessionConversations,
  getConversation,
  parseCSVPreview,
  saveConversation,
  openLoginBrowser,
  saveLoginCookies,
  cancelLogin,
  checkLoginStatus
} = require('../controllers/scrapingController');

const {
  startSessionEvaluation,
  getEvaluationStatus,
  getSessionEvaluations,
  getEvaluationDetail,
  getCostSummary,
  reEvaluateTicket,
  deleteSessionEvaluations
} = require('../controllers/evaluationController');

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

// Apply authentication and authorization to all routes
router.use(protect);
router.use(qaAuthorization);

// ============================================
// SESSION ROUTES
// ============================================

// GET /api/qa/scrape/sessions - Get all sessions for user
router.get('/sessions', getSessions);

// POST /api/qa/scrape/sessions - Create new session
router.post('/sessions', createSession);

// GET /api/qa/scrape/sessions/:id - Get single session
router.get('/sessions/:id', getSession);

// POST /api/qa/scrape/sessions/:id/start - Start scraping
router.post('/sessions/:id/start', startScraping);

// POST /api/qa/scrape/sessions/:id/cancel - Cancel session
router.post('/sessions/:id/cancel', cancelSession);

// DELETE /api/qa/scrape/sessions/:id - Delete session
router.delete('/sessions/:id', deleteSession);

// GET /api/qa/scrape/sessions/:id/conversations - Get conversations for session
router.get('/sessions/:id/conversations', getSessionConversations);

// ============================================
// EVALUATION ROUTES
// ============================================

// POST /api/qa/scrape/sessions/:id/evaluate - Start AI evaluation for session
router.post('/sessions/:id/evaluate', startSessionEvaluation);

// GET /api/qa/scrape/sessions/:id/evaluation-status - Get evaluation status
router.get('/sessions/:id/evaluation-status', getEvaluationStatus);

// GET /api/qa/scrape/sessions/:id/evaluations - Get all evaluations for session (debug page)
router.get('/sessions/:id/evaluations', getSessionEvaluations);

// DELETE /api/qa/scrape/sessions/:id/evaluations - Delete all evaluations (for re-run)
router.delete('/sessions/:id/evaluations', deleteSessionEvaluations);

// GET /api/qa/scrape/evaluations/cost-summary - Get aggregated cost stats
router.get('/evaluations/cost-summary', getCostSummary);

// GET /api/qa/scrape/evaluations/:id - Get single evaluation detail
router.get('/evaluations/:id', getEvaluationDetail);

// POST /api/qa/scrape/evaluations/:id/re-evaluate - Re-evaluate single ticket
router.post('/evaluations/:id/re-evaluate', reEvaluateTicket);

// ============================================
// CONVERSATION ROUTES
// ============================================

// GET /api/qa/scrape/conversations/:id - Get single conversation
router.get('/conversations/:id', getConversation);

// POST /api/qa/scrape/conversations - Manual save conversation
router.post('/conversations', saveConversation);

// ============================================
// UTILITY ROUTES
// ============================================

// POST /api/qa/scrape/parse-csv - Parse CSV and preview
router.post('/parse-csv', parseCSVPreview);

// ============================================
// LOGIN ROUTES
// ============================================

// GET /api/qa/scrape/login/status - Check login status
router.get('/login/status', checkLoginStatus);

// POST /api/qa/scrape/login - Open browser for manual login
router.post('/login', openLoginBrowser);

// POST /api/qa/scrape/login/save - Save cookies after login
router.post('/login/save', saveLoginCookies);

// POST /api/qa/scrape/login/cancel - Cancel login
router.post('/login/cancel', cancelLogin);

module.exports = router;
