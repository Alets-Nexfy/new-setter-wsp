import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '@/core/services/LoggerService';

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const logger = LoggerService.getInstance();
  
  // Log error details
  logger.error('API Error occurred', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Determine status code
  const statusCode = error.status || 500;
  
  // Determine error message
  let message = 'Internal Server Error';
  if (statusCode === 400) message = 'Bad Request';
  else if (statusCode === 401) message = 'Unauthorized';
  else if (statusCode === 403) message = 'Forbidden';
  else if (statusCode === 404) message = 'Not Found';
  else if (statusCode === 429) message = 'Too Many Requests';
  else if (error.message && statusCode < 500) message = error.message;

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code: error.code || `HTTP_${statusCode}`,
      message,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
        details: error.message
      })
    }
  });
}; 