import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { ExtensionType } from '../../core/types/chatExtension';

export const validateChatExtension = {
  // Create chat extension validation
  createChatExtension: [
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
      .isIn(Object.values(ExtensionType))
      .withMessage('Invalid extension type'),
    body('content')
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Content must be between 1 and 5000 characters'),
    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    body('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),
    body('tags.*')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Each tag must be less than 50 characters'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    validateRequest
  ],

  // Update chat extension validation
  updateChatExtension: [
    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be between 1 and 100 characters'),
    body('content')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Content must be between 1 and 5000 characters'),
    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    body('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),
    body('tags.*')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Each tag must be less than 50 characters'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    validateRequest
  ],

  // Duplicate extension validation
  duplicateExtension: [
    body('newName')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('New name must be between 1 and 100 characters'),
    validateRequest
  ],

  // Extension ID parameter validation
  extensionId: [
    param('extensionId')
      .isString()
      .notEmpty()
      .withMessage('Extension ID is required'),
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

  // Get user chat extensions query validation
  getUserChatExtensions: [
    query('type')
      .optional()
      .isIn(Object.values(ExtensionType))
      .withMessage('Invalid extension type'),
    query('isActive')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('isActive must be true or false'),
    query('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),
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

  // Get popular extensions query validation
  getPopularExtensions: [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    validateRequest
  ],

  // Search extensions query validation
  searchExtensions: [
    query('query')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search query must be between 1 and 100 characters'),
    query('type')
      .optional()
      .isIn(Object.values(ExtensionType))
      .withMessage('Invalid extension type'),
    query('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    validateRequest
  ]
}; 

// Default export
const chatExtensionValidator = {};
export default chatExtensionValidator;
