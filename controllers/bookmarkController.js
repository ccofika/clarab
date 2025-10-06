const Bookmark = require('../models/Bookmark');
const CanvasElement = require('../models/CanvasElement');
const Workspace = require('../models/Workspace');

// @desc    Get all bookmarks for current user
// @route   GET /api/bookmarks
// @access  Private
const getBookmarks = async (req, res) => {
  try {
    const bookmarks = await Bookmark.find({ user: req.user._id })
      .populate({
        path: 'element',
        select: '_id type content position dimensions'
      })
      .populate({
        path: 'workspace',
        select: '_id name type'
      })
      .sort({ createdAt: -1 });

    res.json(bookmarks);
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({ message: 'Failed to fetch bookmarks' });
  }
};

// Helper function to generate default bookmark name
const generateDefaultBookmarkName = (element) => {
  const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
  };

  switch (element.type) {
    case 'title':
      const titleText = stripHtml(element.content?.value || '');
      return titleText.substring(0, 50) || 'Untitled Title';

    case 'description':
      const descText = stripHtml(element.content?.value || '');
      const words = descText.split(' ').slice(0, 6).join(' ');
      return words || 'Untitled Description';

    case 'macro':
      const macroTitle = stripHtml(element.content?.title || '');
      return macroTitle.substring(0, 50) || 'Untitled Macro';

    case 'example':
      const currentExample = element.content?.examples?.[element.content?.currentExampleIndex || 0];
      const exampleTitle = stripHtml(currentExample?.title || '');
      return exampleTitle.substring(0, 50) || 'Untitled Example';

    default:
      return 'Untitled Bookmark';
  }
};

// @desc    Create a new bookmark
// @route   POST /api/bookmarks
// @access  Private
const createBookmark = async (req, res) => {
  try {
    const { elementId, customName } = req.body;

    if (!elementId) {
      return res.status(400).json({ message: 'Element ID is required' });
    }

    // Check if element exists
    const element = await CanvasElement.findById(elementId).populate('canvas');
    if (!element) {
      return res.status(404).json({ message: 'Element not found' });
    }

    // Get workspace from canvas
    const workspaceId = element.canvas.workspace;

    // Check if workspace exists and user has access
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (!workspace.canView(req.user._id)) {
      return res.status(403).json({ message: 'You do not have access to this workspace' });
    }

    // Check if bookmark already exists
    const existingBookmark = await Bookmark.findOne({
      user: req.user._id,
      element: elementId
    });

    if (existingBookmark) {
      return res.status(400).json({ message: 'Bookmark already exists' });
    }

    // Generate default name if not provided
    const bookmarkName = customName || generateDefaultBookmarkName(element);

    // Create bookmark
    const bookmark = await Bookmark.create({
      user: req.user._id,
      element: elementId,
      workspace: workspaceId,
      customName: bookmarkName
    });

    // Populate before sending response
    await bookmark.populate([
      {
        path: 'element',
        select: '_id type content position dimensions'
      },
      {
        path: 'workspace',
        select: '_id name type'
      }
    ]);

    res.status(201).json(bookmark);
  } catch (error) {
    console.error('Error creating bookmark:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Bookmark already exists' });
    }

    res.status(500).json({ message: 'Failed to create bookmark' });
  }
};

// @desc    Update bookmark name
// @route   PUT /api/bookmarks/:id
// @access  Private
const updateBookmark = async (req, res) => {
  try {
    const { customName } = req.body;

    if (!customName || customName.trim() === '') {
      return res.status(400).json({ message: 'Bookmark name is required' });
    }

    const bookmark = await Bookmark.findById(req.params.id);

    if (!bookmark) {
      return res.status(404).json({ message: 'Bookmark not found' });
    }

    // Check if bookmark belongs to user
    if (bookmark.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this bookmark' });
    }

    bookmark.customName = customName.trim();
    await bookmark.save();

    // Populate before sending response
    await bookmark.populate([
      {
        path: 'element',
        select: '_id type content position dimensions'
      },
      {
        path: 'workspace',
        select: '_id name type'
      }
    ]);

    res.json(bookmark);
  } catch (error) {
    console.error('Error updating bookmark:', error);
    res.status(500).json({ message: 'Failed to update bookmark' });
  }
};

// @desc    Delete bookmark
// @route   DELETE /api/bookmarks/:id
// @access  Private
const deleteBookmark = async (req, res) => {
  try {
    const bookmark = await Bookmark.findById(req.params.id);

    if (!bookmark) {
      return res.status(404).json({ message: 'Bookmark not found' });
    }

    // Check if bookmark belongs to user
    if (bookmark.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this bookmark' });
    }

    await bookmark.deleteOne();

    res.json({ message: 'Bookmark deleted successfully' });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    res.status(500).json({ message: 'Failed to delete bookmark' });
  }
};

module.exports = {
  getBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark
};
