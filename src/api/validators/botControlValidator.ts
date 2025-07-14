import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { BotStatus } from '../../core/types/botControl';

export const validateBotControl = {
  // Create bot control validation
  createBotControl: [
    body('userId')
      .isString()
      .notEmpty()
      .withMessage('User ID is required'),
    body('platform')
      .isString()
      .notEmpty()
      .isIn(['whatsapp', 'instagram', 'telegram', 'facebook'])
      .withMessage('Platform must be whatsapp, instagram, telegram, or facebook'),
    body('settings')
      .optional()
      .isObject()
      .withMessage('Settings must be an object'),
    validateRequest
  ],

  // Update bot control validation
  updateBotControl: [
    body('status')
      .optional()
      .isIn(Object.values(BotStatus))
      .withMessage('Invalid bot status'),
    body('isPaused')
      .optional()
      .isBoolean()
      .withMessage('isPaused must be a boolean'),
    body('pauseReason')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Pause reason must be less than 500 characters'),
    body('settings')
      .optional()
      .isObject()
      .withMessage('Settings must be an object'),
    validateRequest
  ],

  // Pause bot validation
  pauseBot: [
    body('reason')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Pause reason must be less than 500 characters'),
    validateRequest
  ],

  // User ID and platform parameter validation
  userIdPlatform: [
    param('userId')
      .isString()
      .notEmpty()
      .withMessage('User ID is required'),
    param('platform')
      .isString()
      .notEmpty()
      .isIn(['whatsapp', 'instagram', 'telegram', 'facebook'])
      .withMessage('Platform must be whatsapp, instagram, telegram, or facebook'),
    validateRequest
  ],

  // Bot control ID parameter validation
  botControlId: [
    param('botControlId')
      .isString()
      .notEmpty()
      .withMessage('Bot control ID is required'),
    validateRequest
  ],

  // Get inactive bots query validation
  getInactiveBots: [
    query('hours')
      .optional()
      .isInt({ min: 1, max: 168 }) // 1 hour to 1 week
      .withMessage('Hours must be between 1 and 168'),
    validateRequest
  ],

  // Cleanup old bot controls query validation
  cleanupOldBotControls: [
    query('days')
      .optional()
      .isInt({ min: 1, max: 365 }) // 1 day to 1 year
      .withMessage('Days must be between 1 and 365'),
    validateRequest
  ]
}; 