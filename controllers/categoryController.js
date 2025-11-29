const Category = require('../models/Category');
const CanvasElement = require('../models/CanvasElement');
const Canvas = require('../models/Canvas');
const Workspace = require('../models/Workspace');
const { logActivity } = require('../utils/activityLogger');

// @desc    Get all categories as tree structure
// @route   GET /api/categories
// @access  Private
const getCategories = async (req, res) => {
  try {
    const { flat, maxDepth } = req.query;

    if (flat === 'true') {
      // Return flat list for dropdown/search
      const categories = await Category.find({ isDeleted: false })
        .sort({ depth: 1, order: 1, name: 1 })
        .populate('parent', 'name');

      return res.json(categories);
    }

    // Return tree structure
    const options = {};
    if (maxDepth) {
      options.maxDepth = parseInt(maxDepth);
    }

    const tree = await Category.getTree(options);
    res.json(tree);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single category with children
// @route   GET /api/categories/:id
// @access  Private
const getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('parent', 'name icon color')
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');

    if (!category || category.isDeleted) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Get children
    const children = await Category.find({
      parent: category._id,
      isDeleted: false
    }).sort({ order: 1, name: 1 });

    // Get full path
    const fullPath = await category.getFullPath();

    res.json({
      ...category.toObject(),
      children,
      fullPath
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create category
// @route   POST /api/categories
// @access  Private (Admin/Developer only for announcements procedures)
const createCategory = async (req, res) => {
  try {
    const { name, parent, icon, color, description, order } = req.body;

    // Only admins or developers can create/manage categories
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Only admins or developers can manage categories' });
    }

    // Check for duplicate name under same parent
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      parent: parent || null,
      isDeleted: false
    });

    if (existingCategory) {
      return res.status(400).json({
        message: parent
          ? 'A subcategory with this name already exists under the selected parent'
          : 'A root category with this name already exists'
      });
    }

    // Determine order if not provided
    let categoryOrder = order;
    if (categoryOrder === undefined) {
      const maxOrderCategory = await Category.findOne({
        parent: parent || null,
        isDeleted: false
      }).sort({ order: -1 });

      categoryOrder = maxOrderCategory ? maxOrderCategory.order + 1 : 0;
    }

    const category = await Category.create({
      name,
      parent: parent || null,
      icon: icon || 'folder',
      color: color || '#6366f1',
      description,
      order: categoryOrder,
      createdBy: req.user._id
    });

    // Populate and return
    const populatedCategory = await Category.findById(category._id)
      .populate('parent', 'name icon color')
      .populate('createdBy', 'name email');

    // Log activity
    await logActivity({
      level: 'info',
      message: `Category created: "${name}"`,
      module: 'categoryController',
      user: req.user._id,
      metadata: {
        categoryId: category._id,
        categoryName: name,
        parentId: parent || null,
        depth: category.depth
      },
      req
    });

    res.status(201).json(populatedCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private (Admin/Developer only)
const updateCategory = async (req, res) => {
  try {
    const { name, icon, color, description, order } = req.body;

    // Only admins or developers can manage categories
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Only admins or developers can manage categories' });
    }

    const category = await Category.findById(req.params.id);

    if (!category || category.isDeleted) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check for duplicate name if name is being changed
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        parent: category.parent,
        isDeleted: false,
        _id: { $ne: category._id }
      });

      if (existingCategory) {
        return res.status(400).json({ message: 'A category with this name already exists at this level' });
      }
    }

    // Update fields
    if (name) category.name = name;
    if (icon) category.icon = icon;
    if (color) category.color = color;
    if (description !== undefined) category.description = description;
    if (order !== undefined) category.order = order;
    category.lastModifiedBy = req.user._id;

    await category.save();

    const populatedCategory = await Category.findById(category._id)
      .populate('parent', 'name icon color')
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');

    res.json(populatedCategory);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Move category to new parent
// @route   PUT /api/categories/:id/move
// @access  Private (Admin/Developer only)
const moveCategory = async (req, res) => {
  try {
    const { newParentId } = req.body;

    // Only admins or developers can manage categories
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Only admins or developers can manage categories' });
    }

    const category = await Category.moveCategory(req.params.id, newParentId);

    const populatedCategory = await Category.findById(category._id)
      .populate('parent', 'name icon color')
      .populate('createdBy', 'name email');

    // Log activity
    await logActivity({
      level: 'info',
      message: `Category moved: "${category.name}"`,
      module: 'categoryController',
      user: req.user._id,
      metadata: {
        categoryId: category._id,
        newParentId: newParentId || null,
        newDepth: category.depth
      },
      req
    });

    res.json(populatedCategory);
  } catch (error) {
    console.error('Error moving category:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Delete category (soft delete)
// @route   DELETE /api/categories/:id
// @access  Private (Admin/Developer only)
const deleteCategory = async (req, res) => {
  try {
    const { cascade } = req.query;

    // Only admins or developers can manage categories
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Only admins or developers can manage categories' });
    }

    const category = await Category.findById(req.params.id);

    if (!category || category.isDeleted) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category has children
    const childCount = await Category.countDocuments({
      parent: category._id,
      isDeleted: false
    });

    // Check if category has posts
    const postCount = await CanvasElement.countDocuments({
      category: category._id,
      type: 'wrapper'
    });

    if (cascade !== 'true' && (childCount > 0 || postCount > 0)) {
      return res.status(400).json({
        message: 'Category has children or posts. Use cascade=true to delete all or reassign them first.',
        childCount,
        postCount
      });
    }

    if (cascade === 'true') {
      // Soft delete all descendants
      const descendants = await Category.getDescendants(category._id);
      for (const descendant of descendants) {
        descendant.isDeleted = true;
        descendant.lastModifiedBy = req.user._id;
        await descendant.save();
      }

      // Remove category references from posts
      await CanvasElement.updateMany(
        { category: { $in: [category._id, ...descendants.map(d => d._id)] } },
        { $set: { category: null } }
      );
    }

    // Soft delete the category
    category.isDeleted = true;
    category.lastModifiedBy = req.user._id;
    await category.save();

    // Log activity
    await logActivity({
      level: 'warn',
      message: `Category deleted: "${category.name}"`,
      module: 'categoryController',
      user: req.user._id,
      metadata: {
        categoryId: category._id,
        categoryName: category.name,
        cascadeDelete: cascade === 'true'
      },
      req
    });

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Reorder categories at same level
// @route   PUT /api/categories/reorder
// @access  Private (Admin/Developer only)
const reorderCategories = async (req, res) => {
  try {
    const { categoryOrders } = req.body; // Array of { id, order }

    // Only admins or developers can manage categories
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Only admins or developers can manage categories' });
    }

    if (!Array.isArray(categoryOrders)) {
      return res.status(400).json({ message: 'categoryOrders must be an array' });
    }

    // Update orders
    for (const { id, order } of categoryOrders) {
      await Category.findByIdAndUpdate(id, {
        order,
        lastModifiedBy: req.user._id
      });
    }

    res.json({ message: 'Categories reordered successfully' });
  } catch (error) {
    console.error('Error reordering categories:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get posts (wrapper elements) in a category
// @route   GET /api/categories/:id/posts
// @access  Private
const getCategoryPosts = async (req, res) => {
  try {
    const { includeDescendants, limit = 50, offset = 0 } = req.query;
    const category = await Category.findById(req.params.id);

    if (!category || category.isDeleted) {
      return res.status(404).json({ message: 'Category not found' });
    }

    let categoryIds = [category._id];

    // Include posts from descendant categories if requested
    if (includeDescendants === 'true') {
      const descendants = await Category.getDescendants(category._id);
      categoryIds = [category._id, ...descendants.map(d => d._id)];
    }

    // Get posts (wrapper elements) with their workspace info
    const posts = await CanvasElement.find({
      category: { $in: categoryIds },
      type: 'wrapper'
    })
      .populate({
        path: 'canvas',
        select: 'workspace',
        populate: {
          path: 'workspace',
          select: 'name type'
        }
      })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    const total = await CanvasElement.countDocuments({
      category: { $in: categoryIds },
      type: 'wrapper'
    });

    // Format response with workspace info
    const formattedPosts = posts.map(post => {
      const postObj = post.toObject();
      return {
        ...postObj,
        workspaceId: post.canvas?.workspace?._id,
        workspaceName: post.canvas?.workspace?.name,
        workspaceType: post.canvas?.workspace?.type
      };
    });

    res.json({
      posts: formattedPosts,
      total,
      hasMore: parseInt(offset) + posts.length < total
    });
  } catch (error) {
    console.error('Error fetching category posts:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Assign category to element (wrapper)
// @route   PUT /api/categories/assign
// @access  Private (Admin/Developer only)
const assignCategory = async (req, res) => {
  try {
    const { elementId, categoryId } = req.body;

    // Only admins or developers can assign categories
    if (req.user.role !== 'admin' && req.user.role !== 'developer') {
      return res.status(403).json({ message: 'Only admins or developers can assign categories' });
    }

    const element = await CanvasElement.findById(elementId);
    if (!element) {
      return res.status(404).json({ message: 'Element not found' });
    }

    if (element.type !== 'wrapper') {
      return res.status(400).json({ message: 'Categories can only be assigned to wrapper elements' });
    }

    // Verify category exists if provided
    if (categoryId) {
      const category = await Category.findById(categoryId);
      if (!category || category.isDeleted) {
        return res.status(404).json({ message: 'Category not found' });
      }
    }

    const oldCategoryId = element.category;
    element.category = categoryId || null;
    element.lastEditedBy = req.user._id;
    await element.save();

    // Update post counts
    if (oldCategoryId) {
      await Category.updatePostCounts(oldCategoryId);
    }
    if (categoryId) {
      await Category.updatePostCounts(categoryId);
    }

    // Populate and return
    const populatedElement = await CanvasElement.findById(element._id)
      .populate('category', 'name icon color');

    res.json(populatedElement);
  } catch (error) {
    console.error('Error assigning category:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

// @desc    Get category navigation data (optimized for WorkspaceNavigation)
// @route   GET /api/categories/navigation
// @access  Private
const getCategoryNavigation = async (req, res) => {
  try {
    // Get full category tree with post counts
    const tree = await Category.getTree();

    // Get all wrapper posts organized by category
    const wrappers = await CanvasElement.find({
      category: { $ne: null },
      type: 'wrapper'
    })
      .populate({
        path: 'canvas',
        populate: { path: 'workspace', select: 'name type' }
      })
      .populate('category', 'name')
      .select('_id content.value content.title category canvas position dimensions createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Get all canvas IDs that have wrappers with categories
    const canvasIds = [...new Set(wrappers.map(w => w.canvas?._id?.toString()).filter(Boolean))];

    // Get all title elements from those canvases (include content for title text)
    const titleElements = await CanvasElement.find({
      canvas: { $in: canvasIds },
      type: 'title'
    })
      .select('_id canvas position dimensions content')
      .lean();

    // Group title elements by canvas
    const titlesByCanvas = {};
    for (const title of titleElements) {
      const canvasId = title.canvas?.toString();
      if (canvasId) {
        if (!titlesByCanvas[canvasId]) {
          titlesByCanvas[canvasId] = [];
        }
        titlesByCanvas[canvasId].push(title);
      }
    }

    // Helper function to check if a title is inside a wrapper
    const isTitleInsideWrapper = (title, wrapper) => {
      if (!title.position || !wrapper.position || !wrapper.dimensions) return false;

      const titleX = title.position.x;
      const titleY = title.position.y;
      const wrapperLeft = wrapper.position.x;
      const wrapperTop = wrapper.position.y;
      const wrapperRight = wrapperLeft + (wrapper.dimensions.width || 0);
      const wrapperBottom = wrapperTop + (wrapper.dimensions.height || 0);

      return titleX >= wrapperLeft && titleX <= wrapperRight &&
             titleY >= wrapperTop && titleY <= wrapperBottom;
    };

    // Organize posts by category ID, finding title element for each wrapper
    const postsByCategory = {};
    for (const wrapper of wrappers) {
      const categoryId = wrapper.category?._id?.toString();
      if (categoryId) {
        if (!postsByCategory[categoryId]) {
          postsByCategory[categoryId] = [];
        }

        // Find the title element inside this wrapper
        const canvasId = wrapper.canvas?._id?.toString();
        const canvasTitles = titlesByCanvas[canvasId] || [];
        const titleInWrapper = canvasTitles.find(title => isTitleInsideWrapper(title, wrapper));

        // Extract title text from the title element inside the wrapper
        // Strip HTML tags to get plain text
        let titleText = 'Untitled';
        if (titleInWrapper?.content?.value) {
          // Remove HTML tags
          titleText = titleInWrapper.content.value.replace(/<[^>]*>/g, '').trim() || 'Untitled';
        }

        postsByCategory[categoryId].push({
          _id: wrapper._id,
          title: titleText,
          workspaceId: wrapper.canvas?.workspace?._id,
          workspaceName: wrapper.canvas?.workspace?.name,
          canvasId: wrapper.canvas?._id,
          titleElementId: titleInWrapper?._id || null,
          createdAt: wrapper.createdAt
        });
      }
    }

    // Add posts to tree nodes
    const addPostsToTree = (nodes) => {
      for (const node of nodes) {
        node.posts = postsByCategory[node._id.toString()] || [];
        node.hasChildren = node.children && node.children.length > 0;
        node.hasPosts = node.posts.length > 0;
        if (node.children) {
          addPostsToTree(node.children);
        }
      }
    };

    addPostsToTree(tree);

    res.json(tree);
  } catch (error) {
    console.error('Error fetching category navigation:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Search categories
// @route   GET /api/categories/search
// @access  Private
const searchCategories = async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query || query.trim().length === 0) {
      return res.json([]);
    }

    const categories = await Category.find({
      name: { $regex: query, $options: 'i' },
      isDeleted: false
    })
      .populate('parent', 'name')
      .sort({ depth: 1, name: 1 })
      .limit(parseInt(limit));

    // Add full path to each result
    const results = await Promise.all(
      categories.map(async (cat) => {
        const fullPath = await cat.getFullPath();
        return {
          ...cat.toObject(),
          fullPath
        };
      })
    );

    res.json(results);
  } catch (error) {
    console.error('Error searching categories:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  moveCategory,
  deleteCategory,
  reorderCategories,
  getCategoryPosts,
  assignCategory,
  getCategoryNavigation,
  searchCategories
};
