const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { searchAffiliate, checkAccess } = require('../controllers/googleSheetsController');

// All routes require authentication
router.use(protect);

// Check Google Sheets access
router.get('/check-access', checkAccess);

// Search for affiliate bonuses
router.post('/search-affiliate', searchAffiliate);

module.exports = router;
