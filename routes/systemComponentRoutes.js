const express = require('express');
const router = express.Router();
const {
  getComponents,
  getComponent,
  createComponent,
  updateComponent,
  updateComponentStatus,
  deleteComponent,
  getUptimeHistory,
  seedComponents
} = require('../controllers/systemComponentController');
const { protect, adminOnly, developerOrAdmin } = require('../middleware/auth');

// Public routes
router.route('/')
  .get(getComponents)
  .post(protect, developerOrAdmin, createComponent);

router.route('/uptime-history')
  .get(getUptimeHistory);

router.route('/seed')
  .post(protect, adminOnly, seedComponents);

router.route('/:id')
  .get(getComponent)
  .put(protect, developerOrAdmin, updateComponent)
  .delete(protect, adminOnly, deleteComponent);

router.route('/:id/status')
  .put(protect, developerOrAdmin, updateComponentStatus);

module.exports = router;
