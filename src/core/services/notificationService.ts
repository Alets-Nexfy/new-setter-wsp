import { db } from '../config/firebase';
import { Notification, NotificationType, NotificationStatus, CreateNotificationDto, UpdateNotificationDto } from '../types/notification';
import { User } from '../types/user';
import { logger } from '../utils/logger';

export class NotificationService {
  private readonly notificationsCollection = 'notifications';
  private readonly usersCollection = 'users';

  /**
   * Create a new notification
   */
  async createNotification(data: CreateNotificationDto): Promise<Notification> {
    try {
      const notification: Notification = {
        id: '',
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data || {},
        status: NotificationStatus.UNREAD,
        priority: data.priority || 'normal',
        createdAt: new Date(),
        updatedAt: new Date(),
        readAt: null,
        expiresAt: data.expiresAt || null
      };

      const docRef = await db.collection(this.notificationsCollection).add(notification);
      notification.id = docRef.id;

      await docRef.update({ id: docRef.id });

      logger.info(`Notification created: ${docRef.id} for user: ${data.userId}`);
      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw new Error('Failed to create notification');
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId: string, options: {
    status?: NotificationStatus;
    type?: NotificationType;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ notifications: Notification[]; total: number }> {
    try {
      let query = db.collection(this.notificationsCollection)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc');

      if (options.status) {
        query = query.where('status', '==', options.status);
      }

      if (options.type) {
        query = query.where('type', '==', options.type);
      }

      const snapshot = await query.get();
      const notifications: Notification[] = [];

      snapshot.forEach(doc => {
        const data = doc.data() as Notification;
        notifications.push(data);
      });

      // Apply pagination
      const total = notifications.length;
      const start = options.offset || 0;
      const end = start + (options.limit || 50);
      const paginatedNotifications = notifications.slice(start, end);

      return {
        notifications: paginatedNotifications,
        total
      };
    } catch (error) {
      logger.error('Error getting user notifications:', error);
      throw new Error('Failed to get user notifications');
    }
  }

  /**
   * Get a specific notification
   */
  async getNotification(notificationId: string): Promise<Notification | null> {
    try {
      const doc = await db.collection(this.notificationsCollection).doc(notificationId).get();
      
      if (!doc.exists) {
        return null;
      }

      return doc.data() as Notification;
    } catch (error) {
      logger.error('Error getting notification:', error);
      throw new Error('Failed to get notification');
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await db.collection(this.notificationsCollection).doc(notificationId).update({
        status: NotificationStatus.READ,
        readAt: new Date(),
        updatedAt: new Date()
      });

      logger.info(`Notification marked as read: ${notificationId}`);
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw new Error('Failed to mark notification as read');
    }
  }

  /**
   * Mark all user notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const batch = db.batch();
      const snapshot = await db.collection(this.notificationsCollection)
        .where('userId', '==', userId)
        .where('status', '==', NotificationStatus.UNREAD)
        .get();

      snapshot.forEach(doc => {
        batch.update(doc.ref, {
          status: NotificationStatus.READ,
          readAt: new Date(),
          updatedAt: new Date()
        });
      });

      await batch.commit();
      logger.info(`All notifications marked as read for user: ${userId}`);
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw new Error('Failed to mark all notifications as read');
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await db.collection(this.notificationsCollection).doc(notificationId).delete();
      logger.info(`Notification deleted: ${notificationId}`);
    } catch (error) {
      logger.error('Error deleting notification:', error);
      throw new Error('Failed to delete notification');
    }
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAllUserNotifications(userId: string): Promise<void> {
    try {
      const batch = db.batch();
      const snapshot = await db.collection(this.notificationsCollection)
        .where('userId', '==', userId)
        .get();

      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      logger.info(`All notifications deleted for user: ${userId}`);
    } catch (error) {
      logger.error('Error deleting all user notifications:', error);
      throw new Error('Failed to delete all user notifications');
    }
  }

  /**
   * Send system notification to all users
   */
  async sendSystemNotification(data: {
    title: string;
    message: string;
    type: NotificationType;
    priority?: string;
    data?: Record<string, any>;
  }): Promise<void> {
    try {
      const usersSnapshot = await db.collection(this.usersCollection).get();
      const batch = db.batch();

      usersSnapshot.forEach(userDoc => {
        const notificationRef = db.collection(this.notificationsCollection).doc();
        const notification: Notification = {
          id: notificationRef.id,
          userId: userDoc.id,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.data || {},
          status: NotificationStatus.UNREAD,
          priority: data.priority || 'normal',
          createdAt: new Date(),
          updatedAt: new Date(),
          readAt: null,
          expiresAt: null
        };

        batch.set(notificationRef, notification);
      });

      await batch.commit();
      logger.info(`System notification sent to ${usersSnapshot.size} users`);
    } catch (error) {
      logger.error('Error sending system notification:', error);
      throw new Error('Failed to send system notification');
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId?: string): Promise<{
    total: number;
    unread: number;
    read: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  }> {
    try {
      let query = db.collection(this.notificationsCollection);
      
      if (userId) {
        query = query.where('userId', '==', userId);
      }

      const snapshot = await query.get();
      const stats = {
        total: 0,
        unread: 0,
        read: 0,
        byType: {} as Record<string, number>,
        byPriority: {} as Record<string, number>
      };

      snapshot.forEach(doc => {
        const data = doc.data() as Notification;
        stats.total++;

        if (data.status === NotificationStatus.UNREAD) {
          stats.unread++;
        } else {
          stats.read++;
        }

        stats.byType[data.type] = (stats.byType[data.type] || 0) + 1;
        stats.byPriority[data.priority] = (stats.byPriority[data.priority] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      throw new Error('Failed to get notification stats');
    }
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications(): Promise<number> {
    try {
      const now = new Date();
      const snapshot = await db.collection(this.notificationsCollection)
        .where('expiresAt', '<', now)
        .get();

      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      logger.info(`Cleaned up ${snapshot.size} expired notifications`);
      return snapshot.size;
    } catch (error) {
      logger.error('Error cleaning up expired notifications:', error);
      throw new Error('Failed to cleanup expired notifications');
    }
  }

  /**
   * Get unread notification count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const snapshot = await db.collection(this.notificationsCollection)
        .where('userId', '==', userId)
        .where('status', '==', NotificationStatus.UNREAD)
        .get();

      return snapshot.size;
    } catch (error) {
      logger.error('Error getting unread count:', error);
      throw new Error('Failed to get unread count');
    }
  }
} 