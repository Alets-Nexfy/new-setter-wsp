import { Request, Response } from 'express';
import { userService } from '../../core/services/userService';
import { LoggerService } from '../../core/services/LoggerService';
import { 
  CreateUserRequest, 
  ConnectUserRequest, 
  DisconnectUserRequest, 
  UserFilters, 
  UserSortOptions, 
  NuclearCleanupRequest, 
  Platform, 
  BulkUserOperation
} from '../../shared/types/user';

export class UserController {
  private logger: LoggerService;

  constructor() {
    this.logger = LoggerService.getInstance();
  }

  // User CRUD operations
  async createUser(req: Request, res: Response) {
    try {
      const { userId, initialAgentId, metadata }: CreateUserRequest = req.body;
      
      if (!userId || !userId.trim()) {
        return res.status(400).json({
          success: false,
          message: 'userId is required and cannot be empty'
        });
      }

      const user = await userService.createUser({
        userId: userId.trim(),
        initialAgentId,
        metadata
      });

      this.logger.info(`User created: ${userId}`, { userId, initialAgentId });
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: user
      });
    } catch (error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: 'User already exists'
        });
      }
      
      this.logger.error('Error creating user:', error);
      res.status(500).json({
        success: false,
        message: 'Internal error creating user'
      });
    }
  }

  async getUsers(req: Request, res: Response) {
    try {
      const { 
        status, 
        platform, 
        hasActiveAgent, 
        hasErrors, 
        createdAfter, 
        createdBefore, 
        search,
        sortField = 'createdAt',
        sortOrder = 'desc',
        limit = 50,
        offset = 0
      } = req.query;

      const filters: UserFilters = {};
      if (status) filters.status = status as any;
      if (platform) filters.platform = platform as Platform;
      if (hasActiveAgent !== undefined) filters.hasActiveAgent = hasActiveAgent === 'true';
      if (hasErrors !== undefined) filters.hasErrors = hasErrors === 'true';
      if (createdAfter) filters.createdAfter = createdAfter as string;
      if (createdBefore) filters.createdBefore = createdBefore as string;
      if (search) filters.search = search as string;

      const sort: UserSortOptions = {
        field: sortField as any,
        order: sortOrder as any
      };

      const result = await userService.getUsers(
        filters,
        sort,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json(result);
    } catch (error) {
      this.logger.error('Error getting users:', error);
      res.status(500).json({
        success: false,
        message: 'Internal error getting users'
      });
    }
  }

  async getUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { includePlatforms } = req.query;

      let user;
      if (includePlatforms === 'true') {
        user = await userService.getUserWithPlatforms(userId);
      } else {
        user = await userService.getUser(userId);
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      this.logger.error(`Error getting user ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error getting user'
      });
    }
  }

  async updateUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const updates = req.body;

      // Remove fields that shouldn't be updated directly
      delete updates.userId;
      delete updates.createdAt;
      delete updates.workerPid;

      const user = await userService.updateUser(userId, updates);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      this.logger.info(`User updated: ${userId}`, { userId, updates });
      res.json({
        success: true,
        message: 'User updated successfully',
        data: user
      });
    } catch (error) {
      this.logger.error(`Error updating user ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error updating user'
      });
    }
  }

  async deleteUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const success = await userService.deleteUser(userId);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      this.logger.info(`User deleted: ${userId}`, { userId });
      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      this.logger.error(`Error deleting user ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error deleting user'
      });
    }
  }

  // Connection management
  async connectUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { platform = 'whatsapp', agentId } = req.body;

      const request: ConnectUserRequest = {
        userId,
        platform: platform as Platform,
        agentId
      };

      const result = await userService.connectUser(request);

      if (result.success) {
        res.status(202).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      this.logger.error(`Error connecting user ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error connecting user'
      });
    }
  }

  async disconnectUser(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { platform = 'whatsapp', force = false } = req.body;

      const request: DisconnectUserRequest = {
        userId,
        platform: platform as Platform,
        force
      };

      const success = await userService.disconnectUser(request);

      if (success) {
        res.json({
          success: true,
          message: 'Disconnect request sent successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    } catch (error) {
      this.logger.error(`Error disconnecting user ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error disconnecting user'
      });
    }
  }

  async getUserStatus(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { platform = 'whatsapp' } = req.query;

      const status = await userService.getUserStatus(userId, platform as Platform);
      res.json(status);
    } catch (error) {
      this.logger.error(`Error getting user status ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        clientReady: false,
        qrCodeUrl: null,
        status: 'error',
        errorMessage: 'Internal error getting status',
        platform: req.query.platform as Platform || 'whatsapp',
        lastUpdated: new Date().toISOString()
      });
    }
  }

  // Bulk operations
  async bulkOperation(req: Request, res: Response) {
    try {
      const operation: BulkUserOperation = req.body;

      if (!operation.userIds || !Array.isArray(operation.userIds) || operation.userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'userIds array is required and cannot be empty'
        });
      }

      const results = [];
      const summary = {
        total: operation.userIds.length,
        successful: 0,
        failed: 0
      };

      for (const userId of operation.userIds) {
        try {
          let result;
          
          switch (operation.operation) {
            case 'connect':
              result = await userService.connectUser({
                userId,
                platform: operation.platform || 'whatsapp',
                agentId: operation.agentId
              });
              break;
            case 'disconnect':
              result = await userService.disconnectUser({
                userId,
                platform: operation.platform || 'whatsapp',
                force: operation.force
              });
              break;
            case 'delete':
              result = await userService.deleteUser(userId);
              break;
            case 'change_agent':
              if (!operation.agentId) {
                throw new Error('agentId is required for change_agent operation');
              }
              result = await userService.updateUser(userId, { activeAgentId: operation.agentId });
              break;
            default:
              throw new Error(`Unknown operation: ${operation.operation}`);
          }

          results.push({
            userId,
            success: true,
            result
          });
          summary.successful++;
        } catch (error) {
          results.push({
            userId,
            success: false,
            error: error.message
          });
          summary.failed++;
        }
      }

      res.json({
        success: summary.failed === 0,
        results,
        summary
      });
    } catch (error) {
      this.logger.error('Error in bulk operation:', error);
      res.status(500).json({
        success: false,
        message: 'Internal error in bulk operation'
      });
    }
  }

  // Nuclear cleanup
  async nuclearCleanup(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { confirmationCode, force = false }: NuclearCleanupRequest = req.body;

      const result = await userService.nuclearCleanup({
        userId,
        confirmationCode,
        force
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      this.logger.error(`Error in nuclear cleanup for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Critical error during nuclear cleanup',
        results: {
          userId: req.params.userId,
          timestamp: new Date().toISOString(),
          steps: [],
          success: false,
          errors: [error.message]
        }
      });
    }
  }

  // Analytics and monitoring
  async getUserAnalytics(req: Request, res: Response) {
    try {
      const analytics = await userService.getUserAnalytics();
      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      this.logger.error('Error getting user analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal error getting analytics'
      });
    }
  }

  async getUserHealth(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const health = await userService.getUserHealth(userId);
      
      res.json({
        success: true,
        data: health
      });
    } catch (error) {
      this.logger.error(`Error getting user health for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error getting user health'
      });
    }
  }

  // WebSocket connection
  async handleWebSocketConnection(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      // This would typically be handled by a WebSocket upgrade
      // For now, just return connection info
      res.json({
        success: true,
        message: 'WebSocket connection endpoint',
        wsUrl: `ws://localhost:${process.env.PORT || 3000}/ws?userId=${userId}`
      });
    } catch (error) {
      this.logger.error(`Error handling WebSocket connection for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error handling WebSocket connection'
      });
    }
  }

  // Session management
  async getUserSessions(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      // Get active sessions for user
      const sessions = []; // This would come from session storage
      
      res.json({
        success: true,
        data: sessions
      });
    } catch (error) {
      this.logger.error(`Error getting user sessions for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error getting user sessions'
      });
    }
  }

  async terminateUserSession(req: Request, res: Response) {
    try {
      const { userId, sessionId } = req.params;
      
      // Terminate specific session
      // Implementation would depend on session storage
      
      res.json({
        success: true,
        message: 'Session terminated successfully'
      });
    } catch (error) {
      this.logger.error(`Error terminating session ${req.params.sessionId} for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error terminating session'
      });
    }
  }

  // Configuration management
  async getUserConfig(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      
      // Get user configuration
      const config = {}; // This would come from database
      
      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      this.logger.error(`Error getting user config for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error getting user config'
      });
    }
  }

  async updateUserConfig(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const config = req.body;
      
      // Update user configuration
      // Implementation would update database
      
      res.json({
        success: true,
        message: 'Configuration updated successfully',
        data: config
      });
    } catch (error) {
      this.logger.error(`Error updating user config for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error updating user config'
      });
    }
  }

  // Activity logs
  async getUserActivity(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { platform, action, limit = 50, offset = 0 } = req.query;
      
      // Get user activity logs
      const activities = []; // This would come from database
      
      res.json({
        success: true,
        data: activities,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: activities.length
        }
      });
    } catch (error) {
      this.logger.error(`Error getting user activity for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error getting user activity'
      });
    }
  }

  // Worker management
  async getWorkerInfo(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { platform } = req.query;
      
      // Get worker information
      const workerInfo = {}; // This would come from worker management
      
      res.json({
        success: true,
        data: workerInfo
      });
    } catch (error) {
      this.logger.error(`Error getting worker info for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error getting worker info'
      });
    }
  }

  async restartWorker(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { platform = 'whatsapp' } = req.body;
      
      // Restart worker
      await userService.disconnectUser({ userId, platform: platform as Platform, force: true });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      const result = await userService.connectUser({ userId, platform: platform as Platform });
      
      res.json({
        success: true,
        message: 'Worker restart initiated',
        data: result
      });
    } catch (error) {
      this.logger.error(`Error restarting worker for ${req.params.userId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Internal error restarting worker'
      });
    }
  }
}

export const userController = new UserController();
export default UserController; 