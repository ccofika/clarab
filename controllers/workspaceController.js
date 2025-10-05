const Workspace = require('../models/Workspace');
const Canvas = require('../models/Canvas');

// @desc    Get all workspaces for user
// @route   GET /api/workspaces
// @access  Private
const getWorkspaces = async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      $or: [
        { owner: req.user._id },
        { type: 'announcements' },
        { members: req.user._id },
        { invitedMembers: req.user._id }
      ]
    })
    .populate('owner', 'name email')
    .populate('members', 'name email')
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
      .populate('members', 'name email')
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

    // Only admins can create announcements workspace
    if (type === 'announcements' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create announcements workspace' });
    }

    const workspace = await Workspace.create({
      name,
      type: type || 'personal',
      owner: type === 'personal' ? req.user._id : undefined,
      members: type === 'personal' ? [req.user._id] : [],
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
      .populate('members', 'name email')
      .populate('invitedMembers', 'name email');

    res.status(201).json(populatedWorkspace);
  } catch (error) {
    console.error('Error creating workspace:', error);
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
    .populate('members', 'name email')
    .populate('invitedMembers', 'name email');

    res.json(updatedWorkspace);
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

    res.json({ message: 'Workspace deleted' });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace
};
