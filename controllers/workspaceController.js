const Workspace = require('../models/Workspace');
const Canvas = require('../models/Canvas');
const { logActivity } = require('../utils/activityLogger');

// @desc    Get all workspaces for user
// @route   GET /api/workspaces
// @access  Private
const getWorkspaces = async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      $or: [
        { owner: req.user._id },
        { type: 'announcements' },
        { type: 'active-issues' },
        { 'members.user': req.user._id },
        { invitedMembers: req.user._id }
      ]
    })
    .populate('owner', 'name email')
    .populate('members.user', 'name email')
    .populate('invitedMembers', 'name email')
    .sort({ type: -1, createdAt: -1 }); // Announcements first, then by creation date

    // Add permissions to each workspace
    const workspacesWithPermissions = workspaces.map(workspace => {
      const workspaceObj = workspace.toObject();
      return {
        ...workspaceObj,
        permissions: {
          canEdit: workspace.canEdit(req.user._id, req.user.role),
          canDelete: workspace.canDelete(req.user._id, req.user.role),
          canView: workspace.canView(req.user._id),
          canEditContent: workspace.canEditContent(req.user._id, req.user.role)
        }
      };
    });

    res.json(workspacesWithPermissions);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single workspace
// @route   GET /api/workspaces/:id
// @access  Private
const getWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .populate('invitedMembers', 'name email');

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check access using the model method
    if (!workspace.canView(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const workspaceObj = workspace.toObject();
    res.json({
      ...workspaceObj,
      permissions: {
        canEdit: workspace.canEdit(req.user._id, req.user.role),
        canDelete: workspace.canDelete(req.user._id, req.user.role),
        canView: workspace.canView(req.user._id),
        canEditContent: workspace.canEditContent(req.user._id, req.user.role)
      }
    });
  } catch (error) {
    console.error('Error fetching workspace:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create workspace
// @route   POST /api/workspaces
// @access  Private
const createWorkspace = async (req, res) => {
  try {
    const { name, type, invitedMembers } = req.body;

    // Only admins or developers can create announcements workspace
    if (type === 'announcements' && req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Only admins or developers can create announcements workspace' });
    }

    const workspace = await Workspace.create({
      name,
      type: type || 'personal',
      owner: type === 'personal' ? req.user._id : undefined,
      members: type === 'personal' ? [{ user: req.user._id, permission: 'edit' }] : [],
      invitedMembers: invitedMembers || []
    });

    // Create associated canvas
    await Canvas.create({
      workspace: workspace._id,
      metadata: {
        lastEditedBy: req.user._id
      }
    });

    // Populate the workspace before sending response
    const populatedWorkspace = await Workspace.findById(workspace._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .populate('invitedMembers', 'name email');

    // Log workspace creation
    await logActivity({
      level: 'info',
      message: `Workspace created: "${workspace.name}"`,
      module: 'workspaceController',
      user: req.user._id,
      metadata: {
        workspace: `${workspace.name} | ${workspace._id}`,
        workspaceType: workspace.type,
        invitedMembersCount: workspace.invitedMembers?.length || 0
      },
      req
    });

    res.status(201).json(populatedWorkspace);
  } catch (error) {
    console.error('Error creating workspace:', error);
    // Log error
    await logActivity({
      level: 'error',
      message: `Failed to create workspace: "${req.body.name}"`,
      module: 'workspaceController',
      user: req.user._id,
      metadata: { error: error.message },
      req
    });
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update workspace
// @route   PUT /api/workspaces/:id
// @access  Private
const updateWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check permission using model method
    if (!workspace.canEdit(req.user._id, req.user.role)) {
      return res.status(403).json({ message: 'Not authorized to edit this workspace' });
    }

    const updatedWorkspace = await Workspace.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    .populate('owner', 'name email')
    .populate('members.user', 'name email')
    .populate('invitedMembers', 'name email');

    // Add permissions to the response
    const workspaceObj = updatedWorkspace.toObject();
    res.json({
      ...workspaceObj,
      permissions: {
        canEdit: updatedWorkspace.canEdit(req.user._id, req.user.role),
        canDelete: updatedWorkspace.canDelete(req.user._id, req.user.role),
        canView: updatedWorkspace.canView(req.user._id),
        canEditContent: updatedWorkspace.canEditContent(req.user._id, req.user.role)
      }
    });
  } catch (error) {
    console.error('Error updating workspace:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete workspace
// @route   DELETE /api/workspaces/:id
// @access  Private
const deleteWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check permission using model method
    if (!workspace.canDelete(req.user._id, req.user.role)) {
      return res.status(403).json({ message: 'Not authorized to delete this workspace' });
    }

    // Delete associated canvas and elements
    const canvas = await Canvas.findOne({ workspace: workspace._id });
    if (canvas) {
      const CanvasElement = require('../models/CanvasElement');
      await CanvasElement.deleteMany({ canvas: canvas._id });
      await Canvas.findByIdAndDelete(canvas._id);
    }

    await Workspace.findByIdAndDelete(req.params.id);

    // Count elements before deletion
    const elementsCount = canvas ? await require('../models/CanvasElement').countDocuments({ canvas: canvas._id }) : 0;

    // Log workspace deletion
    await logActivity({
      level: 'warn',
      message: `Workspace deleted: "${workspace.name}"`,
      module: 'workspaceController',
      user: req.user._id,
      metadata: {
        workspace: `${workspace.name} | ${workspace._id}`,
        workspaceType: workspace.type,
        hadCanvas: !!canvas,
        deletedElementsCount: elementsCount
      },
      req
    });

    res.json({ message: 'Workspace deleted' });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    // Log error
    await logActivity({
      level: 'error',
      message: 'Failed to delete workspace',
      module: 'workspaceController',
      user: req.user._id,
      metadata: { error: error.message },
      req
    });
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Accept workspace invite
// @route   POST /api/workspaces/:id/accept-invite
// @access  Private
const acceptInvite = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check if user is in invitedMembers
    const userIdStr = req.user._id.toString();
    const isInvited = workspace.invitedMembers?.some(
      m => m.toString() === userIdStr
    );

    if (!isInvited) {
      return res.status(403).json({ message: 'You are not invited to this workspace' });
    }

    // Move user from invitedMembers to members
    workspace.invitedMembers = workspace.invitedMembers.filter(
      m => m.toString() !== userIdStr
    );

    // Check if user is already a member
    const isMember = workspace.members.some(m => {
      const memberId = m.user ? m.user.toString() : m.toString();
      return memberId === userIdStr;
    });

    if (!isMember) {
      workspace.members.push({ user: req.user._id, permission: 'edit' });
    }

    await workspace.save();

    const populatedWorkspace = await Workspace.findById(workspace._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .populate('invitedMembers', 'name email');

    const workspaceObj = populatedWorkspace.toObject();
    res.json({
      ...workspaceObj,
      permissions: {
        canEdit: populatedWorkspace.canEdit(req.user._id, req.user.role),
        canDelete: populatedWorkspace.canDelete(req.user._id, req.user.role),
        canView: populatedWorkspace.canView(req.user._id),
        canEditContent: populatedWorkspace.canEditContent(req.user._id, req.user.role)
      }
    });
  } catch (error) {
    console.error('Error accepting invite:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Reject workspace invite
// @route   POST /api/workspaces/:id/reject-invite
// @access  Private
const rejectInvite = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check if user is in invitedMembers
    const userIdStr = req.user._id.toString();
    const isInvited = workspace.invitedMembers?.some(
      m => m.toString() === userIdStr
    );

    if (!isInvited) {
      return res.status(403).json({ message: 'You are not invited to this workspace' });
    }

    // Remove user from invitedMembers
    workspace.invitedMembers = workspace.invitedMembers.filter(
      m => m.toString() !== userIdStr
    );

    await workspace.save();

    res.json({ message: 'Invite rejected successfully' });
  } catch (error) {
    console.error('Error rejecting invite:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get pending invites for current user
// @route   GET /api/workspaces/pending-invites
// @access  Private
const getPendingInvites = async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      invitedMembers: req.user._id
    })
    .populate('owner', 'name email')
    .populate('members.user', 'name email')
    .populate('invitedMembers', 'name email')
    .sort({ createdAt: -1 });

    res.json(workspaces);
  } catch (error) {
    console.error('Error fetching pending invites:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update member permission in workspace
// @route   PUT /api/workspaces/:id/members/:userId/permission
// @access  Private (Owner only)
const updateMemberPermission = async (req, res) => {
  try {
    const { id: workspaceId, userId } = req.params;
    const { permission } = req.body;

    if (!['edit', 'view'].includes(permission)) {
      return res.status(400).json({ message: 'Invalid permission type' });
    }

    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Only workspace owner can update member permissions (not applicable to announcements)
    const ownerId = workspace.owner?.toString();
    const currentUserId = req.user._id.toString();

    if (workspace.type === 'announcements') {
      return res.status(403).json({ message: 'Cannot modify announcements workspace members' });
    }

    if (ownerId !== currentUserId) {
      return res.status(403).json({ message: 'Only workspace owner can update member permissions' });
    }

    // Find and update the member's permission
    const memberIndex = workspace.members.findIndex(m => {
      const memberId = m.user ? m.user.toString() : m.toString();
      return memberId === userId;
    });

    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Member not found in workspace' });
    }

    workspace.members[memberIndex].permission = permission;
    await workspace.save();

    const populatedWorkspace = await Workspace.findById(workspace._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .populate('invitedMembers', 'name email');

    // Add permissions to the response
    const workspaceObj = populatedWorkspace.toObject();
    res.json({
      ...workspaceObj,
      permissions: {
        canEdit: populatedWorkspace.canEdit(req.user._id, req.user.role),
        canDelete: populatedWorkspace.canDelete(req.user._id, req.user.role),
        canView: populatedWorkspace.canView(req.user._id),
        canEditContent: populatedWorkspace.canEditContent(req.user._id, req.user.role)
      }
    });
  } catch (error) {
    console.error('Error updating member permission:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Cancel workspace invite
// @route   DELETE /api/workspaces/:id/invites/:userId
// @access  Private (Owner only)
const cancelInvite = async (req, res) => {
  try {
    const { id: workspaceId, userId } = req.params;

    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Only workspace owner can cancel invites (not applicable to announcements)
    const ownerId = workspace.owner?.toString();
    const currentUserId = req.user._id.toString();

    if (workspace.type === 'announcements') {
      return res.status(403).json({ message: 'Cannot modify announcements workspace invites' });
    }

    if (ownerId !== currentUserId) {
      return res.status(403).json({ message: 'Only workspace owner can cancel invites' });
    }

    // Check if user is actually invited
    const isInvited = workspace.invitedMembers.some(m => m.toString() === userId);

    if (!isInvited) {
      return res.status(404).json({ message: 'User is not invited to this workspace' });
    }

    // Remove user from invitedMembers
    workspace.invitedMembers = workspace.invitedMembers.filter(
      m => m.toString() !== userId
    );

    await workspace.save();

    const populatedWorkspace = await Workspace.findById(workspace._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .populate('invitedMembers', 'name email');

    // Add permissions to the response
    const workspaceObj = populatedWorkspace.toObject();
    res.json({
      ...workspaceObj,
      permissions: {
        canEdit: populatedWorkspace.canEdit(req.user._id, req.user.role),
        canDelete: populatedWorkspace.canDelete(req.user._id, req.user.role),
        canView: populatedWorkspace.canView(req.user._id),
        canEditContent: populatedWorkspace.canEditContent(req.user._id, req.user.role)
      }
    });
  } catch (error) {
    console.error('Error canceling invite:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
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
};
