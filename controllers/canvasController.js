const Canvas = require('../models/Canvas');
const CanvasElement = require('../models/CanvasElement');
const Workspace = require('../models/Workspace');
const User = require('../models/User');
const AIChatSession = require('../models/AIChatSession');
const { logActivity } = require('../utils/activityLogger');
const {
  generateElementEmbedding,
  generateEmbedding,
  cosineSimilarity,
  parseNaturalLanguageQuery,
  aiSearchAssistant
} = require('../utils/openai');

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

    // Generate AI embedding in background (don't await to avoid blocking response)
    // Fetch all canvas elements for context
    CanvasElement.find({ canvas: req.params.canvasId })
      .then(allElements => {
        return generateElementEmbedding(element, allElements);
      })
      .then(embedding => {
        if (embedding) {
          element.embedding = embedding;
          element.embeddingOutdated = false;
          return element.save();
        }
      })
      .catch(err => console.error('Error generating embedding:', err));

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
      { ...req.body, lastEditedBy: req.user._id, embeddingOutdated: true },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email').populate('lastEditedBy', 'name email');

    // Generate new AI embedding in background (content changed)
    // Fetch all canvas elements for context
    CanvasElement.find({ canvas: element.canvas._id })
      .then(allElements => {
        return generateElementEmbedding(updatedElement, allElements);
      })
      .then(embedding => {
        if (embedding) {
          updatedElement.embedding = embedding;
          updatedElement.embeddingOutdated = false;
          return updatedElement.save();
        }
      })
      .catch(err => console.error('Error generating embedding:', err));

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
    const elementId = req.params.elementId;
    const elementType = element.type;
    const canvasId = element.canvas._id;
    const workspaceId = workspace._id;

    await CanvasElement.findByIdAndDelete(elementId);

    // If deleted element is a title, update users who had it as lastAccessedElement
    if (elementType === 'title') {
      try {
        // Find all users who had this title as their lastAccessedElement
        const users = await User.find({
          [`workspacePreferences.${workspaceId}.lastAccessedElement`]: elementId
        });

        if (users.length > 0) {
          // Get all remaining title elements in this canvas, sorted by createdAt DESC
          const remainingTitles = await CanvasElement.find({
            canvas: canvasId,
            type: 'title',
            _id: { $ne: elementId } // Exclude the deleted one
          }).sort({ createdAt: -1 });

          // For each affected user, set their lastAccessedElement to the newest remaining title
          for (const user of users) {
            if (remainingTitles.length > 0) {
              // Set to the newest remaining title
              const existingPrefs = user.workspacePreferences.get(workspaceId.toString()) || {};
              user.workspacePreferences.set(workspaceId.toString(), {
                ...existingPrefs,
                lastAccessedElement: remainingTitles[0]._id,
                lastAccessedAt: new Date()
              });
            } else {
              // No more titles - clear lastAccessedElement
              const existingPrefs = user.workspacePreferences.get(workspaceId.toString()) || {};
              user.workspacePreferences.set(workspaceId.toString(), {
                ...existingPrefs,
                lastAccessedElement: null,
                lastAccessedAt: new Date()
              });
            }
            await user.save();
          }

          console.log(`Updated ${users.length} user(s) after deleting title element ${elementId}`);
        }
      } catch (fallbackError) {
        // Log the error but don't fail the deletion
        console.error('Error updating user lastAccessedElement after title deletion:', fallbackError);
        await logActivity({
          level: 'error',
          message: 'Failed to update user preferences after title deletion',
          module: 'canvasController',
          user: req.user._id,
          metadata: {
            error: fallbackError.message,
            deletedElement: elementId,
            workspace: workspaceId
          },
          req
        });
      }
    }

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
    const { query, mode, workspaceId, elementTypes, workspaceIds, dateFrom, dateTo } = req.query;

    // Parse array parameters (elementTypes, workspaceIds)
    const elementTypesArray = elementTypes ? (Array.isArray(elementTypes) ? elementTypes : [elementTypes]) : [];
    const workspaceIdsArray = workspaceIds ? (Array.isArray(workspaceIds) ? workspaceIds : [workspaceIds]) : [];

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
      let workspaceQuery = {
        $or: [
          { type: 'announcements' },
          { owner: req.user._id },
          { members: req.user._id },
          { invitedMembers: req.user._id }
        ]
      };

      // If specific workspaces are requested via filter, add that constraint
      if (workspaceIdsArray.length > 0) {
        workspaceQuery = {
          _id: { $in: workspaceIdsArray },
          ...workspaceQuery
        };
      }

      const workspaces = await Workspace.find(workspaceQuery);

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

    // Add element type filter (supports multiple types)
    if (elementTypesArray.length > 0) {
      elementFilters.type = { $in: elementTypesArray };
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

// @desc    Generate embedding for a single element
// @route   POST /api/canvas/elements/:elementId/generate-embedding
// @access  Private
const generateElementEmbeddingEndpoint = async (req, res) => {
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
    if (!workspace.canView(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Generate embedding
    const embedding = await generateElementEmbedding(element);

    if (embedding) {
      element.embedding = embedding;
      element.embeddingOutdated = false;
      await element.save();
      return res.json({ message: 'Embedding generated successfully', hasEmbedding: true });
    } else {
      return res.json({ message: 'No content to embed', hasEmbedding: false });
    }
  } catch (error) {
    console.error('Error generating embedding:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Generate embeddings for all elements (migration)
// @route   POST /api/canvas/generate-all-embeddings
// @access  Private (admin only or workspace owner)
const generateAllEmbeddings = async (req, res) => {
  try {
    const { workspaceId, force } = req.body;

    let query = {};

    if (workspaceId) {
      // Generate for specific workspace
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace || !workspace.canEdit(req.user._id)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const canvas = await Canvas.findOne({ workspace: workspaceId });
      if (canvas) {
        query.canvas = canvas._id;
      }
    } else {
      // Generate for all accessible workspaces
      const workspaces = await Workspace.find({
        $or: [
          { owner: req.user._id },
          { members: req.user._id }
        ]
      });

      const canvases = await Canvas.find({
        workspace: { $in: workspaces.map(w => w._id) }
      });

      query.canvas = { $in: canvases.map(c => c._id) };
    }

    // Only process elements without embeddings or outdated (unless force=true)
    if (!force) {
      query.$or = [
        { embedding: null },
        { embedding: { $exists: false } },
        { embeddingOutdated: true }
      ];
    }

    const elements = await CanvasElement.find(query);

    let processed = 0;
    let errors = 0;

    // Process in batches to avoid rate limits
    const batchSize = 20;
    for (let i = 0; i < elements.length; i += batchSize) {
      const batch = elements.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (element) => {
          try {
            const embedding = await generateElementEmbedding(element);
            if (embedding) {
              element.embedding = embedding;
              element.embeddingOutdated = false;
              await element.save();
              processed++;
            }
          } catch (error) {
            console.error(`Error processing element ${element._id}:`, error);
            errors++;
          }
        })
      );

      // Small delay between batches to respect rate limits
      if (i + batchSize < elements.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    res.json({
      message: 'Embedding generation complete',
      total: elements.length,
      processed,
      errors
    });
  } catch (error) {
    console.error('Error generating embeddings:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    AI-powered semantic search
// @route   GET /api/canvas/ai-search
// @access  Private
const aiSemanticSearch = async (req, res) => {
  try {
    const { query, mode, workspaceId, elementTypes, workspaceIds, limit = 50 } = req.query;

    if (!query || query.trim().length === 0) {
      return res.json([]);
    }

    // Parse array parameters
    const elementTypesArray = elementTypes ? (Array.isArray(elementTypes) ? elementTypes : [elementTypes]) : [];
    const workspaceIdsArray = workspaceIds ? (Array.isArray(workspaceIds) ? workspaceIds : [workspaceIds]) : [];

    // Generate embedding for search query
    const queryEmbedding = await generateEmbedding(query);

    if (!queryEmbedding) {
      return res.status(400).json({ message: 'Could not generate query embedding' });
    }

    // Find accessible workspaces
    let canvasIds = [];
    let workspaceMap = new Map();

    if (mode === 'local' && workspaceId) {
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace || !workspace.canView(req.user._id)) {
        return res.json([]);
      }
      const canvas = await Canvas.findOne({ workspace: workspaceId });
      if (canvas) {
        canvasIds = [canvas._id];
        workspaceMap.set(workspaceId.toString(), workspace.name);
      }
    } else {
      let workspaceQuery = {
        $or: [
          { type: 'announcements' },
          { owner: req.user._id },
          { members: req.user._id },
          { invitedMembers: req.user._id }
        ]
      };

      if (workspaceIdsArray.length > 0) {
        workspaceQuery = {
          _id: { $in: workspaceIdsArray },
          ...workspaceQuery
        };
      }

      const workspaces = await Workspace.find(workspaceQuery);
      const accessibleWorkspaces = workspaces.filter(w => w.canView(req.user._id));

      if (accessibleWorkspaces.length === 0) {
        return res.json([]);
      }

      accessibleWorkspaces.forEach(w => {
        workspaceMap.set(w._id.toString(), w.name);
      });

      const canvases = await Canvas.find({
        workspace: { $in: accessibleWorkspaces.map(w => w._id) }
      });

      canvasIds = canvases.map(c => c._id);
    }

    if (canvasIds.length === 0) {
      return res.json([]);
    }

    // Build query
    const elementQuery = {
      canvas: { $in: canvasIds },
      embedding: { $exists: true, $ne: null }
    };

    // Add element type filter
    if (elementTypesArray.length > 0) {
      elementQuery.type = { $in: elementTypesArray };
    }

    // Fetch all elements with embeddings
    const elements = await CanvasElement.find(elementQuery)
      .populate({
        path: 'canvas',
        select: 'workspace',
        populate: { path: 'workspace', select: 'name' }
      })
      .lean();

    // Calculate similarity scores
    const results = elements.map(element => {
      const similarity = cosineSimilarity(queryEmbedding, element.embedding);
      return {
        ...element,
        relevanceScore: Math.round(similarity * 100),
        workspaceName: workspaceMap.get(element.canvas.workspace._id.toString()) || 'Unknown',
        workspaceId: element.canvas.workspace._id
      };
    });

    // Sort by relevance and apply limit
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Filter results with relevance > 50% for better quality
    const filteredResults = results.filter(r => r.relevanceScore > 50).slice(0, parseInt(limit));

    res.json(filteredResults);
  } catch (error) {
    console.error('AI search error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Parse natural language query
// @route   POST /api/canvas/parse-query
// @access  Private
const parseQuery = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ message: 'Query is required' });
    }

    const parsed = await parseNaturalLanguageQuery(query);
    res.json(parsed);
  } catch (error) {
    console.error('Error parsing query:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    AI Search Assistant chat
// @route   POST /api/canvas/ai-assistant
// @access  Private
const aiAssistant = async (req, res) => {
  try {
    const { message, conversationHistory, context } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Parse user message to extract search query
    const parsed = await parseNaturalLanguageQuery(message);

    let searchResults = [];

    // If AI extracted a search query, perform semantic search
    if (parsed.refinedQuery && parsed.refinedQuery.trim().length > 0) {
      // Find accessible workspaces
      let workspaceQuery = {
        $or: [
          { type: 'announcements' },
          { owner: req.user._id },
          { members: req.user._id },
          { invitedMembers: req.user._id }
        ]
      };

      const workspaces = await Workspace.find(workspaceQuery);
      const accessibleWorkspaces = workspaces.filter(w => w.canView(req.user._id));

      if (accessibleWorkspaces.length > 0) {
        const workspaceMap = new Map();
        accessibleWorkspaces.forEach(w => {
          workspaceMap.set(w._id.toString(), w.name);
        });

        const canvases = await Canvas.find({
          workspace: { $in: accessibleWorkspaces.map(w => w._id) }
        });

        const canvasIds = canvases.map(c => c._id);

        if (canvasIds.length > 0) {
          // Perform semantic search
          const queryEmbedding = await generateEmbedding(parsed.refinedQuery);

          if (queryEmbedding) {
            const elementQuery = {
              canvas: { $in: canvasIds },
              embedding: { $exists: true, $ne: null }
            };

            // Apply filters from NLP parsing
            if (parsed.filters?.elementTypes && parsed.filters.elementTypes.length > 0) {
              elementQuery.type = { $in: parsed.filters.elementTypes };
            }

            const elements = await CanvasElement.find(elementQuery)
              .populate({
                path: 'canvas',
                select: 'workspace',
                populate: { path: 'workspace', select: 'name' }
              })
              .lean();

            // Calculate similarity and sort
            searchResults = elements.map(element => {
              const similarity = cosineSimilarity(queryEmbedding, element.embedding);
              return {
                ...element,
                relevanceScore: Math.round(similarity * 100),
                workspaceName: workspaceMap.get(element.canvas.workspace._id.toString()) || 'Unknown',
                workspaceId: element.canvas.workspace._id
              };
            })
            .filter(r => r.relevanceScore > 50)
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 5); // Top 5 results for AI assistant
          }
        }
      }
    }

    // Get AI response with search context
    const aiResponse = await aiSearchAssistant(
      message,
      conversationHistory || [],
      {
        ...context,
        resultsCount: searchResults.length,
        foundResults: searchResults.length > 0
      }
    );

    // Return AI message + search results
    res.json({
      message: aiResponse.message,
      suggestedQuery: aiResponse.suggestedQuery,
      suggestedFilters: aiResponse.suggestedFilters,
      searchResults: searchResults, // Include actual search results!
      parsedIntent: parsed.intent
    });
  } catch (error) {
    console.error('Error in AI assistant:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== AI CHAT SESSION ENDPOINTS =====

/**
 * Create new AI chat session
 */
const createChatSession = async (req, res) => {
  try {
    const { title } = req.body;

    const chatSession = new AIChatSession({
      user: req.user.id,
      title: title || 'New Chat',
      messages: [{
        role: 'assistant',
        content: "Hi! I'm your AI search assistant. I can help you find anything in your workspaces. What are you looking for?",
        searchResults: []
      }]
    });

    await chatSession.save();
    res.status(201).json(chatSession);
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get all chat sessions for user
 */
const getChatSessions = async (req, res) => {
  try {
    const chatSessions = await AIChatSession.find({ user: req.user.id })
      .sort({ lastMessageAt: -1 })
      .select('title messages lastMessageAt createdAt');

    res.json(chatSessions);
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get single chat session
 */
const getChatSession = async (req, res) => {
  try {
    const chatSession = await AIChatSession.findOne({
      _id: req.params.sessionId,
      user: req.user.id
    });

    if (!chatSession) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    res.json(chatSession);
  } catch (error) {
    console.error('Error fetching chat session:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Add message to chat session
 */
const addMessageToSession = async (req, res) => {
  try {
    const { message, searchResults } = req.body;

    const chatSession = await AIChatSession.findOne({
      _id: req.params.sessionId,
      user: req.user.id
    });

    if (!chatSession) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    chatSession.messages.push({
      role: message.role,
      content: message.content,
      searchResults: searchResults || []
    });

    // Auto-generate title from first user message if still "New Chat"
    if (chatSession.title === 'New Chat' && message.role === 'user') {
      chatSession.title = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
    }

    await chatSession.save();
    res.json(chatSession);
  } catch (error) {
    console.error('Error adding message to session:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Delete chat session
 */
const deleteChatSession = async (req, res) => {
  try {
    const chatSession = await AIChatSession.findOneAndDelete({
      _id: req.params.sessionId,
      user: req.user.id
    });

    if (!chatSession) {
      return res.status(404).json({ message: 'Chat session not found' });
    }

    res.json({ message: 'Chat session deleted' });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all elements by workspace ID
// @route   GET /api/canvas/workspace/:workspaceId/elements
// @access  Private
const getElementsByWorkspace = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.workspaceId);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check access using the workspace model's canView method
    if (!workspace.canView(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Find or create canvas for this workspace
    let canvas = await Canvas.findOne({ workspace: req.params.workspaceId });

    if (!canvas) {
      // Return empty array if no canvas exists yet
      return res.json([]);
    }

    // Get all elements for this canvas
    const elements = await CanvasElement.find({ canvas: canvas._id })
      .sort({ 'position.z': 1 })
      .populate('createdBy', 'name email')
      .populate('lastEditedBy', 'name email')
      .lean();

    // Transform elements to include necessary data for AddContentModal
    const transformedElements = elements.map(element => ({
      _id: element._id,
      type: element.type,
      content: element.content,
      position: element.position,
      style: element.style,
      createdBy: element.createdBy,
      lastEditedBy: element.lastEditedBy,
      createdAt: element.createdAt,
      updatedAt: element.updatedAt,
      workspaceId: req.params.workspaceId,
      workspaceName: workspace.name,
      // Add convenient fields for display
      title: (() => {
        switch (element.type) {
          case 'title':
          case 'description':
            return element.content?.value || 'Untitled';
          case 'macro':
            return element.content?.title || 'Untitled Macro';
          case 'example':
            const currentExample = element.content?.examples?.[element.content?.currentExampleIndex || 0];
            return currentExample?.title || 'Untitled Example';
          default:
            return `${element.type} element`;
        }
      })(),
      description: element.type === 'description' ? element.content?.value :
                   element.type === 'macro' ? element.content?.description : '',
      macro: element.type === 'macro' ? element.content?.description : '',
      example: element.type === 'example' ? {
        title: element.content?.examples?.[element.content?.currentExampleIndex || 0]?.title,
        messages: element.content?.examples?.[element.content?.currentExampleIndex || 0]?.messages || []
      } : null,
      thumbnailUrl: element.content?.thumbnailUrl || null
    }));

    res.json(transformedElements);
  } catch (error) {
    console.error('Error fetching workspace elements:', error);
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
  searchCanvasElements,
  generateElementEmbeddingEndpoint,
  generateAllEmbeddings,
  aiSemanticSearch,
  parseQuery,
  aiAssistant,
  createChatSession,
  getChatSessions,
  getChatSession,
  addMessageToSession,
  deleteChatSession,
  getElementsByWorkspace
};
