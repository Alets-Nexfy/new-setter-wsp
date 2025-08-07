import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { validateNotification } from '../validators/notificationValidator';
import { authenticateToken } from '../middleware/auth';
import { RateLimitMiddleware } from '../middleware/rateLimit';

const router = Router();
const notificationController = new NotificationController();

// Apply authentication to all routes
router.use(authenticateToken);

// Create notification
router.post('/', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }), // 15 minutes, 100 requests
  validateNotification.createNotification,
  notificationController.createNotification
);

// Get user notifications
router.get('/user/:userId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  notificationController.getUserNotifications
);

// Get specific notification
router.get('/:notificationId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  notificationController.getNotification
);

// Mark notification as read
router.patch('/:notificationId/read', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  notificationController.markAsRead
);

// Mark all user notifications as read
router.patch('/user/:userId/read-all', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  notificationController.markAllAsRead
);

// Delete notification
router.delete('/:notificationId', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 50 }),
  notificationController.deleteNotification
);

// Delete all user notifications
router.delete('/user/:userId/all', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 }),
  notificationController.deleteAllUserNotifications
);

// Send system notification (admin only)
router.post('/system', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10 }),
  validateNotification.sendSystemNotification,
  notificationController.sendSystemNotification
);

// Get notification statistics
router.get('/stats/overview', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 }),
  notificationController.getNotificationStats
);

// Cleanup expired notifications (admin only)
router.post('/cleanup/expired', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5 }), // 1 hour, 5 requests
  notificationController.cleanupExpiredNotifications
);

// Get unread count for user
router.get('/user/:userId/unread-count', 
  RateLimitMiddleware.createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 200 }),
  notificationController.getUnreadCount
);

export default router; 