import { Request, Response } from 'express';
import { NotificationService } from '../../core/services/notificationService';
import { logger } from '../../core/utils/logger';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = NotificationService.getInstance();
  }

  /**
   * Create a new notification
   */
  createNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const notification = await this.notificationService.createNotification(req.body);
      
      res.status(201).json({
        success: true,
        data: notification,
        message: 'Notification created successfully'
      });
    } catch (error) {
      logger.error('Error in createNotification controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create notification'
      });
    }
  };

  /**
   * Get user notifications
   */
  getUserNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { status, type, limit, offset } = req.query;

      const options = {
        status: status as any,
        type: type as any,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      };

      const result = await this.notificationService.getUserNotifications(userId, options);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'Notifications retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getUserNotifications controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user notifications'
      });
    }
  };

  /**
   * Get a specific notification
   */
  getNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const { notificationId } = req.params;
      const notification = await this.notificationService.getNotification(notificationId);
      
      if (!notification) {
        res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: notification,
        message: 'Notification retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getNotification controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notification'
      });
    }
  };

  /**
   * Mark notification as read
   */
  markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const { notificationId } = req.params;
      await this.notificationService.markAsRead(notificationId);
      
      res.status(200).json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      logger.error('Error in markAsRead controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }
  };

  /**
   * Mark all user notifications as read
   */
  markAllAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      await this.notificationService.markAllAsRead(userId);
      
      res.status(200).json({
        success: true,
        message: 'All notifications marked as read'
      });
    } catch (error) {
      logger.error('Error in markAllAsRead controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read'
      });
    }
  };

  /**
   * Delete a notification
   */
  deleteNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const { notificationId } = req.params;
      await this.notificationService.deleteNotification(notificationId);
      
      res.status(200).json({
        success: true,
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteNotification controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete notification'
      });
    }
  };

  /**
   * Delete all user notifications
   */
  deleteAllUserNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      await this.notificationService.deleteAllUserNotifications(userId);
      
      res.status(200).json({
        success: true,
        message: 'All user notifications deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteAllUserNotifications controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete all user notifications'
      });
    }
  };

  /**
   * Send system notification
   */
  sendSystemNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.notificationService.sendSystemNotification(req.body);
      
      res.status(200).json({
        success: true,
        message: 'System notification sent successfully'
      });
    } catch (error) {
      logger.error('Error in sendSystemNotification controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send system notification'
      });
    }
  };

  /**
   * Get notification statistics
   */
  getNotificationStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.query;
      const stats = await this.notificationService.getNotificationStats(userId as string);
      
      res.status(200).json({
        success: true,
        data: stats,
        message: 'Notification statistics retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getNotificationStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notification statistics'
      });
    }
  };

  /**
   * Cleanup expired notifications
   */
  cleanupExpiredNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const count = await this.notificationService.cleanupExpiredNotifications();
      
      res.status(200).json({
        success: true,
        data: { cleanedCount: count },
        message: `Cleaned up ${count} expired notifications`
      });
    } catch (error) {
      logger.error('Error in cleanupExpiredNotifications controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup expired notifications'
      });
    }
  };

  /**
   * Get unread notification count
   */
  getUnreadCount = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const count = await this.notificationService.getUnreadCount(userId);
      
      res.status(200).json({
        success: true,
        data: { unreadCount: count },
        message: 'Unread count retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getUnreadCount controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count'
      });
    }
  };
}

export default NotificationController; 