const User = require('../models/User');

// Store active users per workspace
const workspaceUsers = new Map(); // workspaceId -> Set of {userId, userName, userEmail, socketId, cursor}
const userWorkspaces = new Map(); // socketId -> workspaceId

module.exports = (io) => {
  io.on('connection', (socket) => {

    // Join workspace room
    socket.on('workspace:join', async (data) => {
      try {
        // Ensure socket is authenticated
        if (!socket.userId) {
          socket.emit('error', { message: 'Socket not authenticated' });
          return;
        }

        const { workspaceId } = data;
        if (!workspaceId) {
          socket.emit('error', { message: 'Workspace ID required' });
          return;
        }

        // Leave previous workspace if any
        const previousWorkspace = userWorkspaces.get(socket.id);
        if (previousWorkspace) {
          socket.leave(`workspace:${previousWorkspace}`);
          removeUserFromWorkspace(previousWorkspace, socket.id);

          // Notify others in previous workspace
          io.to(`workspace:${previousWorkspace}`).emit('workspace:user:left', {
            userId: socket.userId,
            userName: socket.userName,
            timestamp: new Date()
          });
        }

        // Fetch user details
        const user = await User.findById(socket.userId).select('name email');
        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        // Join new workspace
        socket.join(`workspace:${workspaceId}`);
        userWorkspaces.set(socket.id, workspaceId);

        // Add user to workspace users map
        if (!workspaceUsers.has(workspaceId)) {
          workspaceUsers.set(workspaceId, new Set());
        }

        const userInfo = {
          userId: socket.userId,
          userName: user.name,
          userEmail: user.email,
          socketId: socket.id,
          cursor: null,
          joinedAt: new Date()
        };

        socket.userName = user.name; // Store on socket for quick access

        const workspaceUserSet = workspaceUsers.get(workspaceId);
        // Remove any previous entries for this user (in case of reconnection)
        for (const u of workspaceUserSet) {
          if (u.userId === socket.userId) {
            workspaceUserSet.delete(u);
          }
        }
        workspaceUserSet.add(userInfo);

        // Get all users in workspace
        const usersInWorkspace = Array.from(workspaceUserSet).map(u => ({
          userId: u.userId,
          userName: u.userName,
          userEmail: u.userEmail,
          cursor: u.cursor,
          joinedAt: u.joinedAt
        }));

        // Notify current user about all users in workspace
        socket.emit('workspace:users:list', {
          users: usersInWorkspace
        });

        // Notify others that a new user joined
        socket.to(`workspace:${workspaceId}`).emit('workspace:user:joined', {
          userId: socket.userId,
          userName: user.name,
          userEmail: user.email,
          timestamp: new Date()
        });

        console.log(`👤 User ${user.name} (${socket.userId}) joined workspace ${workspaceId}`);
      } catch (error) {
        console.error('❌ Error joining workspace:', error);
        socket.emit('error', { message: 'Failed to join workspace' });
      }
    });

    // Update cursor position
    socket.on('workspace:cursor:update', (data) => {
      try {
        const workspaceId = userWorkspaces.get(socket.id);
        if (!workspaceId) return;

        const { x, y, elementId } = data;

        // Update cursor in workspace users map
        const workspaceUserSet = workspaceUsers.get(workspaceId);
        if (workspaceUserSet) {
          for (const user of workspaceUserSet) {
            if (user.socketId === socket.id) {
              user.cursor = { x, y, elementId, timestamp: Date.now() };
              break;
            }
          }
        }

        // Broadcast cursor update to others in workspace
        socket.to(`workspace:${workspaceId}`).emit('workspace:cursor:moved', {
          userId: socket.userId,
          userName: socket.userName,
          cursor: { x, y, elementId },
          timestamp: new Date()
        });
      } catch (error) {
        console.error('❌ Error updating cursor:', error);
      }
    });

    // User started editing an element
    socket.on('workspace:element:editing:start', (data) => {
      try {
        const workspaceId = userWorkspaces.get(socket.id);
        if (!workspaceId) return;

        const { elementId } = data;

        // Broadcast to others in workspace
        socket.to(`workspace:${workspaceId}`).emit('workspace:element:editing:started', {
          userId: socket.userId,
          userName: socket.userName,
          elementId,
          timestamp: new Date()
        });

        console.log(`✏️  User ${socket.userName} started editing element ${elementId}`);
      } catch (error) {
        console.error('❌ Error broadcasting element editing start:', error);
      }
    });

    // User stopped editing an element
    socket.on('workspace:element:editing:stop', (data) => {
      try {
        const workspaceId = userWorkspaces.get(socket.id);
        if (!workspaceId) return;

        const { elementId } = data;

        // Broadcast to others in workspace
        socket.to(`workspace:${workspaceId}`).emit('workspace:element:editing:stopped', {
          userId: socket.userId,
          userName: socket.userName,
          elementId,
          timestamp: new Date()
        });

        console.log(`✏️  User ${socket.userName} stopped editing element ${elementId}`);
      } catch (error) {
        console.error('❌ Error broadcasting element editing stop:', error);
      }
    });

    // Element created notification
    socket.on('workspace:element:created', (data) => {
      try {
        const workspaceId = userWorkspaces.get(socket.id);
        if (!workspaceId) return;

        const { element } = data;

        // Broadcast to others in workspace
        socket.to(`workspace:${workspaceId}`).emit('workspace:element:created:notify', {
          userId: socket.userId,
          userName: socket.userName,
          element,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('❌ Error broadcasting element created:', error);
      }
    });

    // Element updated notification
    socket.on('workspace:element:updated', (data) => {
      try {
        const workspaceId = userWorkspaces.get(socket.id);
        if (!workspaceId) return;

        const { element } = data;

        // Broadcast to others in workspace
        socket.to(`workspace:${workspaceId}`).emit('workspace:element:updated:notify', {
          userId: socket.userId,
          userName: socket.userName,
          element,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('❌ Error broadcasting element updated:', error);
      }
    });

    // Element deleted notification
    socket.on('workspace:element:deleted', (data) => {
      try {
        const workspaceId = userWorkspaces.get(socket.id);
        if (!workspaceId) return;

        const { elementId } = data;

        // Broadcast to others in workspace
        socket.to(`workspace:${workspaceId}`).emit('workspace:element:deleted:notify', {
          userId: socket.userId,
          userName: socket.userName,
          elementId,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('❌ Error broadcasting element deleted:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const workspaceId = userWorkspaces.get(socket.id);
      if (workspaceId) {
        removeUserFromWorkspace(workspaceId, socket.id);
        userWorkspaces.delete(socket.id);

        // Notify others in workspace
        io.to(`workspace:${workspaceId}`).emit('workspace:user:left', {
          userId: socket.userId,
          userName: socket.userName,
          timestamp: new Date()
        });

        console.log(`👤 User ${socket.userName} (${socket.userId}) left workspace ${workspaceId}`);
      }
    });
  });

  // Helper function to remove user from workspace
  function removeUserFromWorkspace(workspaceId, socketId) {
    const workspaceUserSet = workspaceUsers.get(workspaceId);
    if (workspaceUserSet) {
      for (const user of workspaceUserSet) {
        if (user.socketId === socketId) {
          workspaceUserSet.delete(user);
          break;
        }
      }
      // Clean up empty workspace sets
      if (workspaceUserSet.size === 0) {
        workspaceUsers.delete(workspaceId);
      }
    }
  }
};
