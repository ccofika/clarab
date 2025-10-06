const express = require('express');
const router = express.Router();
const {
  getBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark
} = require('../controllers/bookmarkController');
const { protect } = require('../middleware/auth');

router.route('/')
  .get(protect, getBookmarks)
  .post(protect, createBookmark);

router.route('/:id')
  .put(protect, updateBookmark)
  .delete(protect, deleteBookmark);

module.exports = router;
