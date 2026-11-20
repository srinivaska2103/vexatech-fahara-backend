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
    // Join customer notification room
    socket.on('join_user', (userId) => {
      if (userId) {
        const room = `user_${userId}`;
        socket.join(room);
      }
    });

    // Join order live delivery tracking room
    socket.on('join_order_tracking', (orderId) => {
      if (orderId) {
        const room = `order_tracking_${orderId}`;
        socket.join(room);
        console.log(`[WebSocket] Client ${socket.id} joined tracking room: ${room}`);
      }
    });

    socket.on('leave_order_tracking', (orderId) => {
      if (orderId) {
        const room = `order_tracking_${orderId}`;
        socket.leave(room);
        console.log(`[WebSocket] Client ${socket.id} left tracking room: ${room}`);
      }
    });

    socket.on('disconnect', () => {
      // Clean disconnect
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
    io.to(room).emit('user_notification_event', { userId, notification });
  } catch (err) {
    console.error('[WebSocket] Error emitting notification:', err.message);
  }
};

const emitDeliveryLocationUpdate = (orderId, locationData) => {
  if (!io) return;
  try {
    const room = `order_tracking_${orderId}`;
    io.to(room).emit('delivery_location_update', locationData);
  } catch (err) {
    console.error('[WebSocket] Error emitting delivery location:', err.message);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitNotificationToUser,
  emitDeliveryLocationUpdate
};
