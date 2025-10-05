const Canvas = require('../models/Canvas');
const CanvasElement = require('../models/CanvasElement');
const Workspace = require('../models/Workspace');

// @desc    Get canvas by workspace ID
// @route   GET /api/canvas/workspace/:workspaceId
// @access  Private
const getCanvasByWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.workspaceId);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check access
    const hasAccess = workspace.type === 'announcements' ||
                     workspace.owner?.toString() === req.user._id.toString() ||
                     workspace.members.some(m => m.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let canvas = await Canvas.findOne({ workspace: req.params.workspaceId });

    // Create canvas if it doesn't exist
    if (!canvas) {
      canvas = await Canvas.create({
        workspace: req.params.workspaceId,
        metadata: { lastEditedBy: req.user._id }
      });
    }

    res.json(canvas);
  } catch (error) {
    console.error('Error fetching canvas:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get canvas elements
// @route   GET /api/canvas/:canvasId/elements
// @access  Private
const getCanvasElements = async (req, res) => {
  try {
    const canvas = await Canvas.findById(req.params.canvasId).populate('workspace');

    if (!canvas) {
      return res.status(404).json({ message: 'Canvas not found' });
    }

    // Check access
    const workspace = canvas.workspace;
    const hasAccess = workspace.type === 'announcements' ||
                     workspace.owner?.toString() === req.user._id.toString() ||
                     workspace.members.some(m => m.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const elements = await CanvasElement.find({ canvas: req.params.canvasId })
      .sort({ 'position.z': 1 })
      .populate('createdBy', 'name email')
      .populate('lastEditedBy', 'name email');

    res.json(elements);
  } catch (error) {
    console.error('Error fetching canvas elements:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create canvas element
// @route   POST /api/canvas/:canvasId/elements
// @access  Private
const createCanvasElement = async (req, res) => {
  try {
    const canvas = await Canvas.findById(req.params.canvasId).populate('workspace');

    if (!canvas) {
      return res.status(404).json({ message: 'Canvas not found' });
    }

    // Check access
    const workspace = canvas.workspace;
    const hasAccess = workspace.type === 'announcements' ||
                     workspace.owner?.toString() === req.user._id.toString() ||
                     workspace.members.some(m => m.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const element = await CanvasElement.create({
      ...req.body,
      canvas: req.params.canvasId,
      createdBy: req.user._id,
      lastEditedBy: req.user._id
    });

    // Update canvas metadata
    canvas.metadata.lastEditedBy = req.user._id;
    await canvas.save();

    const populatedElement = await CanvasElement.findById(element._id)
      .populate('createdBy', 'name email')
      .populate('lastEditedBy', 'name email');

    res.status(201).json(populatedElement);
  } catch (error) {
    console.error('Error creating canvas element:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update canvas element
// @route   PUT /api/canvas/elements/:elementId
// @access  Private
const updateCanvasElement = async (req, res) => {
  try {
    const element = await CanvasElement.findById(req.params.elementId).populate({
      path: 'canvas',
      populate: { path: 'workspace' }
    });

    if (!element) {
      return res.status(404).json({ message: 'Element not found' });
    }

    // Check access
    const workspace = element.canvas.workspace;
    const hasAccess = workspace.type === 'announcements' ||
                     workspace.owner?.toString() === req.user._id.toString() ||
                     workspace.members.some(m => m.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update element
    const updatedElement = await CanvasElement.findByIdAndUpdate(
      req.params.elementId,
      { ...req.body, lastEditedBy: req.user._id },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email').populate('lastEditedBy', 'name email');

    // Update canvas metadata
    await Canvas.findByIdAndUpdate(element.canvas._id, {
      'metadata.lastEditedBy': req.user._id
    });

    res.json(updatedElement);
  } catch (error) {
    console.error('Error updating canvas element:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete canvas element
// @route   DELETE /api/canvas/elements/:elementId
// @access  Private
const deleteCanvasElement = async (req, res) => {
  try {
    const element = await CanvasElement.findById(req.params.elementId).populate({
      path: 'canvas',
      populate: { path: 'workspace' }
    });

    if (!element) {
      return res.status(404).json({ message: 'Element not found' });
    }

    // Check access
    const workspace = element.canvas.workspace;
    const hasAccess = workspace.type === 'announcements' ||
                     workspace.owner?.toString() === req.user._id.toString() ||
                     workspace.members.some(m => m.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await CanvasElement.findByIdAndDelete(req.params.elementId);

    res.json({ message: 'Element deleted' });
  } catch (error) {
    console.error('Error deleting canvas element:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update canvas view state
// @route   PUT /api/canvas/:canvasId/viewstate
// @access  Private
const updateCanvasViewState = async (req, res) => {
  try {
    const canvas = await Canvas.findById(req.params.canvasId).populate('workspace');

    if (!canvas) {
      return res.status(404).json({ message: 'Canvas not found' });
    }

    // Check access
    const workspace = canvas.workspace;
    const hasAccess = workspace.type === 'announcements' ||
                     workspace.owner?.toString() === req.user._id.toString() ||
                     workspace.members.some(m => m.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    canvas.viewState = req.body;
    await canvas.save();

    res.json(canvas);
  } catch (error) {
    console.error('Error updating canvas view state:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Search canvas elements
// @route   GET /api/canvas/search
// @access  Private
const searchCanvasElements = async (req, res) => {
  try {
    const { query, mode, workspaceId } = req.query;

    if (!query || query.trim().length === 0) {
      return res.json([]);
    }

    // Build search query
    const searchRegex = new RegExp(query.trim(), 'i');

    let canvasIds = [];

    if (mode === 'local' && workspaceId) {
      // Search only in current workspace
      const canvas = await Canvas.findOne({ workspace: workspaceId });
      if (canvas) {
        canvasIds = [canvas._id];
      }
    } else {
      // Global search - find all canvases user has access to
      const workspaces = await Workspace.find({
        $or: [
          { type: 'announcements' },
          { owner: req.user._id },
          { members: req.user._id },
          { invitedMembers: req.user._id }
        ]
      });

      const canvases = await Canvas.find({
        workspace: { $in: workspaces.map(w => w._id) }
      }).populate('workspace', 'name');

      canvasIds = canvases.map(c => c._id);
    }

    if (canvasIds.length === 0) {
      return res.json([]);
    }

    // Search elements across multiple fields
    const elements = await CanvasElement.find({
      canvas: { $in: canvasIds },
      $or: [
        { 'content.value': searchRegex },
        { 'content.title': searchRegex },
        { 'content.description': searchRegex },
        { 'content.text': searchRegex },
        { 'content.examples.title': searchRegex },
        { 'content.examples.messages.text': searchRegex }
      ]
    })
    .populate({
      path: 'canvas',
      populate: { path: 'workspace', select: 'name' }
    })
    .limit(50)
    .lean();

    // Format results with workspace information
    const results = elements.map(element => ({
      ...element,
      workspaceId: element.canvas.workspace._id,
      workspaceName: element.canvas.workspace.name,
      canvasId: element.canvas._id
    }));

    res.json(results);
  } catch (error) {
    console.error('Error searching canvas elements:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getCanvasByWorkspace,
  getCanvasElements,
  createCanvasElement,
  updateCanvasElement,
  deleteCanvasElement,
  updateCanvasViewState,
  searchCanvasElements
};
