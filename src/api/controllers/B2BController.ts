import { Request, Response } from 'express';
import { UserTierService } from '../../core/services/UserTierService';
import { WhatsAppConnectionPool } from '../../core/services/WhatsAppConnectionPool';
import { LoggerService } from '../../core/services/LoggerService';
import { v4 as uuidv4 } from 'uuid';

/**
 * B2B Controller for Enterprise Partner Platform Integration
 * 
 * This controller handles:
 * - Creating B2B enterprise users for partner platforms
 * - Managing B2B user lifecycle
 * - Platform-specific statistics and monitoring
 * - B2B user authentication and management
 */

export class B2BController {
  private tierService: UserTierService;
  private connectionPool: WhatsAppConnectionPool;
  private logger: LoggerService;

  constructor() {
    this.tierService = UserTierService.getInstance();
    // Note: WhatsAppConnectionPool should be injected or obtained from a service registry
    // For now, we'll handle this in the route setup
    this.logger = LoggerService.getInstance();
  }

  /**
   * Create a new B2B enterprise user
   * POST /api/b2b/users
   */
  public createB2BUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        userId,
        platformId,
        platformUserId,
        platformName,
        platformApiKey
      } = req.body;

      // Validate required fields
      if (!userId || !platformId || !platformUserId || !platformName) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: userId, platformId, platformUserId, platformName'
        });
        return;
      }

      // Check if user already exists
      try {
        const existingUser = await this.tierService.getUserTier(userId);
        if (existingUser) {
          res.status(409).json({
            success: false,
            error: 'User already exists',
            userId
          });
          return;
        }
      } catch (error) {
        // User doesn't exist, which is what we want
      }

      // Create B2B user
      const tierInfo = await this.tierService.createB2BUser(userId, {
        platformId,
        platformUserId,
        platformName,
        platformApiKey
      });

      this.logger.info('B2B user created via API', {
        userId,
        platformId,
        platformName
      });

      res.status(201).json({
        success: true,
        data: {
          userId: tierInfo.userId,
          tier: tierInfo.tier,
          platformInfo: tierInfo.b2bInfo,
          features: tierInfo.configuration.features,
          limits: tierInfo.configuration.limits
        }
      });

    } catch (error) {
      this.logger.error('Error creating B2B user', { error, body: req.body });
      res.status(500).json({
        success: false,
        error: 'Failed to create B2B user',
        details: error.message
      });
    }
  };

  /**
   * Get B2B user information
   * GET /api/b2b/users/:userId
   */
  public getB2BUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      const tierInfo = await this.tierService.getUserTier(userId);

      if (tierInfo.tier !== 'enterprise_b2b' || !tierInfo.b2bInfo) {
        res.status(404).json({
          success: false,
          error: 'B2B user not found'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          userId: tierInfo.userId,
          tier: tierInfo.tier,
          status: tierInfo.status,
          platformInfo: tierInfo.b2bInfo,
          usage: tierInfo.usage,
          features: tierInfo.configuration.features,
          limits: tierInfo.configuration.limits,
          subscriptionInfo: {
            start: tierInfo.subscriptionStart,
            end: tierInfo.subscriptionEnd,
            billingCycle: tierInfo.billingCycle
          }
        }
      });

    } catch (error) {
      this.logger.error('Error getting B2B user', { error, userId: req.params.userId });
      res.status(500).json({
        success: false,
        error: 'Failed to get B2B user information'
      });
    }
  };

  /**
   * Update B2B user platform information
   * PUT /api/b2b/users/:userId
   */
  public updateB2BUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const updates = req.body;

      // Validate that user is B2B
      const isB2BUser = await this.tierService.isB2BUser(userId);
      if (!isB2BUser) {
        res.status(404).json({
          success: false,
          error: 'B2B user not found'
        });
        return;
      }

      // Update B2B info
      await this.tierService.updateB2BUserInfo(userId, updates);

      this.logger.info('B2B user updated via API', { userId, updates });

      res.json({
        success: true,
        message: 'B2B user information updated successfully'
      });

    } catch (error) {
      this.logger.error('Error updating B2B user', { error, userId: req.params.userId });
      res.status(500).json({
        success: false,
        error: 'Failed to update B2B user information'
      });
    }
  };

  /**
   * Get all users from a specific B2B platform
   * GET /api/b2b/platforms/:platformId/users
   */
  public getPlatformUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { platformId } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const users = await this.tierService.getB2BPlatformUsers(platformId);

      // Simple pagination
      const startIndex = (Number(page) - 1) * Number(limit);
      const endIndex = startIndex + Number(limit);
      const paginatedUsers = users.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          users: paginatedUsers.map(user => ({
            userId: user.userId,
            status: user.status,
            usage: user.usage,
            platformInfo: user.b2bInfo,
            createdAt: user.subscriptionStart
          })),
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: users.length,
            pages: Math.ceil(users.length / Number(limit))
          }
        }
      });

    } catch (error) {
      this.logger.error('Error getting platform users', { error, platformId: req.params.platformId });
      res.status(500).json({
        success: false,
        error: 'Failed to get platform users'
      });
    }
  };

  /**
   * Get B2B platform statistics
   * GET /api/b2b/platforms/:platformId/stats
   */
  public getPlatformStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { platformId } = req.params;

      const stats = await this.tierService.getB2BPlatformStats(platformId);

      res.json({
        success: true,
        data: {
          platformId,
          ...stats,
          generatedAt: new Date()
        }
      });

    } catch (error) {
      this.logger.error('Error getting platform stats', { error, platformId: req.params.platformId });
      res.status(500).json({
        success: false,
        error: 'Failed to get platform statistics'
      });
    }
  };

  /**
   * Connect B2B user to WhatsApp
   * POST /api/b2b/users/:userId/connect
   */
  public connectB2BUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      // Validate that user is B2B
      const isB2BUser = await this.tierService.isB2BUser(userId);
      if (!isB2BUser) {
        res.status(404).json({
          success: false,
          error: 'B2B user not found'
        });
        return;
      }

      // This would need to be injected or obtained from service registry
      // For now, we'll return a placeholder response
      res.json({
        success: true,
        message: 'B2B user connection initiated',
        data: {
          userId,
          connectionType: 'enterprise_b2b',
          status: 'connecting'
        }
      });

      this.logger.info('B2B user connection initiated', { userId });

    } catch (error) {
      this.logger.error('Error connecting B2B user', { error, userId: req.params.userId });
      res.status(500).json({
        success: false,
        error: 'Failed to connect B2B user'
      });
    }
  };

  /**
   * Get B2B user connection status
   * GET /api/b2b/users/:userId/status
   */
  public getB2BUserStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      // Validate that user is B2B
      const isB2BUser = await this.tierService.isB2BUser(userId);
      if (!isB2BUser) {
        res.status(404).json({
          success: false,
          error: 'B2B user not found'
        });
        return;
      }

      // This would typically check the connection pool status
      // For now, we'll return basic user tier information
      const tierInfo = await this.tierService.getUserTier(userId);

      res.json({
        success: true,
        data: {
          userId,
          tier: tierInfo.tier,
          status: tierInfo.status,
          connectionType: 'enterprise_b2b',
          lastActivity: tierInfo.usage.lastActivity,
          messageCount: tierInfo.usage.messagesThisMonth
        }
      });

    } catch (error) {
      this.logger.error('Error getting B2B user status', { error, userId: req.params.userId });
      res.status(500).json({
        success: false,
        error: 'Failed to get B2B user status'
      });
    }
  };

  /**
   * Bulk create B2B users
   * POST /api/b2b/users/bulk
   */
  public bulkCreateB2BUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { users, platformId, platformName, platformApiKey } = req.body;

      if (!Array.isArray(users) || users.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Users array is required and must not be empty'
        });
        return;
      }

      if (!platformId || !platformName) {
        res.status(400).json({
          success: false,
          error: 'Platform ID and name are required'
        });
        return;
      }

      const results = [];
      const errors = [];

      for (const user of users) {
        try {
          const { userId, platformUserId } = user;
          
          if (!userId || !platformUserId) {
            errors.push({
              user,
              error: 'Missing userId or platformUserId'
            });
            continue;
          }

          const tierInfo = await this.tierService.createB2BUser(userId, {
            platformId,
            platformUserId,
            platformName,
            platformApiKey
          });

          results.push({
            userId: tierInfo.userId,
            tier: tierInfo.tier,
            status: 'created'
          });

        } catch (error) {
          errors.push({
            user,
            error: error.message
          });
        }
      }

      this.logger.info('Bulk B2B user creation completed', {
        platformId,
        successful: results.length,
        failed: errors.length
      });

      res.status(201).json({
        success: true,
        data: {
          successful: results,
          failed: errors,
          summary: {
            total: users.length,
            successful: results.length,
            failed: errors.length
          }
        }
      });

    } catch (error) {
      this.logger.error('Error in bulk B2B user creation', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to process bulk user creation'
      });
    }
  };
}