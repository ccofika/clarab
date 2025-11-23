const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Channel routes
router.get('/channels', chatController.getChannels);
router.post('/channels', chatController.createChannel);
router.put('/channels/:channelId', chatController.updateChannel);
router.delete('/channels/:channelId', chatController.deleteChannel);
router.post('/channels/:channelId/archive', chatController.toggleArchiveChannel);
router.post('/channels/:channelId/mute', chatController.toggleMuteChannel);

// Message routes
router.get('/channels/:channelId/messages', chatController.getMessages);
router.post('/messages', chatController.sendMessage);
router.put('/messages/:messageId', chatController.editMessage);
router.delete('/messages/:messageId', chatController.deleteMessage);
router.post('/channels/:channelId/read', chatController.markAsRead);

// Reaction routes
router.post('/messages/:messageId/reactions', chatController.addReaction);
router.delete('/messages/:messageId/reactions', chatController.removeReaction);

// Pin/Bookmark routes
router.post('/messages/:messageId/pin', chatController.togglePinMessage);
router.post('/messages/:messageId/bookmark', chatController.toggleBookmark);
router.get('/bookmarks', chatController.getBookmarkedMessages);

// Search route
router.get('/search', chatController.searchMessages);

module.exports = router;
