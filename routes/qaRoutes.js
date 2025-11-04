const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const {
  // Agent controllers
  getAllAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  // Ticket controllers
  getAllTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  archiveTicket,
  bulkArchiveTickets,
  restoreTicket,
  // Dashboard controllers
  getDashboardStats,
  // Export controllers
  exportMaestro
} = require('../controllers/qaController');

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

// Apply authentication and authorization to all routes
router.use(protect);
router.use(qaAuthorization);

// ============================================
// AGENT ROUTES
// ============================================

router.route('/agents')
  .get(getAllAgents)
  .post(validate('createAgent'), createAgent);

router.route('/agents/:id')
  .get(getAgent)
  .put(validate('updateAgent'), updateAgent)
  .delete(deleteAgent);

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

module.exports = router;
