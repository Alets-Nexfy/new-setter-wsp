import { Request, Response, NextFunction } from 'express';

/**
 * Validate statistics request
 */
export const validateStatisticsRequest = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { start, end, userId, type, format } = req.query;
    const errors: string[] = [];

    // Validate date parameters
    if (start) {
      const startDate = new Date(start as string);
      if (isNaN(startDate.getTime())) {
        errors.push('Invalid start date format');
      }
    }

    if (end) {
      const endDate = new Date(end as string);
      if (isNaN(endDate.getTime())) {
        errors.push('Invalid end date format');
      }
    }

    // Validate date range
    if (start && end) {
      const startDate = new Date(start as string);
      const endDate = new Date(end as string);
      
      if (startDate >= endDate) {
        errors.push('Start date must be before end date');
      }

      // Check if date range is not too large (max 1 year)
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      if (endDate.getTime() - startDate.getTime() > oneYear) {
        errors.push('Date range cannot exceed 1 year');
      }
    }

    // Validate user ID for user-specific requests
    if (req.params.userId) {
      const userId = req.params.userId;
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        errors.push('Valid user ID is required');
      }
    }

    // Validate report type for POST requests
    if (req.method === 'POST' && req.body.type) {
      const validTypes = ['user', 'system', 'message', 'agent'];
      if (!validTypes.includes(req.body.type)) {
        errors.push(`Invalid report type. Must be one of: ${validTypes.join(', ')}`);
      }
    }

    // Validate export format
    if (format && !['json', 'csv'].includes(format as string)) {
      errors.push('Invalid export format. Must be one of: json, csv');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid request data',
      error: error.message
    });
  }
};

/**
 * Validate dashboard request
 */
export const validateDashboardRequest = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { userId } = req.query;
    const errors: string[] = [];

    // Validate user ID if provided
    if (userId && (typeof userId !== 'string' || userId.trim() === '')) {
      errors.push('Valid user ID is required');
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid request data',
      error: error.message
    });
  }
};

/**
 * Validate export request
 */
export const validateExportRequest = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { type, format, userId, start, end } = req.query;
    const errors: string[] = [];

    // Validate export type
    const validTypes = ['user', 'system', 'message', 'agent'];
    if (!type || !validTypes.includes(type as string)) {
      errors.push(`Invalid export type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate format
    const validFormats = ['json', 'csv'];
    if (format && !validFormats.includes(format as string)) {
      errors.push(`Invalid export format. Must be one of: ${validFormats.join(', ')}`);
    }

    // Validate user ID for user exports
    if (type === 'user' && !userId) {
      errors.push('User ID is required for user exports');
    }

    // Validate date parameters
    if (start) {
      const startDate = new Date(start as string);
      if (isNaN(startDate.getTime())) {
        errors.push('Invalid start date format');
      }
    }

    if (end) {
      const endDate = new Date(end as string);
      if (isNaN(endDate.getTime())) {
        errors.push('Invalid end date format');
      }
    }

    // Validate date range
    if (start && end) {
      const startDate = new Date(start as string);
      const endDate = new Date(end as string);
      
      if (startDate >= endDate) {
        errors.push('Start date must be before end date');
      }

      // Check if date range is not too large (max 6 months for exports)
      const sixMonths = 180 * 24 * 60 * 60 * 1000;
      if (endDate.getTime() - startDate.getTime() > sixMonths) {
        errors.push('Export date range cannot exceed 6 months');
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
      return;
    }

    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid request data',
      error: error.message
    });
  }
}; 