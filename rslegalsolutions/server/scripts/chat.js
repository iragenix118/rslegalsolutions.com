const socketio = require('socket.io');
const mongoose = require('mongoose');
const logger = require('./logger');
const cache = require('./cache');
const notifications = require('./notifications');
const { ServiceError } = require('./errors');
require('dotenv').config();

class ChatService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
    this.activeChats = new Map();
    this.messageTypes = {
      TEXT: 'text',
      FILE: 'file',
      SYSTEM: 'system'
    };

    this.initialize();
  }

  // Initialize chat service
  initialize() {
    try {
      // Create message schema if not exists
      this.createMessageSchema();
      logger.info('Chat service initialized');
    } catch (error) {
      logger.error('Chat service initialization failed:', error);
      throw new ServiceError('Chat service initialization failed', 'chat');
    }
  }

  // Create message schema
  createMessageSchema() {
    const messageSchema = new mongoose.Schema({
      chatId: { type: String, required: true, index: true },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      content: { type: String, required: true },
      type: { type: String, enum: Object.values(this.messageTypes), default: 'text' },
      metadata: { type: Map, of: String },
      attachments: [{
        filename: String,
        url: String,
        type: String,
        size: Number
      }],
      readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    });

    messageSchema.index({ chatId: 1, createdAt: -1 });
    
    try {
      mongoose.model('Message', messageSchema);
    } catch (error) {
      // Model already exists
    }
  }

  // Setup Socket.IO for chat
  setupSocketIO(server) {
    this.io = socketio(server, {
      path: '/chat',
      cors: {
        origin: process.env.CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));
    logger.info('Chat Socket.IO initialized');
  }

  // Authenticate socket connection
  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        throw new Error('Authentication required');
      }

      const user = await this.verifyToken(token);
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  }

  // Handle socket connection
  handleConnection(socket) {
    const userId = socket.user.id;
    logger.debug('New chat connection:', userId);

    // Store socket connection
    this.connectedUsers.set(userId, socket);

    // Join user's room
    socket.join(`user:${userId}`);

    // Handle events
    socket.on('join_chat', (chatId) => this.handleJoinChat(socket, chatId));
    socket.on('leave_chat', (chatId) => this.handleLeaveChat(socket, chatId));
    socket.on('message', (data) => this.handleMessage(socket, data));
    socket.on('typing', (data) => this.handleTyping(socket, data));
    socket.on('read_messages', (data) => this.handleReadMessages(socket, data));
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  // Handle joining a chat
  async handleJoinChat(socket, chatId) {
    try {
      const userId = socket.user.id;
      
      // Verify user has access to this chat
      await this.verifyAccess(userId, chatId);

      // Join chat room
      socket.join(`chat:${chatId}`);
      this.activeChats.set(`${userId}:${chatId}`, true);

      // Send recent messages
      const messages = await this.getRecentMessages(chatId);
      socket.emit('recent_messages', messages);

      // Notify other participants
      socket.to(`chat:${chatId}`).emit('user_joined', {
        userId,
        timestamp: new Date()
      });

      logger.debug(`User ${userId} joined chat ${chatId}`);
    } catch (error) {
      logger.error('Failed to join chat:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  }

  // Handle leaving a chat
  handleLeaveChat(socket, chatId) {
    const userId = socket.user.id;
    
    socket.leave(`chat:${chatId}`);
    this.activeChats.delete(`${userId}:${chatId}`);

    socket.to(`chat:${chatId}`).emit('user_left', {
      userId,
      timestamp: new Date()
    });

    logger.debug(`User ${userId} left chat ${chatId}`);
  }

  // Handle new message
  async handleMessage(socket, data) {
    try {
      const { chatId, content, type = 'text', metadata = {} } = data;
      const sender = socket.user.id;

      // Create message
      const message = await this.createMessage({
        chatId,
        sender,
        content,
        type,
        metadata
      });

      // Broadcast to chat participants
      this.io.to(`chat:${chatId}`).emit('new_message', message);

      // Send notifications to offline participants
      await this.notifyOfflineParticipants(chatId, message);

      logger.debug(`New message in chat ${chatId} from ${sender}`);
    } catch (error) {
      logger.error('Failed to handle message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  // Handle typing indicator
  handleTyping(socket, { chatId, isTyping }) {
    const userId = socket.user.id;
    
    socket.to(`chat:${chatId}`).emit('typing', {
      userId,
      isTyping,
      timestamp: new Date()
    });
  }

  // Handle marking messages as read
  async handleReadMessages(socket, { chatId, messageIds }) {
    try {
      const userId = socket.user.id;

      await this.markMessagesAsRead(chatId, messageIds, userId);

      socket.to(`chat:${chatId}`).emit('messages_read', {
        userId,
        messageIds,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to mark messages as read:', error);
    }
  }

  // Handle disconnection
  handleDisconnect(socket) {
    const userId = socket.user.id;
    this.connectedUsers.delete(userId);
    logger.debug(`User disconnected from chat: ${userId}`);
  }

  // Create new message
  async createMessage(data) {
    const Message = mongoose.model('Message');
    const message = new Message(data);
    await message.save();
    return message;
  }

  // Get recent messages
  async getRecentMessages(chatId, limit = 50) {
    const Message = mongoose.model('Message');
    return Message.find({ chatId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'name avatar')
      .lean();
  }

  // Mark messages as read
  async markMessagesAsRead(chatId, messageIds, userId) {
    const Message = mongoose.model('Message');
    await Message.updateMany(
      {
        _id: { $in: messageIds },
        chatId,
        readBy: { $ne: userId }
      },
      {
        $addToSet: { readBy: userId }
      }
    );
  }

  // Notify offline participants
  async notifyOfflineParticipants(chatId, message) {
    try {
      const participants = await this.getChatParticipants(chatId);
      const offlineParticipants = participants.filter(
        userId => !this.connectedUsers.has(userId)
      );

      if (offlineParticipants.length > 0) {
        await notifications.broadcastNotification(offlineParticipants, {
          type: 'chat',
          title: 'New Message',
          message: `New message in chat ${chatId}`,
          metadata: {
            chatId,
            messageId: message._id
          }
        });
      }
    } catch (error) {
      logger.error('Failed to notify offline participants:', error);
    }
  }

  // Get chat participants
  async getChatParticipants(chatId) {
    // Implementation depends on your chat model structure
    return ['user1', 'user2']; // Placeholder
  }

  // Verify user access to chat
  async verifyAccess(userId, chatId) {
    // Implementation depends on your access control logic
    return true; // Placeholder
  }

  // Verify authentication token
  async verifyToken(token) {
    // Implementation depends on your authentication system
    return { id: 'user_id' }; // Placeholder
  }

  // Clean up old messages
  async cleanupOldMessages(days = 30) {
    try {
      const Message = mongoose.model('Message');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const result = await Message.deleteMany({
        createdAt: { $lt: cutoff }
      });

      logger.info(`Cleaned up ${result.deletedCount} old messages`);
      return result.deletedCount;
    } catch (error) {
      logger.error('Failed to clean up old messages:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new ChatService();
