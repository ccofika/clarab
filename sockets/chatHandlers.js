const ChatChannel = require('../models/ChatChannel');
const ChatMessage = require('../models/ChatMessage');

// Store for tracking user presence and typing indicators
const userPresence = new Map(); // userId -> { status, lastSeen, socketId }
const typingUsers = new Map(); // channelId -> Map of userId -> userInfo

module.exports = (io, socket) => {
  const userId = socket.userId;

  // Join user to all their channels
  socket.on('chat:init', async () => {
    try {
      const channels = await ChatChannel.find({
        'members.userId': userId
      });

      channels.forEach((channel) => {
        socket.join(`chat:${channel._id}`);
      });

      // Set user as online
      userPresence.set(userId.toString(), {
        status: 'online',
        lastSeen: new Date(),
        socketId: socket.id
      });

      // Broadcast user online status to all their channels
      channels.forEach((channel) => {
        io.to(`chat:${channel._id}`).emit('chat:user:presence', {
          userId,
          status: 'online',
          lastSeen: new Date()
        });
      });

      socket.emit('chat:init:success', {
        message: 'Connected to chat system',
        channelCount: channels.length
      });

    } catch (error) {
      console.error('Error initializing chat:', error);
      socket.emit('chat:error', { message: 'Failed to initialize chat' });
    }
  });

  // Join a specific channel room
  socket.on('chat:channel:join', async (channelId) => {
    try {
      const channel = await ChatChannel.findById(channelId);

      if (!channel) {
        return socket.emit('chat:error', { message: 'Channel not found' });
      }

      if (!channel.isMember(userId)) {
        return socket.emit('chat:error', {
          message: 'Not a member of this channel'
        });
      }

      socket.join(`chat:${channelId}`);

      // Notify other members that user joined
      socket.to(`chat:${channelId}`).emit('chat:channel:user:joined', {
        channelId,
        userId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error joining channel:', error);
      socket.emit('chat:error', { message: 'Failed to join channel' });
    }
  });

  // Leave a channel room
  socket.on('chat:channel:leave', (channelId) => {
    try {
      socket.leave(`chat:${channelId}`);

      // Notify other members that user left
      socket.to(`chat:${channelId}`).emit('chat:channel:user:left', {
        channelId,
        userId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error leaving channel:', error);
    }
  });

  // Send message (real-time broadcast)
  socket.on('chat:message:send', async (data) => {
    try {
      const { channelId, message } = data;

      console.log(`📨 Message send event from user ${userId} to channel ${channelId}`);

      const channel = await ChatChannel.findById(channelId);

      if (!channel) {
        console.error(`❌ Channel ${channelId} not found`);
        return socket.emit('chat:error', { message: 'Channel not found' });
      }

      if (!channel.isMember(userId)) {
        console.error(`❌ User ${userId} not a member of channel ${channelId}`);
        return socket.emit('chat:error', {
          message: 'Not a member of this channel'
        });
      }

      // Stop typing indicator for this user
      const typingMap = typingUsers.get(channelId);
      if (typingMap) {
        typingMap.delete(userId.toString());
        io.to(`chat:${channelId}`).emit('chat:typing:update', {
          channelId,
          typingUsers: Array.from(typingMap.values())
        });
      }

      // Get sockets in this room
      const socketsInRoom = await io.in(`chat:${channelId}`).fetchSockets();
      console.log(`📢 Broadcasting to channel ${channelId}, ${socketsInRoom.length} sockets in room:`);
      socketsInRoom.forEach(s => {
        console.log(`   - Socket ${s.id} (user: ${s.userId})`);
      });

      // Broadcast message to channel (including sender for instant feedback)
      io.to(`chat:${channelId}`).emit('chat:message:received', {
        channelId,
        message,
        timestamp: new Date()
      });

      console.log(`✅ Message broadcasted to channel ${channelId}`);

      // Update last message in channel for all members
      io.to(`chat:${channelId}`).emit('chat:channel:updated', {
        channelId,
        lastMessage: {
          content: message.content.substring(0, 100),
          sender: userId,
          timestamp: new Date(),
          type: message.type || 'text'
        }
      });
    } catch (error) {
      console.error('Error broadcasting message:', error);
      socket.emit('chat:error', { message: 'Failed to send message' });
    }
  });

  // Edit message
  socket.on('chat:message:edit', async (data) => {
    try {
      const { messageId, channelId, content } = data;

      // Broadcast edited message to channel
      io.to(`chat:${channelId}`).emit('chat:message:edited', {
        messageId,
        channelId,
        content,
        isEdited: true,
        editedAt: new Date()
      });
    } catch (error) {
      console.error('Error broadcasting message edit:', error);
    }
  });

  // Delete message
  socket.on('chat:message:delete', async (data) => {
    try {
      const { messageId, channelId } = data;

      // Broadcast deleted message to channel
      io.to(`chat:${channelId}`).emit('chat:message:deleted', {
        messageId,
        channelId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error broadcasting message deletion:', error);
    }
  });

  // Typing indicator start
  socket.on('chat:typing:start', async (data) => {
    try {
      const { channelId } = data;

      const channel = await ChatChannel.findById(channelId).populate('members.userId', 'name email avatar');

      if (!channel || !channel.isMember(userId)) {
        return;
      }

      // Get user info
      const userInfo = channel.members.find(m => m.userId._id.toString() === userId.toString())?.userId;

      if (!userInfo) return;

      // Add user to typing map
      if (!typingUsers.has(channelId)) {
        typingUsers.set(channelId, new Map());
      }

      typingUsers.get(channelId).set(userId.toString(), {
        _id: userInfo._id,
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar
      });

      // Broadcast to others in channel (not to self)
      socket.to(`chat:${channelId}`).emit('chat:typing:update', {
        channelId,
        typingUsers: Array.from(typingUsers.get(channelId).values())
      });
    } catch (error) {
      console.error('Error handling typing indicator:', error);
    }
  });

  // Typing indicator stop
  socket.on('chat:typing:stop', async (data) => {
    try {
      const { channelId } = data;

      const typingMap = typingUsers.get(channelId);
      if (typingMap) {
        typingMap.delete(userId.toString());

        // Broadcast to channel
        io.to(`chat:${channelId}`).emit('chat:typing:update', {
          channelId,
          typingUsers: Array.from(typingMap.values())
        });

        // Clean up empty maps
        if (typingMap.size === 0) {
          typingUsers.delete(channelId);
        }
      }
    } catch (error) {
      console.error('Error handling typing stop:', error);
    }
  });

  // Reaction added
  socket.on('chat:reaction:add', async (data) => {
    try {
      const { messageId, channelId, emoji } = data;

      // Broadcast to channel
      io.to(`chat:${channelId}`).emit('chat:reaction:added', {
        messageId,
        channelId,
        emoji,
        userId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error broadcasting reaction:', error);
    }
  });

  // Reaction removed
  socket.on('chat:reaction:remove', async (data) => {
    try {
      const { messageId, channelId, emoji } = data;

      // Broadcast to channel
      io.to(`chat:${channelId}`).emit('chat:reaction:removed', {
        messageId,
        channelId,
        emoji,
        userId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error broadcasting reaction removal:', error);
    }
  });

  // Messages read
  socket.on('chat:messages:read', async (data) => {
    try {
      const { channelId } = data;

      // Broadcast read status to channel
      socket.to(`chat:${channelId}`).emit('chat:messages:read:update', {
        channelId,
        userId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error broadcasting read status:', error);
    }
  });

  // Thread reply sent - broadcast to thread followers
  socket.on('chat:thread:reply', async (data) => {
    try {
      const { parentMessageId, channelId, message } = data;

      console.log(`🧵 Thread reply event for parent ${parentMessageId}`);

      // Get parent message to find thread followers
      const parentMessage = await ChatMessage.findById(parentMessageId)
        .populate('threadFollowers.userId', '_id');

      if (!parentMessage) {
        console.error(`❌ Parent message ${parentMessageId} not found`);
        return;
      }

      // Broadcast to channel (thread replies are visible in channel too if also sent)
      io.to(`chat:${channelId}`).emit('chat:thread:new_reply', {
        parentMessageId,
        channelId,
        message,
        timestamp: new Date()
      });

      // Also emit update for parent message's reply count
      io.to(`chat:${channelId}`).emit('chat:message:updated', {
        messageId: parentMessageId,
        channelId,
        replyCount: parentMessage.replyCount,
        lastReplyAt: parentMessage.lastReplyAt,
        threadParticipants: parentMessage.threadParticipants
      });

      // Notify thread followers individually
      if (parentMessage.threadFollowers) {
        parentMessage.threadFollowers.forEach((follower) => {
          if (follower.following && follower.userId._id.toString() !== userId) {
            io.to(`user:${follower.userId._id}`).emit('thread:new_reply', {
              parentMessageId,
              channelId,
              message,
              timestamp: new Date()
            });
          }
        });
      }

      console.log(`✅ Thread reply broadcasted for ${parentMessageId}`);
    } catch (error) {
      console.error('Error broadcasting thread reply:', error);
    }
  });

  // Thread follow status changed
  socket.on('chat:thread:follow', async (data) => {
    try {
      const { parentMessageId, following } = data;

      console.log(`🔔 User ${userId} ${following ? 'followed' : 'unfollowed'} thread ${parentMessageId}`);

      // Acknowledge to the user
      socket.emit('chat:thread:follow:success', {
        parentMessageId,
        following
      });
    } catch (error) {
      console.error('Error handling thread follow:', error);
    }
  });

  // Channel created
  socket.on('chat:channel:created', async (data) => {
    try {
      const { channel } = data;

      // Add all members to channel room
      channel.members.forEach((member) => {
        const memberPresence = userPresence.get(member.userId.toString());
        if (memberPresence && memberPresence.socketId) {
          const memberSocket = io.sockets.sockets.get(memberPresence.socketId);
          if (memberSocket) {
            memberSocket.join(`chat:${channel._id}`);
          }
        }
      });

      // Notify all members about new channel
      io.to(`chat:${channel._id}`).emit('chat:channel:new', {
        channel,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error broadcasting new channel:', error);
    }
  });

  // Channel updated
  socket.on('chat:channel:update', async (data) => {
    try {
      const { channel } = data;

      // Broadcast to channel members
      io.to(`chat:${channel._id}`).emit('chat:channel:updated', {
        channel,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error broadcasting channel update:', error);
    }
  });

  // Channel deleted
  socket.on('chat:channel:delete', async (data) => {
    try {
      const { channelId } = data;

      // Notify all members
      io.to(`chat:${channelId}`).emit('chat:channel:deleted', {
        channelId,
        timestamp: new Date()
      });

      // Remove all sockets from this room
      io.in(`chat:${channelId}`).socketsLeave(`chat:${channelId}`);
    } catch (error) {
      console.error('Error broadcasting channel deletion:', error);
    }
  });

  // Update user presence status
  socket.on('chat:presence:update', async (data) => {
    try {
      const { status } = data; // 'online', 'away', 'offline'

      userPresence.set(userId.toString(), {
        status,
        lastSeen: new Date(),
        socketId: socket.id
      });

      // Get all user's channels and broadcast to them
      const channels = await ChatChannel.find({
        'members.userId': userId
      });

      channels.forEach((channel) => {
        socket.to(`chat:${channel._id}`).emit('chat:user:presence', {
          userId,
          status,
          lastSeen: new Date()
        });
      });
    } catch (error) {
      console.error('Error updating presence:', error);
    }
  });

  // Handle user presence update from client
  socket.on('user:presence:update', async (data) => {
    try {
      const { status, customStatus } = data;
      const UserPresence = require('../models/UserPresence');

      // Update presence in database
      let presence = await UserPresence.findOne({ userId });

      if (!presence) {
        presence = new UserPresence({ userId });
      }

      if (status) {
        presence.status = status;
        presence.isOnline = status === 'active' || status === 'dnd';
        presence.lastActiveAt = new Date();
      }

      if (customStatus !== undefined) {
        if (customStatus === null) {
          presence.customStatus = undefined;
        } else {
          presence.customStatus = customStatus;
        }
      }

      await presence.save();

      // Broadcast to all connected clients
      io.emit('user:presence:updated', {
        userId: userId.toString(),
        status: presence.status,
        customStatus: presence.customStatus,
        isOnline: presence.isOnline,
        lastActiveAt: presence.lastActiveAt
      });
    } catch (error) {
      console.error('Error updating presence:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    try {
      // Set user as offline
      userPresence.set(userId.toString(), {
        status: 'offline',
        lastSeen: new Date(),
        socketId: null
      });

      // Get all user's channels and broadcast offline status
      const channels = await ChatChannel.find({
        'members.userId': userId
      });

      channels.forEach((channel) => {
        // Remove from typing indicators
        const typingSet = typingUsers.get(channel._id.toString());
        if (typingSet) {
          typingSet.delete(userId.toString());
          if (typingSet.size === 0) {
            typingUsers.delete(channel._id.toString());
          }
        }

        // Broadcast offline status
        io.to(`chat:${channel._id}`).emit('chat:user:presence', {
          userId,
          status: 'offline',
          lastSeen: new Date()
        });
      });
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
};

// Helper function to get user presence
const getUserPresence = (userId) => {
  return userPresence.get(userId.toString()) || {
    status: 'offline',
    lastSeen: null,
    socketId: null
  };
};

// Helper function to get typing users in channel
const getTypingUsers = (channelId) => {
  const typingSet = typingUsers.get(channelId);
  return typingSet ? Array.from(typingSet) : [];
};

module.exports.getUserPresence = getUserPresence;
module.exports.getTypingUsers = getTypingUsers;
