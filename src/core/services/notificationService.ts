import { SupabaseService } from './SupabaseService';
import { Notification, NotificationType, NotificationStatus, CreateNotificationDto, UpdateNotificationDto } from '../types/notification';
// User type temporarily removed - import from correct location when available
import { LoggerService } from './LoggerService';

export class NotificationService {
  private static instance: NotificationService;
  private db: SupabaseService;
  private logger: LoggerService;
  private readonly notificationsTable = 'notifications';
  private readonly usersTable = 'users';

  private constructor() {
    this.db = SupabaseService.getInstance();
    this.logger = LoggerService.getInstance();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

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
        priority: (data.priority || 'normal') as 'low' | 'normal' | 'high' | 'urgent',
        createdAt: new Date(),
        updatedAt: new Date(),
        readAt: null,
        expiresAt: data.expiresAt || null
      };

      const { data: result, error } = await this.db
        .from(this.notificationsTable)
        .insert({
          user_id: notification.userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          status: notification.status,
          priority: notification.priority,
          created_at: notification.createdAt.toISOString(),
          updated_at: notification.updatedAt.toISOString(),
          expires_at: notification.expiresAt?.toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      notification.id = result.id;

      this.logger.info(`Notification created: ${result.id} for user: ${data.userId}`);
      return notification;
    } catch (error) {
      this.logger.error('Error creating notification:', error);
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
      let query = this.db
        .from(this.notificationsTable)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options.status) {
        query = query.eq('status', options.status);
      }

      if (options.type) {
        query = query.eq('type', options.type);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const notifications = data?.map(item => this.mapFromDatabase(item)) || [];

      return {
        notifications,
        total: count || notifications.length
      };
    } catch (error) {
      this.logger.error('Error getting user notifications:', error);
      throw new Error('Failed to get user notifications');
    }
  }

  /**
   * Get a specific notification
   */
  async getNotification(notificationId: string): Promise<Notification | null> {
    try {
      const { data, error } = await this.db
        .from(this.notificationsTable)
        .select('*')
        .eq('id', notificationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return this.mapFromDatabase(data);
    } catch (error) {
      this.logger.error('Error getting notification:', error);
      throw new Error('Failed to get notification');
    }
  }

  /**
   * Update a notification
   */
  async updateNotification(notificationId: string, updateData: UpdateNotificationDto): Promise<Notification | null> {
    try {
      const dbData = this.mapToDatabase(updateData);
      const { error } = await this.db
        .from(this.notificationsTable)
        .update({
          ...dbData,
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (error) throw error;
      return await this.getNotification(notificationId);
    } catch (error) {
      this.logger.error('Error updating notification:', error);
      throw new Error('Failed to update notification');
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const { error } = await this.db
        .from(this.notificationsTable)
        .update({
          status: NotificationStatus.READ,
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', notificationId);

      if (error) throw error;
      this.logger.info(`Notification marked as read: ${notificationId}`);
    } catch (error) {
      this.logger.error('Error marking notification as read:', error);
      throw new Error('Failed to mark notification as read');
    }
  }

  /**
   * Mark all user notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const { error } = await this.db
        .from(this.notificationsTable)
        .update({
          status: NotificationStatus.READ,
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', NotificationStatus.UNREAD);

      if (error) throw error;
      this.logger.info(`All notifications marked as read for user: ${userId}`);
    } catch (error) {
      this.logger.error('Error marking all notifications as read:', error);
      throw new Error('Failed to mark all notifications as read');
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      const { error } = await this.db
        .from(this.notificationsTable)
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
      this.logger.info(`Notification deleted: ${notificationId}`);
    } catch (error) {
      this.logger.error('Error deleting notification:', error);
      throw new Error('Failed to delete notification');
    }
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAllUserNotifications(userId: string): Promise<void> {
    try {
      const { error } = await this.db
        .from(this.notificationsTable)
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
      this.logger.info(`All notifications deleted for user: ${userId}`);
    } catch (error) {
      this.logger.error('Error deleting all user notifications:', error);
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
      // Get all users
      const { data: users, error: usersError } = await this.db
        .from(this.usersTable)
        .select('id');

      if (usersError) throw usersError;
      if (!users || users.length === 0) {
        this.logger.info('No users found for system notification');
        return;
      }

      // Create notifications for all users
      const notifications = users.map(user => ({
        user_id: user.id,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data || {},
        status: NotificationStatus.UNREAD,
        priority: (data.priority || 'normal') as 'low' | 'normal' | 'high' | 'urgent',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        read_at: null,
        expires_at: null
      }));

      const { error } = await this.db
        .from(this.notificationsTable)
        .insert(notifications);

      if (error) throw error;
      this.logger.info(`System notification sent to ${users.length} users`);
    } catch (error) {
      this.logger.error('Error sending system notification:', error);
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
      let query = this.db.from(this.notificationsTable).select('*');
      
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: notifications, error } = await query;
      if (error) throw error;
      const stats = {
        total: 0,
        unread: 0,
        read: 0,
        byType: {} as Record<string, number>,
        byPriority: {} as Record<string, number>
      };

      notifications?.forEach(notification => {
        stats.total++;

        if (notification.status === NotificationStatus.UNREAD) {
          stats.unread++;
        } else {
          stats.read++;
        }

        stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
        stats.byPriority[notification.priority] = (stats.byPriority[notification.priority] || 0) + 1;
      });

      return stats;
    } catch (error) {
      this.logger.error('Error getting notification stats:', error);
      throw new Error('Failed to get notification stats');
    }
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications(): Promise<number> {
    try {
      const now = new Date().toISOString();
      
      // First get count of expired notifications
      const { data: expiredNotifications, error: countError } = await this.db
        .from(this.notificationsTable)
        .select('id')
        .lt('expires_at', now)
        .not('expires_at', 'is', null);

      if (countError) throw countError;
      const expiredCount = expiredNotifications?.length || 0;

      if (expiredCount > 0) {
        // Delete expired notifications
        const { error: deleteError } = await this.db
          .from(this.notificationsTable)
          .delete()
          .lt('expires_at', now)
          .not('expires_at', 'is', null);

        if (deleteError) throw deleteError;
      }

      this.logger.info(`Cleaned up ${expiredCount} expired notifications`);
      return expiredCount;
    } catch (error) {
      this.logger.error('Error cleaning up expired notifications:', error);
      throw new Error('Failed to cleanup expired notifications');
    }
  }

  /**
   * Get unread notification count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await this.db
        .from(this.notificationsTable)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', NotificationStatus.UNREAD);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      this.logger.error('Error getting unread count:', error);
      throw new Error('Failed to get unread count');
    }
  }

  /**
   * Map database row to Notification object
   */
  private mapFromDatabase(data: any): Notification {
    return {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data || {},
      status: data.status,
      priority: data.priority,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      readAt: data.read_at ? new Date(data.read_at) : null,
      expiresAt: data.expires_at ? new Date(data.expires_at) : null
    };
  }

  /**
   * Map DTO to database format
   */
  private mapToDatabase(data: UpdateNotificationDto): any {
    const dbData: any = {};
    if (data.status !== undefined) dbData.status = data.status;
    if (data.readAt !== undefined) dbData.read_at = data.readAt?.toISOString();
    if (data.data !== undefined) dbData.data = data.data;
    return dbData;
  }
} 