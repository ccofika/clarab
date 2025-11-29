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
router.get('/muted', chatController.getMutedChannels);
router.get('/channels/:channelId/mute-status', chatController.getChannelMuteStatus);

// Channel notification settings
router.get('/channels/:channelId/notifications', chatController.getChannelNotificationSettings);
router.put('/channels/:channelId/notifications', chatController.updateChannelNotificationSettings);
router.get('/notification-settings', chatController.getAllNotificationSettings);

// Convert DM to group & Leave channel
router.post('/channels/:channelId/convert-to-group', chatController.convertDMToGroup);
router.post('/channels/:channelId/leave', chatController.leaveChannel);

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

// Starred channels routes
router.post('/channels/:channelId/star', chatController.starChannel);
router.delete('/channels/:channelId/star', chatController.unstarChannel);
router.get('/starred', chatController.getStarredChannels);

// Search routes
router.get('/search', chatController.searchMessages);
router.get('/search/files', chatController.searchFiles);

// Thread routes
router.get('/threads', chatController.getUserThreads);
router.get('/threads/unread-count', chatController.getUnreadThreadCount);
router.get('/messages/:messageId/thread', chatController.getThreadReplies);
router.post('/messages/:messageId/thread/follow', chatController.toggleThreadFollow);
router.post('/messages/:messageId/thread/read', chatController.markThreadAsRead);

// File upload route
router.post('/upload', chatController.uploadFile, chatController.uploadChatFile);

module.exports = router;
