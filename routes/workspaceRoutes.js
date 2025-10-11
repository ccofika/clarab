const express = require('express');
const router = express.Router();
const {
  getWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  acceptInvite,
  rejectInvite,
  getPendingInvites,
  updateMemberPermission,
  cancelInvite
} = require('../controllers/workspaceController');
const { protect } = require('../middleware/auth');

router.route('/')
  .get(protect, getWorkspaces)
  .post(protect, createWorkspace);

router.route('/pending-invites')
  .get(protect, getPendingInvites);

router.route('/:id')
  .get(protect, getWorkspace)
  .put(protect, updateWorkspace)
  .delete(protect, deleteWorkspace);

router.route('/:id/accept-invite')
  .post(protect, acceptInvite);

router.route('/:id/reject-invite')
  .post(protect, rejectInvite);

router.route('/:id/members/:userId/permission')
  .put(protect, updateMemberPermission);

router.route('/:id/invites/:userId')
  .delete(protect, cancelInvite);

module.exports = router;
