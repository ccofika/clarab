const express = require('express');
const router = express.Router();

// ============================================
// DOWNTIME TOGGLE - Change this to true/false
// ============================================
const DOWNTIME_ACTIVE = true;
// ============================================

router.get('/', (req, res) => {
  res.json({ active: DOWNTIME_ACTIVE });
});

module.exports = router;
