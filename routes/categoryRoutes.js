const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/categoryController');
const { protect } = require('../middleware/auth');

// Navigation data endpoint (must be before /:id route)
router.route('/navigation')
  .get(protect, getCategoryNavigation);

// Search categories (must be before /:id route)
router.route('/search')
  .get(protect, searchCategories);

// Reorder categories
router.route('/reorder')
  .put(protect, reorderCategories);

// Assign category to element
router.route('/assign')
  .put(protect, assignCategory);

// Base routes
router.route('/')
  .get(protect, getCategories)
  .post(protect, createCategory);

// Category by ID
router.route('/:id')
  .get(protect, getCategory)
  .put(protect, updateCategory)
  .delete(protect, deleteCategory);

// Move category to new parent
router.route('/:id/move')
  .put(protect, moveCategory);

// Get posts in category
router.route('/:id/posts')
  .get(protect, getCategoryPosts);

module.exports = router;
