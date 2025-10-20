const Canvas = require('../models/Canvas');
const CanvasElement = require('../models/CanvasElement');
const Workspace = require('../models/Workspace');
const { logActivity } = require('../utils/activityLogger');

// Helper function to get readable element name
const getElementName = (element) => {
  const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
  };

  let name = '';
  switch (element.type) {
    case 'title':
    case 'description':
      name = stripHtml(element.content?.value || '').substring(0, 50);
      break;
    case 'macro':
      name = stripHtml(element.content?.title || '').substring(0, 50);
      break;
    case 'example':
      const currentExample = element.content?.examples?.[element.content?.currentExampleIndex || 0];
      name = stripHtml(currentExample?.title || '').substring(0, 50);
      break;
    case 'text':
    case 'subtext':
      name = stripHtml(element.content?.text || '').substring(0, 50);
      break;
    case 'card':
      name = stripHtml(element.content?.title || element.content?.text || '').substring(0, 50);
      break;
    case 'sticky-note':
      name = stripHtml(element.content?.text || '').substring(0, 30);
      break;
    case 'image':
      name = 'Image';
      break;
    case 'link':
      name = element.content?.url || 'Link';
      break;
    default:
      name = element.type;
  }

  return name || `${element.type} element`;
};

// @desc    Get canvas by workspace ID
// @route   GET /api/canvas/workspace/:workspaceId
// @access  Private
const getCanvasByWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.workspaceId);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check access using the workspace model's canView method
    if (!workspace.canView(req.user._id)) {
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

    // Check access using the workspace model's canView method
    const workspace = canvas.workspace;
    if (!workspace.canView(req.user._id)) {
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

    // Check if user can edit content in this workspace
    const workspace = canvas.workspace;
    if (!workspace.canEditContent(req.user._id, req.user.role)) {
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

    // Log element creation
    const elementName = getElementName(element);
    await logActivity({
      level: 'info',
      message: `Canvas element created: "${elementName}"`,
      module: 'canvasController',
      user: req.user._id,
      metadata: {
        element: `${elementName} | ${element._id}`,
        elementType: element.type,
        workspace: `${workspace.name} | ${workspace._id}`
      },
      req
    });

    res.status(201).json(populatedElement);
  } catch (error) {
    console.error('Error creating canvas element:', error);
    // Log error
    await logActivity({
      level: 'error',
      message: 'Failed to create canvas element',
      module: 'canvasController',
      user: req.user?._id,
      metadata: { error: error.message, elementType: req.body?.type },
      req
    });
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

    // Check if user can edit content in this workspace
    const workspace = element.canvas.workspace;
    if (!workspace.canEditContent(req.user._id, req.user.role)) {
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

    // Check if user can edit content in this workspace
    const workspace = element.canvas.workspace;
    if (!workspace.canEditContent(req.user._id, req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get element name before deletion
    const elementName = getElementName(element);

    await CanvasElement.findByIdAndDelete(req.params.elementId);

    // Log element deletion
    await logActivity({
      level: 'warn',
      message: `Canvas element deleted: "${elementName}"`,
      module: 'canvasController',
      user: req.user._id,
      metadata: {
        element: `${elementName} | ${req.params.elementId}`,
        elementType: element.type,
        workspace: `${workspace.name} | ${workspace._id}`
      },
      req
    });

    res.json({ message: 'Element deleted' });
  } catch (error) {
    console.error('Error deleting canvas element:', error);
    // Log error
    await logActivity({
      level: 'error',
      message: 'Failed to delete canvas element',
      module: 'canvasController',
      user: req.user?._id,
      metadata: { error: error.message },
      req
    });
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

    // Check access using the workspace model's canView method
    const workspace = canvas.workspace;
    if (!workspace.canView(req.user._id)) {
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
    const { query, mode, workspaceId, elementType, dateFrom, dateTo } = req.query;

    // Build search query
    const searchRegex = query && query.trim().length > 0 ? new RegExp(query.trim(), 'i') : null;

    let canvasIds = [];
    let allowedWorkspaceIds = new Set();

    if (mode === 'local' && workspaceId) {
      // Search only in current workspace - verify user has access
      const workspace = await Workspace.findById(workspaceId);

      if (!workspace || !workspace.canView(req.user._id)) {
        return res.json([]);
      }

      const canvas = await Canvas.findOne({ workspace: workspaceId });
      if (canvas) {
        canvasIds = [canvas._id];
        allowedWorkspaceIds.add(workspaceId.toString());
      }
    } else if (workspaceId) {
      // Filter by specific workspace (for element linking)
      const workspace = await Workspace.findById(workspaceId);

      if (!workspace || !workspace.canView(req.user._id)) {
        return res.json([]);
      }

      const canvas = await Canvas.findOne({ workspace: workspaceId });
      if (canvas) {
        canvasIds = [canvas._id];
        allowedWorkspaceIds.add(workspaceId.toString());
      }
    } else {
      // Global search - find all workspaces user has access to
      const workspaces = await Workspace.find({
        $or: [
          { type: 'announcements' },
          { owner: req.user._id },
          { members: req.user._id },
          { invitedMembers: req.user._id }
        ]
      });

      // Double-check access using canView method and store allowed workspace IDs
      const accessibleWorkspaces = workspaces.filter(workspace =>
        workspace.canView(req.user._id)
      );

      if (accessibleWorkspaces.length === 0) {
        return res.json([]);
      }

      // Store allowed workspace IDs for final validation
      accessibleWorkspaces.forEach(workspace => {
        allowedWorkspaceIds.add(workspace._id.toString());
      });

      const canvases = await Canvas.find({
        workspace: { $in: accessibleWorkspaces.map(w => w._id) }
      }).populate('workspace', 'name owner members invitedMembers isPublic type');

      canvasIds = canvases.map(c => c._id);
    }

    if (canvasIds.length === 0) {
      return res.json([]);
    }

    // Build element search filters
    const elementFilters = {
      canvas: { $in: canvasIds }
    };

    // Add text search if query provided
    if (searchRegex) {
      elementFilters.$or = [
        { 'content.value': searchRegex },
        { 'content.title': searchRegex },
        { 'content.description': searchRegex },
        { 'content.text': searchRegex },
        { 'content.examples.title': searchRegex },
        { 'content.examples.messages.text': searchRegex }
      ];
    }

    // Add element type filter
    if (elementType) {
      elementFilters.type = elementType;
    }

    // Add date range filter
    if (dateFrom || dateTo) {
      elementFilters.createdAt = {};
      if (dateFrom) {
        elementFilters.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Add one day to dateTo to include the entire day
        const dateToEnd = new Date(dateTo);
        dateToEnd.setHours(23, 59, 59, 999);
        elementFilters.createdAt.$lte = dateToEnd;
      }
    }

    // Search elements with filters
    const elements = await CanvasElement.find(elementFilters)
    .populate({
      path: 'canvas',
      populate: { path: 'workspace', select: 'name owner members invitedMembers isPublic type' }
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

    // Format results with workspace information and apply final security filter
    const results = elements
      .map(element => ({
        ...element,
        workspaceId: element.canvas.workspace._id,
        workspaceName: element.canvas.workspace.name,
        canvasId: element.canvas._id
      }))
      .filter(element => {
        // Final security check: ensure the workspace is in our allowed list
        const workspaceIdStr = element.workspaceId.toString();
        return allowedWorkspaceIds.has(workspaceIdStr);
      });

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
