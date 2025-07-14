import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { TriggerType } from '../../core/types/initialTrigger';

export const validateInitialTrigger = {
  // Create initial trigger validation
  createInitialTrigger: [
    body('userId')
      .isString()
      .notEmpty()
      .withMessage('User ID is required'),
    body('name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be between 1 and 100 characters'),
    body('type')
      .isIn(Object.values(TriggerType))
      .withMessage('Invalid trigger type'),
    body('platform')
      .isString()
      .notEmpty()
      .isIn(['whatsapp', 'instagram', 'telegram', 'facebook'])
      .withMessage('Platform must be whatsapp, instagram, telegram, or facebook'),
    body('conditions')
      .optional()
      .isArray()
      .withMessage('Conditions must be an array'),
    body('conditions.*.type')
      .optional()
      .isString()
      .isIn(['contact_new', 'platform_match', 'time_based', 'message_contains'])
      .withMessage('Invalid condition type'),
    body('actions')
      .optional()
      .isArray()
      .withMessage('Actions must be an array'),
    body('actions.*.type')
      .optional()
      .isString()
      .isIn(['send_message', 'add_tag', 'update_contact', 'trigger_agent', 'webhook'])
      .withMessage('Invalid action type'),
    body('message')
      .isString()
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message must be between 1 and 2000 characters'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    body('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Priority must be low, normal, high, or urgent'),
    body('delay')
      .optional()
      .isInt({ min: 0, max: 3600 })
      .withMessage('Delay must be between 0 and 3600 seconds'),
    body('maxExecutions')
      .optional()
      .isInt({ min: 0, max: 1000 })
      .withMessage('Max executions must be between 0 and 1000'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    validateRequest
  ],

  // Update initial trigger validation
  updateInitialTrigger: [
    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be between 1 and 100 characters'),
    body('type')
      .optional()
      .isIn(Object.values(TriggerType))
      .withMessage('Invalid trigger type'),
    body('platform')
      .optional()
      .isString()
      .isIn(['whatsapp', 'instagram', 'telegram', 'facebook'])
      .withMessage('Platform must be whatsapp, instagram, telegram, or facebook'),
    body('conditions')
      .optional()
      .isArray()
      .withMessage('Conditions must be an array'),
    body('actions')
      .optional()
      .isArray()
      .withMessage('Actions must be an array'),
    body('message')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message must be between 1 and 2000 characters'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    body('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent'])
      .withMessage('Priority must be low, normal, high, or urgent'),
    body('delay')
      .optional()
      .isInt({ min: 0, max: 3600 })
      .withMessage('Delay must be between 0 and 3600 seconds'),
    body('maxExecutions')
      .optional()
      .isInt({ min: 0, max: 1000 })
      .withMessage('Max executions must be between 0 and 1000'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    validateRequest
  ],

  // Execute initial trigger validation
  executeInitialTrigger: [
    body('contactId')
      .isString()
      .notEmpty()
      .withMessage('Contact ID is required'),
    body('platform')
      .isString()
      .notEmpty()
      .isIn(['whatsapp', 'instagram', 'telegram', 'facebook'])
      .withMessage('Platform must be whatsapp, instagram, telegram, or facebook'),
    body('message')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Message must be less than 2000 characters'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    validateRequest
  ],

  // Duplicate initial trigger validation
  duplicateInitialTrigger: [
    body('newName')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('New name must be between 1 and 100 characters'),
    validateRequest
  ],

  // Test initial trigger conditions validation
  testInitialTriggerConditions: [
    body('conditions')
      .isArray()
      .withMessage('Conditions must be an array'),
    body('context')
      .isObject()
      .withMessage('Context must be an object'),
    validateRequest
  ],

  // Trigger ID parameter validation
  triggerId: [
    param('triggerId')
      .isString()
      .notEmpty()
      .withMessage('Trigger ID is required'),
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

  // Get user initial triggers query validation
  getUserInitialTriggers: [
    query('type')
      .optional()
      .isIn(Object.values(TriggerType))
      .withMessage('Invalid trigger type'),
    query('platform')
      .optional()
      .isString()
      .isIn(['whatsapp', 'instagram', 'telegram', 'facebook'])
      .withMessage('Platform must be whatsapp, instagram, telegram, or facebook'),
    query('isActive')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('isActive must be true or false'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),
    validateRequest
  ]
}; 