import { Request, Response, NextFunction } from 'express';
import { CacheService } from '@/core/services/CacheService';
import { rateLimitConfig } from '@/config/environment';
import { LoggerService } from '@/core/services/LoggerService';

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

export class RateLimitMiddleware {
  private static cache = CacheService.getInstance();
  private static logger = LoggerService.getInstance();

  public static createRateLimiter(options: RateLimitOptions = {}) {
    const {
      windowMs = rateLimitConfig.windowMs,
      maxRequests = rateLimitConfig.maxRequests,
      keyGenerator = (req: Request) => req.ip,
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      message = 'Too many requests, please try again later.',
    } = options;

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const key = `rate_limit:${keyGenerator(req)}`;
        
        // Get current request count
        const currentCount = await this.cache.get(key);
        const count = currentCount ? parseInt(currentCount) : 0;

        if (count >= maxRequests) {
          this.logger.warn('Rate limit exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            count,
            maxRequests,
          });

          res.status(429).json({
            success: false,
            error: message,
            retryAfter: Math.ceil(windowMs / 1000),
          });
          return;
        }

        // Increment request count
        await this.cache.set(key, (count + 1).toString(), Math.ceil(windowMs / 1000));

        // Add rate limit headers
        res.set({
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': Math.max(0, maxRequests - count - 1).toString(),
          'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString(),
        });

        // Handle response completion
        const originalSend = res.send;
        res.send = function(data: any) {
          if (skipSuccessfulRequests && res.statusCode < 400) {
            // Don't count successful requests
            this.cache.del(key).catch(() => {});
          }
          if (skipFailedRequests && res.statusCode >= 400) {
            // Don't count failed requests
            this.cache.del(key).catch(() => {});
          }
          return originalSend.call(this, data);
        };

        next();

      } catch (error) {
        this.logger.error('Rate limiting error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          ip: req.ip,
        });

        // Continue without rate limiting if there's an error
        next();
      }
    };
  }

  // Default rate limiter
  public static default = this.createRateLimiter();

  // Strict rate limiter for sensitive endpoints
  public static strict = this.createRateLimiter({
    windowMs: 60000, // 1 minute
    maxRequests: 10,
    message: 'Too many requests. Please wait before trying again.',
  });

  // Loose rate limiter for public endpoints
  public static loose = this.createRateLimiter({
    windowMs: 300000, // 5 minutes
    maxRequests: 100,
    message: 'Rate limit exceeded. Please try again later.',
  });

  // AI-specific rate limiter
  public static ai = this.createRateLimiter({
    windowMs: 60000, // 1 minute
    maxRequests: 5,
    message: 'AI rate limit exceeded. Please wait before making more requests.',
  });

  // Message sending rate limiter
  public static messageSending = this.createRateLimiter({
    windowMs: 60000, // 1 minute
    maxRequests: 30,
    message: 'Message sending rate limit exceeded. Please wait before sending more messages.',
  });

  // Webhook rate limiter
  public static webhook = this.createRateLimiter({
    windowMs: 60000, // 1 minute
    maxRequests: 50,
    message: 'Webhook rate limit exceeded.',
  });

  // User-specific rate limiter
  public static userSpecific = (req: Request, res: Response, next: NextFunction): void => {
    const userId = (req as any).user?.id || req.ip;
    const keyGenerator = () => `user:${userId}`;
    
    this.createRateLimiter({
      windowMs: 300000, // 5 minutes
      maxRequests: 200,
      keyGenerator,
      message: 'User rate limit exceeded.',
    })(req, res, next);
  };

  // Session-specific rate limiter
  public static sessionSpecific = (req: Request, res: Response, next: NextFunction): void => {
    const sessionId = req.params.sessionId || 'default';
    const keyGenerator = () => `session:${sessionId}`;
    
    this.createRateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 50,
      keyGenerator,
      message: 'Session rate limit exceeded.',
    })(req, res, next);
  };

  // Dynamic rate limiter based on user role
  public static dynamicByRole = (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    let maxRequests = 100; // Default
    let windowMs = 300000; // 5 minutes

    if (user) {
      switch (user.role) {
        case 'admin':
          maxRequests = 1000;
          windowMs = 60000; // 1 minute
          break;
        case 'premium':
          maxRequests = 500;
          windowMs = 120000; // 2 minutes
          break;
        case 'user':
          maxRequests = 100;
          windowMs = 300000; // 5 minutes
          break;
        default:
          maxRequests = 50;
          windowMs = 600000; // 10 minutes
      }
    }

    this.createRateLimiter({
      windowMs,
      maxRequests,
      keyGenerator: () => `role:${user?.role || 'anonymous'}:${req.ip}`,
    })(req, res, next);
  };

  // Cleanup expired rate limit entries
  public static async cleanup(): Promise<void> {
    try {
      const keys = await this.cache.keys('rate_limit:*');
      const now = Date.now();

      for (const key of keys) {
        const ttl = await this.cache.ttl(key);
        if (ttl <= 0) {
          await this.cache.del(key);
        }
      }

      this.logger.info('Rate limit cleanup completed', {
        keysProcessed: keys.length,
      });

    } catch (error) {
      this.logger.error('Rate limit cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get rate limit info for a specific key
  public static async getRateLimitInfo(key: string): Promise<{
    current: number;
    limit: number;
    remaining: number;
    resetTime: Date;
  } | null> {
    try {
      const current = await this.cache.get(key);
      const ttl = await this.cache.ttl(key);
      
      if (!current || ttl <= 0) {
        return null;
      }

      const count = parseInt(current);
      const limit = rateLimitConfig.maxRequests;
      const remaining = Math.max(0, limit - count);
      const resetTime = new Date(Date.now() + (ttl * 1000));

      return {
        current: count,
        limit,
        remaining,
        resetTime,
      };

    } catch (error) {
      this.logger.error('Error getting rate limit info', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
} 