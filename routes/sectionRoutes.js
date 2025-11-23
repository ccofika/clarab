const express = require('express');
const router = express.Router();
const sectionController = require('../controllers/sectionController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Section CRUD
router.get('/', sectionController.getSections);
router.post('/', sectionController.createSection);
router.put('/:sectionId', sectionController.updateSection);
router.delete('/:sectionId', sectionController.deleteSection);

// Section actions
router.post('/:sectionId/toggle-collapse', sectionController.toggleSectionCollapse);
router.post('/reorder', sectionController.reorderSections);

// Channel management within sections
router.post('/:sectionId/channels', sectionController.addChannelToSection);
router.delete('/:sectionId/channels/:channelId', sectionController.removeChannelFromSection);

module.exports = router;
