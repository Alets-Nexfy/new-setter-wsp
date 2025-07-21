import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import environment from '../../../config/environment';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export interface LogContext {
  [key: string]: any;
}

export class LoggerService {
  private static instance: LoggerService;
  private logger: winston.Logger;

  private constructor() {
    this.logger = this.createLogger();
  }

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  private createLogger(): winston.Logger {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
          log += ` ${JSON.stringify(meta)}`;
        }
        return log;
      })
    );

    const transports: winston.transport[] = [
      // Console transport
      new winston.transports.Console({
        format: consoleFormat,
        level: environment.logging.level,
      }),
    ];

    // File transports for production
    if (process.env.NODE_ENV === 'production') {
      // Error log file
      transports.push(
        new DailyRotateFile({
          filename: `${environment.paths.logsDir}/error-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          level: LogLevel.ERROR,
          maxSize: '20m',
          maxFiles: '14d',
          format: logFormat,
        })
      );

      // Combined log file
      transports.push(
        new DailyRotateFile({
          filename: `${environment.paths.logsDir}/combined-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          format: logFormat,
        })
      );
    }

    return winston.createLogger({
      level: environment.logging.level,
      format: logFormat,
      transports,
      exitOnError: false,
    });
  }

  public error(message: string, context?: LogContext): void {
    this.logger.error(message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.logger.warn(message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  public debug(message: string, context?: LogContext): void {
    this.logger.debug(message, context);
  }

  // Convenience methods for specific contexts
  public logAPIRequest(method: string, url: string, statusCode: number, duration: number): void {
    this.info('API Request', {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
    });
  }

  public logAPIError(method: string, url: string, error: Error, duration?: number): void {
    this.error('API Error', {
      method,
      url,
      error: error.message,
      stack: error.stack,
      duration: duration ? `${duration}ms` : undefined,
    });
  }

  public logDatabaseOperation(operation: string, collection: string, duration: number): void {
    this.debug('Database Operation', {
      operation,
      collection,
      duration: `${duration}ms`,
    });
  }

  public logDatabaseError(operation: string, collection: string, error: Error): void {
    this.error('Database Error', {
      operation,
      collection,
      error: error.message,
      stack: error.stack,
    });
  }

  public logQueueJob(jobType: string, jobId: string, status: string, duration?: number): void {
    this.info('Queue Job', {
      jobType,
      jobId,
      status,
      duration: duration ? `${duration}ms` : undefined,
    });
  }

  public logQueueError(jobType: string, jobId: string, error: Error): void {
    this.error('Queue Error', {
      jobType,
      jobId,
      error: error.message,
      stack: error.stack,
    });
  }

  public logPlatformEvent(platform: string, event: string, sessionId: string, data?: any): void {
    this.info('Platform Event', {
      platform,
      event,
      sessionId,
      data,
    });
  }

  public logPlatformError(platform: string, event: string, sessionId: string, error: Error): void {
    this.error('Platform Error', {
      platform,
      event,
      sessionId,
      error: error.message,
      stack: error.stack,
    });
  }

  public logAIOperation(operation: string, model: string, tokens: number, duration: number): void {
    this.info('AI Operation', {
      operation,
      model,
      tokens,
      duration: `${duration}ms`,
    });
  }

  public logAIError(operation: string, model: string, error: Error): void {
    this.error('AI Error', {
      operation,
      model,
      error: error.message,
      stack: error.stack,
    });
  }

  public logSecurityEvent(event: string, userId: string, ip: string, details?: any): void {
    this.warn('Security Event', {
      event,
      userId,
      ip,
      details,
    });
  }

  public logPerformance(operation: string, duration: number, metadata?: any): void {
    if (duration > 1000) {
      this.warn('Performance Warning', {
        operation,
        duration: `${duration}ms`,
        metadata,
      });
    } else {
      this.debug('Performance', {
        operation,
        duration: `${duration}ms`,
        metadata,
      });
    }
  }

  // Method to create a child logger with additional context
  public child(context: LogContext): LoggerService {
    const childLogger = new LoggerService();
    childLogger.logger = this.logger.child(context);
    return childLogger;
  }

  // Method to get the underlying winston logger
  public getWinstonLogger(): winston.Logger {
    return this.logger;
  }

  // Method to update log level at runtime
  public setLevel(level: LogLevel): void {
    this.logger.level = level;
  }

  // Method to get current log level
  public getLevel(): string {
    return this.logger.level;
  }
} 