const { Server } = require('socket.io');

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    },
  });

  io.on('connection', (socket) => {
    console.log('[WebSocket] Client connected:', socket.id);

    socket.on('join_user', (userId) => {
      if (userId) {
        const room = `user_${userId}`;
        socket.join(room);
        console.log(`[WebSocket] Client ${socket.id} joined room: ${room}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('[WebSocket] Client disconnected:', socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    console.warn('[WebSocket] Warning: socket.io is not initialized yet.');
  }
  return io;
};

const emitNotificationToUser = (userId, notification) => {
  if (!io) return;
  try {
    const room = `user_${userId}`;
    io.to(room).emit('new_notification', notification);
    io.emit('global_notification_event', { userId, notification });
    console.log(`[WebSocket] Emitted live notification to room: ${room}`);
  } catch (err) {
    console.error('[WebSocket] Error emitting notification:', err.message);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitNotificationToUser,
};
