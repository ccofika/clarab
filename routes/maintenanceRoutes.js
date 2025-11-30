const express = require('express');
const router = express.Router();
const {
  getMaintenance,
  getMaintenanceById,
  createMaintenance,
  updateMaintenance,
  updateMaintenanceStatus,
  addMaintenanceUpdate,
  deleteMaintenance,
  getMaintenanceSummary
} = require('../controllers/maintenanceController');
const { protect, adminOnly, developerOrAdmin } = require('../middleware/auth');

// Public routes
router.route('/')
  .get(getMaintenance)
  .post(protect, developerOrAdmin, createMaintenance);

router.route('/summary')
  .get(getMaintenanceSummary);

router.route('/:id')
  .get(getMaintenanceById)
  .put(protect, developerOrAdmin, updateMaintenance)
  .delete(protect, adminOnly, deleteMaintenance);

router.route('/:id/status')
  .put(protect, developerOrAdmin, updateMaintenanceStatus);

router.route('/:id/updates')
  .post(protect, developerOrAdmin, addMaintenanceUpdate);

module.exports = router;
