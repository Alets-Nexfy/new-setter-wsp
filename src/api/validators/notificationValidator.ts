import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { NotificationType, NotificationStatus } from '../../core/types/notification';

export const validateNotification = {
  // Create notification validation
  createNotification: [
    body('userId')
      .isString()
      .notEmpty()
      .withMessage('User ID is required'),
    body('type')
      .isIn(Object.values(NotificationType))
      .withMessage('Invalid notification type'),
    body('title')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters'),
    body('message')
      .isString()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('data')
      .optional()
      .isObject()
      .withMessage('Data must be an object'),
    body('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Priority must be low, normal, high, or urgent'),
    body('expiresAt')
      .optional()
      .isISO8601()
      .withMessage('Expires at must be a valid date'),
    validateRequest
  ],

  // Send system notification validation
  sendSystemNotification: [
    body('title')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters'),
    body('message')
      .isString()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('type')
      .isIn(Object.values(NotificationType))
      .withMessage('Invalid notification type'),
    body('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Priority must be low, normal, high, or urgent'),
    body('data')
      .optional()
      .isObject()
      .withMessage('Data must be an object'),
    validateRequest
  ],

  // User ID parameter validation
  userId: [
    param('userId')
      .isString()
      .notEmpty()
      .withMessage('User ID is required'),
    validateRequest
  ],

  // Notification ID parameter validation
  notificationId: [
    param('notificationId')
      .isString()
      .notEmpty()
      .withMessage('Notification ID is required'),
    validateRequest
  ],

  // Query parameters validation for getting notifications
  getNotifications: [
    query('status')
      .optional()
      .isIn(Object.values(NotificationStatus))
      .withMessage('Invalid status'),
    query('type')
      .optional()
      .isIn(Object.values(NotificationType))
      .withMessage('Invalid type'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    validateRequest
  ],

  // Statistics query validation
  getStats: [
    query('userId')
      .optional()
      .isString()
      .notEmpty()
      .withMessage('User ID must be a non-empty string'),
    validateRequest
  ]
}; 