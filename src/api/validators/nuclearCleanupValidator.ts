import { Request, Response, NextFunction } from 'express';

/**
 * Validate cleanup request
 */
export const validateCleanupRequest = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { confirmationCode } = req.body;
    const errors: string[] = [];

    // Validate confirmation code
    if (!confirmationCode || typeof confirmationCode !== 'string') {
      errors.push('Confirmation code is required and must be a string');
    }

    // For user-specific cleanup, validate userId parameter
    if (req.params.userId) {
      const { userId } = req.params;
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        errors.push('Valid user ID is required');
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

/**
 * Validate system status request
 */
export const validateSystemStatusRequest = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // No specific validation needed for status requests
    // Just ensure the request is properly formatted
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
 * Validate verification request
 */
export const validateVerificationRequest = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { userId } = req.params;
    const errors: string[] = [];

    // Validate user ID
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
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