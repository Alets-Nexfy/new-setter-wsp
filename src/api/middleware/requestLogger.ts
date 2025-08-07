import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import environment from '../../../config/environment';

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const logger = LoggerService.getInstance();
  const startTime = Date.now();

  // Skip logging for health checks and static assets
  if (req.url === '/health' || req.url.startsWith('/static/')) {
    return next();
  }

  // Log request start
  if (environment.logging.logRequests) {
    logger.info('Incoming request', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
  }

  // Override res.end to capture response details
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response<any, Record<string, any>> {
    const duration = Date.now() - startTime;
    
    // Log response details
    if (environment.logging.logResponses) {
      logger.info('Response sent', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }

    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };

  next();
}; 