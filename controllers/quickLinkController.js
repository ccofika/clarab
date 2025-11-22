const QuickLink = require('../models/QuickLink');
const axios = require('axios');

// Get all categories and links for current user
exports.getCategories = async (req, res) => {
  try {
    const categories = await QuickLink.find({ userId: req.user._id })
      .sort({ order: 1, categoryName: 1 })
      .populate('sharedWith.userId', 'name email');
    res.json(categories);
  } catch (error) {
    console.error('Error fetching quick links:', error);
    res.status(500).json({ message: 'Failed to fetch quick links', error: error.message });
  }
};

// Get recently clicked links
exports.getRecentLinks = async (req, res) => {
  try {
    const categories = await QuickLink.find({ userId: req.user._id });

    // Flatten all links with category info
    const allLinks = [];
    categories.forEach(category => {
      category.links.forEach(link => {
        if (link.lastClicked) {
          allLinks.push({
            ...link.toObject(),
            categoryId: category._id,
            categoryName: category.categoryName,
            categoryColor: category.color,
          });
        }
      });
    });

    // Sort by lastClicked descending and take top 20
    const recentLinks = allLinks
      .sort((a, b) => new Date(b.lastClicked) - new Date(a.lastClicked))
      .slice(0, 20);

    res.json(recentLinks);
  } catch (error) {
    console.error('Error fetching recent links:', error);
    res.status(500).json({ message: 'Failed to fetch recent links', error: error.message });
  }
};

// Create new category
exports.createCategory = async (req, res) => {
  try {
    const { categoryName, description, color, icon } = req.body;

    if (!categoryName || !categoryName.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    // Check if category already exists
    const existingCategory = await QuickLink.findOne({
      userId: req.user._id,
      categoryName: categoryName.trim(),
    });

    if (existingCategory) {
      return res.status(400).json({ message: 'Category already exists' });
    }

    // Get max order for new category
    const maxOrderCategory = await QuickLink.findOne({ userId: req.user._id })
      .sort({ order: -1 })
      .limit(1);

    const newOrder = maxOrderCategory ? maxOrderCategory.order + 1 : 0;

    const newCategory = new QuickLink({
      userId: req.user._id,
      categoryName: categoryName.trim(),
      description: description?.trim() || '',
      color: color || '#3B82F6',
      icon: icon || 'Folder',
      links: [],
      order: newOrder,
    });

    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Failed to create category', error: error.message });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { categoryName, description, color, icon } = req.body;

    if (!categoryName || !categoryName.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    // Check if another category with this name already exists
    const existingCategory = await QuickLink.findOne({
      userId: req.user._id,
      categoryName: categoryName.trim(),
      _id: { $ne: categoryId },
    });

    if (existingCategory) {
      return res.status(400).json({ message: 'Category with this name already exists' });
    }

    const updateData = {
      categoryName: categoryName.trim(),
    };

    if (description !== undefined) updateData.description = description.trim();
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;

    const category = await QuickLink.findOneAndUpdate(
      { _id: categoryId, userId: req.user._id },
      updateData,
      { new: true }
    );

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ message: 'Failed to update category', error: error.message });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await QuickLink.findOneAndDelete({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Failed to delete category', error: error.message });
  }
};

// Duplicate category
exports.duplicateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Get max order for new category
    const maxOrderCategory = await QuickLink.findOne({ userId: req.user._id })
      .sort({ order: -1 })
      .limit(1);

    const newOrder = maxOrderCategory ? maxOrderCategory.order + 1 : 0;

    // Create duplicate
    const duplicateCategory = new QuickLink({
      userId: req.user._id,
      categoryName: `${category.categoryName} (Copy)`,
      description: category.description,
      color: category.color,
      links: category.links.map(link => ({
        ...link.toObject(),
        _id: undefined, // Let MongoDB generate new IDs
      })),
      order: newOrder,
    });

    await duplicateCategory.save();
    res.status(201).json(duplicateCategory);
  } catch (error) {
    console.error('Error duplicating category:', error);
    res.status(500).json({ message: 'Failed to duplicate category', error: error.message });
  }
};

// Reorder categories
exports.reorderCategories = async (req, res) => {
  try {
    const { categoryOrders } = req.body; // Array of {categoryId, order}

    if (!Array.isArray(categoryOrders)) {
      return res.status(400).json({ message: 'categoryOrders must be an array' });
    }

    // Update all categories in parallel
    const updatePromises = categoryOrders.map(({ categoryId, order }) =>
      QuickLink.findOneAndUpdate(
        { _id: categoryId, userId: req.user._id },
        { order },
        { new: true }
      )
    );

    await Promise.all(updatePromises);

    // Fetch updated categories
    const categories = await QuickLink.find({ userId: req.user._id }).sort({ order: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Error reordering categories:', error);
    res.status(500).json({ message: 'Failed to reorder categories', error: error.message });
  }
};

// Add link to category
exports.addLink = async (req, res) => {
  try {
    const { categoryId, name, url, type, description, tags } = req.body;

    if (!categoryId || !name || !url) {
      return res.status(400).json({ message: 'Category ID, name, and URL are required' });
    }

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check for duplicate URL in this category
    const duplicateLink = category.links.find(link => link.url === url.trim());
    if (duplicateLink) {
      return res.status(400).json({
        message: 'A link with this URL already exists in this category',
        duplicateLink: duplicateLink,
      });
    }

    // Get max order for new link
    const maxOrder = category.links.length > 0
      ? Math.max(...category.links.map(l => l.order || 0))
      : -1;

    // Try to fetch favicon
    let favicon = '';
    try {
      const domain = new URL(url.trim()).hostname;
      favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch (e) {
      console.log('Could not parse URL for favicon:', url);
    }

    category.links.push({
      name: name.trim(),
      url: url.trim(),
      type: type || 'copy',
      description: description?.trim() || '',
      favicon,
      tags: tags || [],
      order: maxOrder + 1,
    });

    await category.save();
    res.status(201).json(category);
  } catch (error) {
    console.error('Error adding link:', error);
    res.status(500).json({ message: 'Failed to add link', error: error.message });
  }
};

// Update link in category
exports.updateLink = async (req, res) => {
  try {
    const { categoryId, linkId } = req.params;
    const { name, url, type, description, tags, customIcon } = req.body;

    if (!name || !url) {
      return res.status(400).json({ message: 'Name and URL are required' });
    }

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const link = category.links.id(linkId);
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }

    link.name = name.trim();
    link.url = url.trim();
    link.type = type || 'copy';

    if (description !== undefined) link.description = description.trim();
    if (tags !== undefined) link.tags = tags;
    if (customIcon !== undefined) link.customIcon = customIcon;

    // Update favicon if URL changed
    if (link.url !== url.trim()) {
      try {
        const domain = new URL(url.trim()).hostname;
        link.favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      } catch (e) {
        console.log('Could not parse URL for favicon:', url);
      }
    }

    await category.save();
    res.json(category);
  } catch (error) {
    console.error('Error updating link:', error);
    res.status(500).json({ message: 'Failed to update link', error: error.message });
  }
};

// Delete link from category
exports.deleteLink = async (req, res) => {
  try {
    const { categoryId, linkId } = req.params;

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    category.links = category.links.filter((link) => link._id.toString() !== linkId);
    await category.save();

    res.json(category);
  } catch (error) {
    console.error('Error deleting link:', error);
    res.status(500).json({ message: 'Failed to delete link', error: error.message });
  }
};

// Toggle pin status of link
exports.togglePin = async (req, res) => {
  try {
    const { categoryId, linkId } = req.params;

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const link = category.links.id(linkId);
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }

    link.isPinned = !link.isPinned;
    await category.save();

    res.json(category);
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ message: 'Failed to toggle pin', error: error.message });
  }
};

// Track link click
exports.trackClick = async (req, res) => {
  try {
    const { categoryId, linkId } = req.params;

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const link = category.links.id(linkId);
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }

    link.clicks = (link.clicks || 0) + 1;
    link.lastClicked = new Date();
    await category.save();

    res.json({ clicks: link.clicks, lastClicked: link.lastClicked });
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({ message: 'Failed to track click', error: error.message });
  }
};

// Reorder links within a category
exports.reorderLinks = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { linkOrders } = req.body; // Array of {linkId, order}

    if (!Array.isArray(linkOrders)) {
      return res.status(400).json({ message: 'linkOrders must be an array' });
    }

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Update order for each link
    linkOrders.forEach(({ linkId, order }) => {
      const link = category.links.id(linkId);
      if (link) {
        link.order = order;
      }
    });

    await category.save();
    res.json(category);
  } catch (error) {
    console.error('Error reordering links:', error);
    res.status(500).json({ message: 'Failed to reorder links', error: error.message });
  }
};

// Bulk delete
exports.bulkDelete = async (req, res) => {
  try {
    const { categoryIds, linkItems } = req.body;
    // linkItems: Array of {categoryId, linkId}

    // Delete categories
    if (categoryIds && categoryIds.length > 0) {
      await QuickLink.deleteMany({
        _id: { $in: categoryIds },
        userId: req.user._id,
      });
    }

    // Delete links
    if (linkItems && linkItems.length > 0) {
      for (const { categoryId, linkId } of linkItems) {
        const category = await QuickLink.findOne({
          _id: categoryId,
          userId: req.user._id,
        });

        if (category) {
          category.links = category.links.filter((link) => link._id.toString() !== linkId);
          await category.save();
        }
      }
    }

    // Fetch updated categories
    const categories = await QuickLink.find({ userId: req.user._id }).sort({ order: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(500).json({ message: 'Failed to bulk delete', error: error.message });
  }
};

// Export all quick links
exports.exportLinks = async (req, res) => {
  try {
    const { format } = req.query; // 'json' or 'html'

    const categories = await QuickLink.find({ userId: req.user._id }).sort({ order: 1 });

    if (format === 'html') {
      // Generate HTML bookmarks file (Netscape Bookmark Format)
      let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

      categories.forEach(category => {
        html += `    <DT><H3>${category.categoryName}</H3>\n`;
        html += `    <DL><p>\n`;
        category.links.forEach(link => {
          html += `        <DT><A HREF="${link.url}">${link.name}</A>\n`;
        });
        html += `    </DL><p>\n`;
      });

      html += `</DL><p>`;

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', 'attachment; filename="bookmarks.html"');
      res.send(html);
    } else {
      // JSON format (default)
      res.json(categories);
    }
  } catch (error) {
    console.error('Error exporting links:', error);
    res.status(500).json({ message: 'Failed to export links', error: error.message });
  }
};

// Import links from JSON
exports.importLinks = async (req, res) => {
  try {
    const { categories } = req.body;

    if (!Array.isArray(categories)) {
      return res.status(400).json({ message: 'Categories must be an array' });
    }

    const imported = [];
    const skipped = [];

    for (const cat of categories) {
      // Check if category exists
      const existingCategory = await QuickLink.findOne({
        userId: req.user._id,
        categoryName: cat.categoryName,
      });

      if (existingCategory) {
        skipped.push({ categoryName: cat.categoryName, reason: 'Already exists' });
        continue;
      }

      // Get max order
      const maxOrderCategory = await QuickLink.findOne({ userId: req.user._id })
        .sort({ order: -1 })
        .limit(1);

      const newOrder = maxOrderCategory ? maxOrderCategory.order + 1 : 0;

      const newCategory = new QuickLink({
        userId: req.user._id,
        categoryName: cat.categoryName,
        description: cat.description || '',
        color: cat.color || '#3B82F6',
        links: cat.links || [],
        order: newOrder,
      });

      await newCategory.save();
      imported.push(newCategory);
    }

    res.json({
      message: 'Import completed',
      imported: imported.length,
      skipped: skipped.length,
      details: { imported, skipped },
    });
  } catch (error) {
    console.error('Error importing links:', error);
    res.status(500).json({ message: 'Failed to import links', error: error.message });
  }
};

// Share category
exports.shareCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { userIds, permission } = req.body; // userIds: array of user IDs

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'userIds must be a non-empty array' });
    }

    if (!['view', 'edit'].includes(permission)) {
      return res.status(400).json({ message: 'Permission must be "view" or "edit"' });
    }

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Add users to sharedWith if not already shared
    userIds.forEach(userId => {
      const alreadyShared = category.sharedWith.find(
        share => share.userId.toString() === userId
      );

      if (!alreadyShared) {
        category.sharedWith.push({ userId, permission });
      }
    });

    await category.save();
    await category.populate('sharedWith.userId', 'name email');

    res.json(category);
  } catch (error) {
    console.error('Error sharing category:', error);
    res.status(500).json({ message: 'Failed to share category', error: error.message });
  }
};

// Unshare category
exports.unshareCategory = async (req, res) => {
  try {
    const { categoryId, userId } = req.params;

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    category.sharedWith = category.sharedWith.filter(
      share => share.userId.toString() !== userId
    );

    await category.save();
    res.json(category);
  } catch (error) {
    console.error('Error unsharing category:', error);
    res.status(500).json({ message: 'Failed to unshare category', error: error.message });
  }
};

// Toggle category privacy
exports.togglePrivacy = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    category.isPrivate = !category.isPrivate;
    await category.save();

    res.json(category);
  } catch (error) {
    console.error('Error toggling privacy:', error);
    res.status(500).json({ message: 'Failed to toggle privacy', error: error.message });
  }
};

// Get links for "Open All"
exports.getAllLinksInCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = await QuickLink.findOne({
      _id: categoryId,
      userId: req.user._id,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Return only URLs (limited to 20 for safety)
    const urls = category.links
      .slice(0, 20)
      .map(link => link.url);

    res.json({ urls, count: urls.length, total: category.links.length });
  } catch (error) {
    console.error('Error getting links for open all:', error);
    res.status(500).json({ message: 'Failed to get links', error: error.message });
  }
};
