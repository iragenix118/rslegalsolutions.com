const webpush = require('web-push');
const socketio = require('socket.io');
const logger = require('./logger');
const cache = require('./cache');
const { ServiceError } = require('./errors');
require('dotenv').config();

class NotificationService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
    this.notificationTypes = {
      APPOINTMENT: 'appointment',
      PAYMENT: 'payment',
      CASE_UPDATE: 'case_update',
      DOCUMENT: 'document',
      SYSTEM: 'system',
      CHAT: 'chat'
    };

    this.initialize();
  }

  // Initialize notification service
  initialize() {
    try {
      // Configure web push
      webpush.setVapidDetails(
        'mailto:' + process.env.VAPID_EMAIL,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );

      logger.info('Notification service initialized');
    } catch (error) {
      logger.error('Notification service initialization failed:', error);
      throw new ServiceError('Notification service initialization failed', 'notifications');
    }
  }

  // Initialize Socket.IO
  setupSocketIO(server) {
    this.io = socketio(server, {
      cors: {
        origin: process.env.CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.io.on('connection', this.handleConnection.bind(this));
    logger.info('Socket.IO initialized');
  }

  // Handle socket connection
  handleConnection(socket) {
    logger.debug('New socket connection:', socket.id);

    socket.on('authenticate', async (token) => {
      try {
        const user = await this.verifyToken(token);
        this.connectedUsers.set(user.id, socket.id);
        socket.userId = user.id;
        
        // Join user-specific room
        socket.join(`user:${user.id}`);
        
        // Send pending notifications
        await this.sendPendingNotifications(user.id);
        
        logger.debug(`User authenticated: ${user.id}`);
      } catch (error) {
        logger.error('Socket authentication failed:', error);
        socket.disconnect();
      }
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        this.connectedUsers.delete(socket.userId);
        logger.debug(`User disconnected: ${socket.userId}`);
      }
    });
  }

  // Send in-app notification
  async sendInAppNotification(userId, notification) {
    try {
      const socketId = this.connectedUsers.get(userId);
      const formattedNotification = this.formatNotification(notification);

      // Store notification in database
      await this.saveNotification(userId, formattedNotification);

      // Send to connected user if online
      if (socketId) {
        this.io.to(socketId).emit('notification', formattedNotification);
        logger.debug(`In-app notification sent to user: ${userId}`);
      }

      return formattedNotification;
    } catch (error) {
      logger.error('Failed to send in-app notification:', error);
      throw error;
    }
  }

  // Send push notification
  async sendPushNotification(subscription, notification) {
    try {
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.message,
        icon: notification.icon || '/logo.png',
        badge: '/badge.png',
        data: {
          url: notification.url
        }
      });

      await webpush.sendNotification(subscription, payload);
      logger.debug('Push notification sent:', notification.title);
    } catch (error) {
      logger.error('Failed to send push notification:', error);
      throw error;
    }
  }

  // Send notification to multiple users
  async broadcastNotification(userIds, notification) {
    try {
      const promises = userIds.map(userId =>
        this.sendInAppNotification(userId, notification)
      );
      await Promise.all(promises);
      logger.info(`Broadcast notification sent to ${userIds.length} users`);
    } catch (error) {
      logger.error('Failed to broadcast notification:', error);
      throw error;
    }
  }

  // Format notification
  formatNotification(notification) {
    return {
      id: notification.id || Date.now().toString(),
      type: notification.type || this.notificationTypes.SYSTEM,
      title: notification.title,
      message: notification.message,
      icon: notification.icon,
      url: notification.url,
      metadata: notification.metadata || {},
      createdAt: new Date(),
      read: false
    };
  }

  // Save notification to database
  async saveNotification(userId, notification) {
    try {
      const result = await global.db.collection('notifications').insertOne({
        userId,
        ...notification
      });
      return result.insertedId;
    } catch (error) {
      logger.error('Failed to save notification:', error);
      throw error;
    }
  }

  // Send pending notifications
  async sendPendingNotifications(userId) {
    try {
      const notifications = await global.db.collection('notifications')
        .find({
          userId,
          read: false
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      if (notifications.length > 0) {
        const socketId = this.connectedUsers.get(userId);
        this.io.to(socketId).emit('pending_notifications', notifications);
      }
    } catch (error) {
      logger.error('Failed to send pending notifications:', error);
    }
  }

  // Mark notification as read
  async markAsRead(userId, notificationId) {
    try {
      await global.db.collection('notifications').updateOne(
        { _id: notificationId, userId },
        { $set: { read: true, readAt: new Date() } }
      );
      return true;
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  // Get user notifications
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        unreadOnly = false
      } = options;

      const query = { userId };
      if (unreadOnly) {
        query.read = false;
      }

      const notifications = await global.db.collection('notifications')
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      const total = await global.db.collection('notifications')
        .countDocuments(query);

      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get user notifications:', error);
      throw error;
    }
  }

  // Subscribe to push notifications
  async subscribeToPush(userId, subscription) {
    try {
      await global.db.collection('push_subscriptions').updateOne(
        { userId },
        {
          $set: {
            subscription,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      return true;
    } catch (error) {
      logger.error('Failed to subscribe to push notifications:', error);
      throw error;
    }
  }

  // Unsubscribe from push notifications
  async unsubscribeFromPush(userId) {
    try {
      await global.db.collection('push_subscriptions').deleteOne({ userId });
      return true;
    } catch (error) {
      logger.error('Failed to unsubscribe from push notifications:', error);
      throw error;
    }
  }

  // Clean up old notifications
  async cleanupOldNotifications(days = 30) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const result = await global.db.collection('notifications').deleteMany({
        createdAt: { $lt: cutoff }
      });

      logger.info(`Cleaned up ${result.deletedCount} old notifications`);
      return result.deletedCount;
    } catch (error) {
      logger.error('Failed to clean up old notifications:', error);
      throw error;
    }
  }

  // Verify authentication token
  async verifyToken(token) {
    // Implementation depends on your authentication system
    // This is just a placeholder
    return { id: 'user_id' };
  }
}

// Export singleton instance
module.exports = new NotificationService();
