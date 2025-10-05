const express = require('express');
const router = express.Router();
const QuickLink = require('../models/QuickLink');
const { protect } = require('../middleware/auth');

// Get all categories and links for current user
router.get('/', protect, async (req, res) => {
  try {
    const categories = await QuickLink.find({ userId: req.user._id }).sort({ categoryName: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching quick links:', error);
    res.status(500).json({ message: 'Failed to fetch quick links', error: error.message });
  }
});

// Create new category
router.post('/category', protect, async (req, res) => {
  try {
    const { categoryName } = req.body;

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

    const newCategory = new QuickLink({
      userId: req.user._id,
      categoryName: categoryName.trim(),
      links: [],
    });

    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Failed to create category', error: error.message });
  }
});

// Update category name
router.put('/category/:categoryId', protect, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { categoryName } = req.body;

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

    const category = await QuickLink.findOneAndUpdate(
      { _id: categoryId, userId: req.user._id },
      { categoryName: categoryName.trim() },
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
});

// Delete category
router.delete('/category/:categoryId', protect, async (req, res) => {
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
});

// Add link to category
router.post('/link', protect, async (req, res) => {
  try {
    const { categoryId, name, url, type } = req.body;

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

    category.links.push({
      name: name.trim(),
      url: url.trim(),
      type: type || 'copy',
    });

    await category.save();
    res.status(201).json(category);
  } catch (error) {
    console.error('Error adding link:', error);
    res.status(500).json({ message: 'Failed to add link', error: error.message });
  }
});

// Update link in category
router.put('/link/:categoryId/:linkId', protect, async (req, res) => {
  try {
    const { categoryId, linkId } = req.params;
    const { name, url, type } = req.body;

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

    await category.save();
    res.json(category);
  } catch (error) {
    console.error('Error updating link:', error);
    res.status(500).json({ message: 'Failed to update link', error: error.message });
  }
});

// Delete link from category
router.delete('/link/:categoryId/:linkId', protect, async (req, res) => {
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
});

module.exports = router;
