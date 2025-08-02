import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { validateNotification } from '../validators/notificationValidator';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware';

const router = Router();
const notificationController = new NotificationController();

// Apply authentication to all routes
router.use(authenticateToken);

// Create notification
router.post('/', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }), // 15 minutes, 100 requests
  validateNotification.createNotification,
  notificationController.createNotification
);

// Get user notifications
router.get('/user/:userId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  notificationController.getUserNotifications
);

// Get specific notification
router.get('/:notificationId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  notificationController.getNotification
);

// Mark notification as read
router.patch('/:notificationId/read', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  notificationController.markAsRead
);

// Mark all user notifications as read
router.patch('/user/:userId/read-all', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  notificationController.markAllAsRead
);

// Delete notification
router.delete('/:notificationId', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 50 }),
  notificationController.deleteNotification
);

// Delete all user notifications
router.delete('/user/:userId/all', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
  notificationController.deleteAllUserNotifications
);

// Send system notification (admin only)
router.post('/system', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
  validateNotification.sendSystemNotification,
  notificationController.sendSystemNotification
);

// Get notification statistics
router.get('/stats/overview', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }),
  notificationController.getNotificationStats
);

// Cleanup expired notifications (admin only)
router.post('/cleanup/expired', 
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }), // 1 hour, 5 requests
  notificationController.cleanupExpiredNotifications
);

// Get unread count for user
router.get('/user/:userId/unread-count', 
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 200 }),
  notificationController.getUnreadCount
);

export default router; 