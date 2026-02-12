const express = require('express');
const router = express.Router();
const { protect, tl, tlAdmin } = require('../middleware/auth');
const tlController = require('../controllers/tlController');

// All routes require authentication
router.use(protect);

// TL Dashboard routes (requires TL role)
router.get('/my-teams', tl, tlController.getMyTeams);
router.get('/dashboard', tl, tlController.getDashboard);
router.get('/team/:teamName', tl, tlController.getTeamDetail);
router.get('/agent/:agentId', tl, tlController.getAgentDetail);
router.get('/available-teams', tl, tlController.getAvailableTeams);

// Admin routes (filipkozomara@mebit.io only)
router.get('/admin/team-leaders', tlAdmin, tlController.getTeamLeaders);
router.get('/admin/assignments', tlAdmin, tlController.getAssignments);
router.put('/admin/assignments/:userId', tlAdmin, tlController.updateAssignment);
router.delete('/admin/assignments/:userId', tlAdmin, tlController.deleteAssignment);

module.exports = router;
