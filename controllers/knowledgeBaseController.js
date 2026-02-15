const KBPage = require('../models/KBPage');
const KBAdmin = require('../models/KBAdmin');
const KBEditLog = require('../models/KBEditLog');
const KBPageVersion = require('../models/KBPageVersion');
const KBSection = require('../models/KBSection');
const User = require('../models/User');
const { clearSearchCache } = require('./kbExtendedController');

const SUPER_ADMIN_EMAIL = 'filipkozomara@mebit.io';

// ==================== ADMIN STATUS ====================

// Check if current user is admin/superadmin
exports.checkAdminStatus = async (req, res) => {
  try {
    const isSuperAdmin = req.user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    const isAdmin = isSuperAdmin || await KBAdmin.isAdmin(req.user._id);

    res.json({ isAdmin, isSuperAdmin });
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(500).json({ message: 'Error checking admin status' });
  }
};

// ==================== PAGE CRUD ====================

// Get all pages as tree structure
exports.getAllPages = async (req, res) => {
  try {
    const includeUnpublished = req.isKBAdmin || false;
    const tree = await KBPage.getTree(includeUnpublished);
    res.json(tree);
  } catch (error) {
    console.error('Error fetching pages:', error);
    res.status(500).json({ message: 'Error fetching pages' });
  }
};

// Get single page by ID (for editing)
exports.getPageById = async (req, res) => {
  try {
    const { id } = req.params;

    const page = await KBPage.findById(id)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');

    if (!page || page.isDeleted) {
      return res.status(404).json({ message: 'Page not found' });
    }

    res.json(page);
  } catch (error) {
    console.error('Error fetching page by ID:', error);
    res.status(500).json({ message: 'Error fetching page' });
  }
};

// Get single page by slug
exports.getPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const page = await KBPage.findOne({
      slug,
      isDeleted: false
    })
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');

    if (!page) {
      return res.status(404).json({ message: 'Page not found' });
    }

    // Check if unpublished page and user is not admin
    if (!page.isPublished && !req.isKBAdmin) {
      return res.status(404).json({ message: 'Page not found' });
    }

    // Get breadcrumbs
    const breadcrumbs = await page.getBreadcrumbs();

    res.json({
      ...page.toObject(),
      breadcrumbs
    });
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({ message: 'Error fetching page' });
  }
};

// Create new page
exports.createPage = async (req, res) => {
  try {
    const { title, icon, coverImage, parentPage, blocks, dropdowns, isSection, sectionId } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }

    // Generate unique slug
    let baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    let slug = baseSlug;
    let counter = 1;
    while (await KBPage.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Get order for new page
    const siblingCount = await KBPage.countDocuments({
      parentPage: parentPage || null,
      isDeleted: false
    });

    const page = await KBPage.create({
      title: title.trim(),
      slug,
      icon: icon || (isSection ? '📁' : '📄'),
      coverImage,
      parentPage: parentPage || null,
      order: siblingCount,
      blocks: blocks || [],
      dropdowns: dropdowns || [],
      isSection: isSection || false,
      sectionId: sectionId || null,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    // Log the creation
    await KBEditLog.logEdit(page._id, req.user._id, 'create', {
      after: { title: page.title, slug: page.slug },
      summary: `Created page "${page.title}"`
    });

    const populatedPage = await KBPage.findById(page._id)
      .populate('createdBy', 'name email');

    clearSearchCache();
    res.status(201).json(populatedPage);
  } catch (error) {
    console.error('Error creating page:', error);
    res.status(500).json({ message: error.message || 'Error creating page' });
  }
};

// Update page
exports.updatePage = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const page = await KBPage.findById(id);
    if (!page || page.isDeleted) {
      return res.status(404).json({ message: 'Page not found' });
    }

    // Auto-create version snapshot before applying updates
    // Throttle: skip version creation if last version is less than 2 minutes old (avoids flooding from auto-save)
    try {
      const lastVersion = await KBPageVersion.findOne({ page: page._id }).sort({ version: -1 }).lean();
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const shouldCreateVersion = !lastVersion || !lastVersion.createdAt || lastVersion.createdAt < twoMinutesAgo;

      if (shouldCreateVersion) {
        const changesSummary = [];
        if (updates.title && updates.title !== page.title) changesSummary.push('title');
        if (updates.blocks) changesSummary.push('content');
        if (updates.dropdowns) changesSummary.push('dropdowns');
        if (updates.icon && updates.icon !== page.icon) changesSummary.push('icon');
        if (updates.coverImage !== undefined) changesSummary.push('cover');
        const summary = changesSummary.length > 0
          ? `Changed: ${changesSummary.join(', ')}`
          : 'Page updated';
        await KBPageVersion.createVersion(page, req.user._id, summary);
      }
    } catch (versionError) {
      console.error('Error creating page version:', versionError);
      // Don't block the update if version creation fails
    }

    // Store before state for logging
    const before = {
      title: page.title,
      icon: page.icon,
      blocks: page.blocks?.length || 0,
      dropdowns: page.dropdowns?.length || 0
    };

    // Update allowed fields
    const allowedUpdates = ['title', 'icon', 'coverImage', 'parentPage', 'blocks', 'dropdowns', 'isPublished', 'isSection', 'sectionId', 'tags'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        page[field] = updates[field];
      }
    });

    // Update slug if title changed
    if (updates.title && updates.title !== before.title) {
      let baseSlug = updates.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      let slug = baseSlug;
      let counter = 1;
      while (await KBPage.findOne({ slug, _id: { $ne: id } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      page.slug = slug;
    }

    page.lastModifiedBy = req.user._id;
    await page.save();

    // Log the update (throttled: skip if last edit log for this page is less than 2 minutes old)
    try {
      const lastLog = await KBEditLog.findOne({ page: page._id, action: 'update' }).sort({ createdAt: -1 }).lean();
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
      if (!lastLog || !lastLog.createdAt || lastLog.createdAt < twoMinAgo) {
        await KBEditLog.logEdit(page._id, req.user._id, 'update', {
          before,
          after: {
            title: page.title,
            icon: page.icon,
            blocks: page.blocks?.length || 0,
            dropdowns: page.dropdowns?.length || 0
          },
          summary: `Updated page "${page.title}"`
        });
      }
    } catch (logError) {
      console.error('Error logging edit:', logError);
    }

    const populatedPage = await KBPage.findById(page._id)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');

    clearSearchCache();
    res.json(populatedPage);
  } catch (error) {
    console.error('Error updating page:', error);
    res.status(500).json({ message: error.message || 'Error updating page' });
  }
};

// Delete page (soft delete)
exports.deletePage = async (req, res) => {
  try {
    const { id } = req.params;

    const page = await KBPage.findById(id);
    if (!page || page.isDeleted) {
      return res.status(404).json({ message: 'Page not found' });
    }

    // Soft delete
    page.isDeleted = true;
    page.deletedAt = new Date();
    page.deletedBy = req.user._id;
    await page.save();

    // Also soft delete all child pages
    await KBPage.updateMany(
      { parentPage: id, isDeleted: false },
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id
      }
    );

    // Log the deletion
    await KBEditLog.logEdit(page._id, req.user._id, 'delete', {
      before: { title: page.title, slug: page.slug },
      summary: `Deleted page "${page.title}"`
    });

    clearSearchCache();
    res.json({ message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ message: 'Error deleting page' });
  }
};

// Reorder page (supports positional inserts and section assignment)
exports.reorderPage = async (req, res) => {
  try {
    const { id } = req.params;
    let { newOrder, newParentPage, sectionId } = req.body;

    const page = await KBPage.findById(id);
    if (!page || page.isDeleted) {
      return res.status(404).json({ message: 'Page not found' });
    }

    const oldParentPage = page.parentPage;
    const oldOrder = page.order;

    // Step 1: Remove from old position (close the gap in old parent)
    await KBPage.updateMany(
      {
        parentPage: oldParentPage,
        order: { $gt: oldOrder },
        isDeleted: false,
        _id: { $ne: id }
      },
      { $inc: { order: -1 } }
    );

    // Step 2: Calculate new order if not specified (newOrder < 0 means append at end)
    if (newOrder === undefined || newOrder === null || newOrder < 0) {
      const siblingCount = await KBPage.countDocuments({
        parentPage: newParentPage || null,
        isDeleted: false,
        _id: { $ne: id }
      });
      newOrder = siblingCount;
    }

    // Step 3: Make room at new position (push siblings at/after newOrder down)
    await KBPage.updateMany(
      {
        parentPage: newParentPage || null,
        order: { $gte: newOrder },
        isDeleted: false,
        _id: { $ne: id }
      },
      { $inc: { order: 1 } }
    );

    // Step 4: Place the page at its new position
    page.parentPage = newParentPage || null;
    page.order = newOrder;

    // Step 5: Update sectionId if provided
    if (sectionId !== undefined) {
      page.sectionId = sectionId || null;
    }

    page.lastModifiedBy = req.user._id;
    await page.save();

    // Log the reorder
    await KBEditLog.logEdit(page._id, req.user._id, 'reorder', {
      summary: `Reordered page "${page.title}"`
    });

    res.json({ message: 'Page reordered successfully' });
  } catch (error) {
    console.error('Error reordering page:', error);
    res.status(500).json({ message: 'Error reordering page' });
  }
};

// ==================== ADMIN MANAGEMENT ====================

// Get all admins
exports.getAdmins = async (req, res) => {
  try {
    const admins = await KBAdmin.find()
      .populate('user', 'name email')
      .populate('addedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Add superadmin info
    const superadminUser = await User.findOne({ email: SUPER_ADMIN_EMAIL })
      .select('name email');

    const result = [];

    // Add superadmin first
    if (superadminUser) {
      result.push({
        _id: 'superadmin',
        user: superadminUser,
        role: 'superadmin',
        addedBy: null,
        createdAt: null,
        isHardcoded: true
      });
    }

    // Add other admins
    admins.forEach(admin => {
      if (admin.user?.email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
        result.push(admin);
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ message: 'Error fetching admins' });
  }
};

// Add admin
exports.addAdmin = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already admin
    const existingAdmin = await KBAdmin.findOne({ user: user._id });
    if (existingAdmin) {
      return res.status(400).json({ message: 'User is already an admin' });
    }

    // Check if trying to add superadmin
    if (email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      return res.status(400).json({ message: 'Cannot modify superadmin' });
    }

    const admin = await KBAdmin.create({
      user: user._id,
      role: 'admin',
      addedBy: req.user._id
    });

    const populatedAdmin = await KBAdmin.findById(admin._id)
      .populate('user', 'name email')
      .populate('addedBy', 'name email');

    res.status(201).json(populatedAdmin);
  } catch (error) {
    console.error('Error adding admin:', error);
    res.status(500).json({ message: 'Error adding admin' });
  }
};

// Remove admin
exports.removeAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await KBAdmin.findById(id).populate('user', 'email');
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Cannot remove superadmin
    if (admin.user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      return res.status(400).json({ message: 'Cannot remove superadmin' });
    }

    await KBAdmin.deleteOne({ _id: id });

    res.json({ message: 'Admin removed successfully' });
  } catch (error) {
    console.error('Error removing admin:', error);
    res.status(500).json({ message: 'Error removing admin' });
  }
};

// ==================== EDIT LOGS ====================

// Get all edit logs
exports.getEditLogs = async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = await KBEditLog.getRecentLogs(parseInt(limit));
    res.json(logs);
  } catch (error) {
    console.error('Error fetching edit logs:', error);
    res.status(500).json({ message: 'Error fetching edit logs' });
  }
};

// Get edit logs for a specific page
exports.getPageEditLogs = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { limit = 50 } = req.query;
    const logs = await KBEditLog.getPageLogs(pageId, parseInt(limit));
    res.json(logs);
  } catch (error) {
    console.error('Error fetching page edit logs:', error);
    res.status(500).json({ message: 'Error fetching page edit logs' });
  }
};

// ==================== SECTIONS ====================

// Get all sections
exports.getSections = async (req, res) => {
  try {
    const sections = await KBSection.find().sort({ order: 1 }).lean();
    res.json(sections);
  } catch (error) {
    console.error('Error fetching sections:', error);
    res.status(500).json({ message: 'Error fetching sections' });
  }
};

// Create section
exports.createSection = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Section name is required' });
    }

    const count = await KBSection.countDocuments();
    const section = await KBSection.create({
      name: name.trim(),
      order: count,
      createdBy: req.user._id
    });

    res.status(201).json(section);
  } catch (error) {
    console.error('Error creating section:', error);
    res.status(500).json({ message: 'Error creating section' });
  }
};

// Update section (rename)
exports.updateSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const section = await KBSection.findById(id);
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }

    if (name !== undefined) section.name = name.trim();
    await section.save();

    res.json(section);
  } catch (error) {
    console.error('Error updating section:', error);
    res.status(500).json({ message: 'Error updating section' });
  }
};

// Delete section (unassign pages)
exports.deleteSection = async (req, res) => {
  try {
    const { id } = req.params;

    const section = await KBSection.findById(id);
    if (!section) {
      return res.status(404).json({ message: 'Section not found' });
    }

    // Unassign all pages from this section
    await KBPage.updateMany(
      { sectionId: id },
      { sectionId: null }
    );

    await KBSection.deleteOne({ _id: id });

    res.json({ message: 'Section deleted' });
  } catch (error) {
    console.error('Error deleting section:', error);
    res.status(500).json({ message: 'Error deleting section' });
  }
};
