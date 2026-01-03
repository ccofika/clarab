/**
 * Report Routes
 *
 * API routes for the Statistics/Reports system.
 * All routes require authentication and statistics access.
 */

const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

// ============================================
// MIDDLEWARE
// ============================================

// Protect all routes
router.use(protect);

// Statistics access middleware - only specific users
const statisticsAuth = (req, res, next) => {
  const allowedEmails = [
    'nevena@mebit.io',
    'filipkozomara@mebit.io',
    'vasilije@mebit.io',
    'mladen@mebit.io'
  ];

  if (!req.user || !allowedEmails.includes(req.user.email)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Statistics access required.'
    });
  }

  next();
};

router.use(statisticsAuth);

// ============================================
// METADATA & TEMPLATES
// ============================================

// Get metadata for chart builder (datasets, metrics, operators, etc.)
router.get('/metadata', reportController.getMetadata);

// Get available templates
router.get('/templates', reportController.getTemplates);

// Create report from template
router.post('/from-template', reportController.createFromTemplate);

// ============================================
// REPORTS CRUD
// ============================================

// List all reports for user
router.get('/', reportController.getReports);

// Create new report
router.post('/', reportController.createReport);

// Get single report with charts
router.get('/:id', reportController.getReport);

// Update report
router.put('/:id', reportController.updateReport);

// Delete report
router.delete('/:id', reportController.deleteReport);

// Duplicate report
router.post('/:id/duplicate', reportController.duplicateReport);

// Save report as template
router.post('/:id/save-as-template', reportController.saveAsTemplate);

// Get all data for report (all charts)
router.get('/:id/data', reportController.getReportData);

// ============================================
// CHARTS CRUD
// ============================================

// Add chart to report
router.post('/:id/charts', reportController.addChart);

// Update multiple chart layouts (must be before :chartId route)
router.put('/:id/charts/layouts', reportController.updateChartLayouts);

// Update chart
router.put('/:id/charts/:chartId', reportController.updateChart);

// Delete chart
router.delete('/:id/charts/:chartId', reportController.deleteChart);

// ============================================
// CHART DATA
// ============================================

// Get data for single chart
router.get('/charts/:chartId/data', reportController.getChartData);

// Preview chart data (without saving)
router.post('/charts/preview', reportController.previewChartData);

// Get drill-down data
router.post('/charts/:chartId/drill-down', reportController.getDrillDownData);

module.exports = router;
