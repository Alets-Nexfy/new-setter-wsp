import { body, param, query } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { FunctionStatus } from '../../core/types/firebaseFunction';

export const validateFirebaseFunction = {
  // Create Firebase function validation
  createFirebaseFunction: [
    body('name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be between 1 and 100 characters')
      .matches(/^[a-zA-Z0-9-_]+$/)
      .withMessage('Name can only contain letters, numbers, hyphens, and underscores'),
    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('code')
      .isString()
      .trim()
      .isLength({ min: 1, max: 1000000 })
      .withMessage('Code must be between 1 and 1,000,000 characters'),
    body('runtime')
      .optional()
      .isIn(['nodejs16', 'nodejs18', 'nodejs20', 'python311', 'python312'])
      .withMessage('Runtime must be a valid Node.js or Python version'),
    body('region')
      .optional()
      .isString()
      .isIn(['us-central1', 'us-east1', 'us-west1', 'europe-west1', 'asia-east1'])
      .withMessage('Region must be a valid Firebase region'),
    body('memory')
      .optional()
      .isString()
      .matches(/^\d+MB$/)
      .withMessage('Memory must be in format: 128MB, 256MB, 512MB, 1GB, 2GB, 4GB, 8GB'),
    body('timeout')
      .optional()
      .isInt({ min: 1, max: 540 })
      .withMessage('Timeout must be between 1 and 540 seconds'),
    body('triggers')
      .optional()
      .isArray()
      .withMessage('Triggers must be an array'),
    body('triggers.*')
      .optional()
      .isObject()
      .withMessage('Each trigger must be an object'),
    body('environment')
      .optional()
      .isObject()
      .withMessage('Environment must be an object'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    validateRequest
  ],

  // Update Firebase function validation
  updateFirebaseFunction: [
    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Name must be between 1 and 100 characters')
      .matches(/^[a-zA-Z0-9-_]+$/)
      .withMessage('Name can only contain letters, numbers, hyphens, and underscores'),
    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description must be less than 500 characters'),
    body('code')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 1000000 })
      .withMessage('Code must be between 1 and 1,000,000 characters'),
    body('runtime')
      .optional()
      .isIn(['nodejs16', 'nodejs18', 'nodejs20', 'python311', 'python312'])
      .withMessage('Runtime must be a valid Node.js or Python version'),
    body('region')
      .optional()
      .isString()
      .isIn(['us-central1', 'us-east1', 'us-west1', 'europe-west1', 'asia-east1'])
      .withMessage('Region must be a valid Firebase region'),
    body('memory')
      .optional()
      .isString()
      .matches(/^\d+MB$/)
      .withMessage('Memory must be in format: 128MB, 256MB, 512MB, 1GB, 2GB, 4GB, 8GB'),
    body('timeout')
      .optional()
      .isInt({ min: 1, max: 540 })
      .withMessage('Timeout must be between 1 and 540 seconds'),
    body('triggers')
      .optional()
      .isArray()
      .withMessage('Triggers must be an array'),
    body('environment')
      .optional()
      .isObject()
      .withMessage('Environment must be an object'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    validateRequest
  ],

  // Validate function code validation
  validateFunctionCode: [
    body('code')
      .isString()
      .trim()
      .isLength({ min: 1, max: 1000000 })
      .withMessage('Code must be between 1 and 1,000,000 characters'),
    body('runtime')
      .optional()
      .isIn(['nodejs16', 'nodejs18', 'nodejs20', 'python311', 'python312'])
      .withMessage('Runtime must be a valid Node.js or Python version'),
    validateRequest
  ],

  // Function ID parameter validation
  functionId: [
    param('functionId')
      .isString()
      .notEmpty()
      .withMessage('Function ID is required'),
    validateRequest
  ],

  // Get all Firebase functions query validation
  getAllFirebaseFunctions: [
    query('isActive')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('isActive must be true or false'),
    query('status')
      .optional()
      .isIn(Object.values(FunctionStatus))
      .withMessage('Invalid function status'),
    query('region')
      .optional()
      .isString()
      .isIn(['us-central1', 'us-east1', 'us-west1', 'europe-west1', 'asia-east1'])
      .withMessage('Region must be a valid Firebase region'),
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

  // Get function logs query validation
  getFunctionLogs: [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    validateRequest
  ]
}; 