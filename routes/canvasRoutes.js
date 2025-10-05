const express = require('express');
const router = express.Router();
const {
  getCanvasByWorkspace,
  getCanvasElements,
  createCanvasElement,
  updateCanvasElement,
  deleteCanvasElement,
  updateCanvasViewState,
  searchCanvasElements
} = require('../controllers/canvasController');
const { protect } = require('../middleware/auth');

// Search route
router.get('/search', protect, searchCanvasElements);

// Canvas routes
router.get('/workspace/:workspaceId', protect, getCanvasByWorkspace);
router.put('/:canvasId/viewstate', protect, updateCanvasViewState);

// Canvas element routes
router.route('/:canvasId/elements')
  .get(protect, getCanvasElements)
  .post(protect, createCanvasElement);

router.route('/elements/:elementId')
  .put(protect, updateCanvasElement)
  .delete(protect, deleteCanvasElement);

module.exports = router;
