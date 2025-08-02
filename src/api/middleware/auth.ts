import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import environment from '../../../config/environment';
import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class AuthMiddleware {
  private static logger = LoggerService.getInstance();
  private static db = SupabaseService.getInstance();

  // JWT Authentication
  public static async authenticateJWT(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: 'Authorization header required',
        });
        return;
      }

      const token = authHeader.substring(7);
      
      const decoded = jwt.verify(token, environment.security.jwtSecret) as any;
      
      // Get user from database
      const userDoc = await this.db.doc('users', decoded.userId).get();
      if (!userDoc.exists) {
        res.status(401).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      const userData = userDoc.data();
      if (!userData?.isActive) {
        res.status(401).json({
          success: false,
          error: 'User account is inactive',
        });
        return;
      }

      req.user = {
        id: decoded.userId,
        email: userData.email,
        role: userData.role,
      };

      next();

    } catch (error) {
      this.logger.error('JWT authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }
  }

  // API Key Authentication
  public static async authenticateAPIKey(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      
      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: 'API key required',
        });
        return;
      }

      // Validate API key (this is a simplified version)
      // In a real implementation, you would validate against a database
      if (apiKey !== environment.security.apiKeySecret) {
        res.status(401).json({
          success: false,
          error: 'Invalid API key',
        });
        return;
      }

      // Set a default user for API key authentication
      req.user = {
        id: 'api-user',
        email: 'api@system.com',
        role: 'api',
      };

      next();

    } catch (error) {
      this.logger.error('API key authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(401).json({
        success: false,
        error: 'Authentication failed',
      });
    }
  }

  // Role-based Authorization
  public static requireRole(requiredRole: string) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      if (req.user.role !== requiredRole && req.user.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
        });
        return;
      }

      next();
    };
  }

  // Admin-only Authorization
  public static requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (req.user.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
      return;
    }

    next();
  }

  // Optional Authentication (for endpoints that work with or without auth)
  public static optionalAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Try JWT authentication
      this.authenticateJWT(req, res, next);
    } else if (apiKey) {
      // Try API key authentication
      this.authenticateAPIKey(req, res, next);
    } else {
      // No authentication provided, continue without user
      next();
    }
  }

  // Session Ownership Check
  public static async requireSessionOwnership(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Get session from database
      const sessionDoc = await this.db.doc('sessions', sessionId).get();
      if (!sessionDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      const sessionData = sessionDoc.data();
      
      // Check if user owns the session or is admin
      if (sessionData?.userId !== req.user.id && req.user.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Access denied to this session',
        });
        return;
      }

      next();

    } catch (error) {
      this.logger.error('Session ownership check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: req.params.sessionId,
        userId: req.user?.id,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
} 