import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '@/core/services/LoggerService';

export class SanitizationMiddleware {
  private static logger = LoggerService.getInstance();

  /**
   * Basic input sanitization middleware
   */
  public static sanitizeInput(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    try {
      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = this.sanitizeObject(req.body);
      }

      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        req.query = this.sanitizeObject(req.query);
      }

      // Sanitize route parameters
      if (req.params && typeof req.params === 'object') {
        req.params = this.sanitizeObject(req.params);
      }

      next();
    } catch (error) {
      this.logger.error('Input sanitization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        method: req.method,
        url: req.url,
      });

      res.status(400).json({
        success: false,
        error: 'Invalid input format',
      });
    }
  }

  /**
   * Sanitize an object recursively
   */
  private static sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize key name
        const cleanKey = this.sanitizeString(key);
        // Sanitize value
        sanitized[cleanKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Basic string sanitization
   */
  private static sanitizeString(str: string): string {
    if (typeof str !== 'string') {
      return str;
    }

    return str
      .trim()
      // Remove null bytes
      .replace(/\0/g, '')
      // Basic XSS protection - remove script tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove potentially dangerous HTML attributes
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      // Limit length to prevent buffer overflow attacks
      .substring(0, 10000);
  }

  /**
   * Validate required fields middleware
   */
  public static validateRequiredFields(requiredFields: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const missingFields = requiredFields.filter(field => {
        const value = req.body?.[field];
        return value === undefined || value === null || value === '';
      });

      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields,
        });
        return;
      }

      next();
    };
  }

  /**
   * Validate field types middleware
   */
  public static validateFieldTypes(fieldTypes: { [key: string]: string }) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const invalidFields: string[] = [];

      for (const [field, expectedType] of Object.entries(fieldTypes)) {
        const value = req.body?.[field];
        if (value !== undefined && value !== null) {
          const actualType = typeof value;
          if (actualType !== expectedType) {
            invalidFields.push(`${field} (expected ${expectedType}, got ${actualType})`);
          }
        }
      }

      if (invalidFields.length > 0) {
        res.status(400).json({
          success: false,
          error: `Invalid field types: ${invalidFields.join(', ')}`,
          invalidFields,
        });
        return;
      }

      next();
    };
  }
}

export default SanitizationMiddleware;

// Individual method exports for convenience
export const sanitizeInput = SanitizationMiddleware.sanitizeInput;
export const validateRequiredFields = SanitizationMiddleware.validateRequiredFields;
export const validateFieldTypes = SanitizationMiddleware.validateFieldTypes;