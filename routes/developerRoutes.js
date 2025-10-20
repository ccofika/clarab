const express = require('express');
const router = express.Router();
const {
  getSystemMetrics,
  getHealthCheck,
  getAllUsersForDeveloper,
  getAllWorkspacesForDeveloper,
  getSystemLogs,
  getDatabaseStats,
  getLoginAttempts,
  getSuspiciousActivity,
  getLockedAccounts,
  // Security Dashboard
  getSecurityDashboard,
  getRevokedTokens,
  revokeUserTokens,
  getSecuritySettings,
  updateSecuritySettings
} = require('../controllers/developerController');
const { protect, developer } = require('../middleware/auth');

// All developer routes require authentication and developer/admin role
router.use(protect, developer);

// System metrics and health
router.get('/metrics', getSystemMetrics);
router.get('/health', getHealthCheck);
router.get('/database-stats', getDatabaseStats);

// Read-only access to users and workspaces
router.get('/users', getAllUsersForDeveloper);
router.get('/workspaces', getAllWorkspacesForDeveloper);

// System logs
router.get('/logs', getSystemLogs);

// Security monitoring - Login attempts and account lockouts
router.get('/login-attempts', getLoginAttempts);
router.get('/suspicious-activity', getSuspiciousActivity);
router.get('/locked-accounts', getLockedAccounts);

// Security Dashboard - JWT Revocation & Settings
router.get('/security/dashboard', getSecurityDashboard);
router.get('/security/revoked-tokens', getRevokedTokens);
router.post('/security/revoke-tokens', revokeUserTokens);
router.get('/security/settings', getSecuritySettings);
router.put('/security/settings', updateSecuritySettings);

module.exports = router;
