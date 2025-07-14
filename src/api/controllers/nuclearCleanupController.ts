import { Request, Response } from 'express';
import { NuclearCleanupService } from '../../core/services/nuclearCleanupService';
import { LoggerService } from '../../core/services/LoggerService';

export class NuclearCleanupController {
  private nuclearCleanupService: NuclearCleanupService;
  private logger: LoggerService;

  constructor(nuclearCleanupService: NuclearCleanupService) {
    this.nuclearCleanupService = nuclearCleanupService;
    this.logger = new LoggerService();
  }

  /**
   * Get system status
   * GET /cleanup/status
   */
  async getSystemStatus(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('[NuclearCleanupController] Getting system status');

      const status = await this.nuclearCleanupService.getSystemStatus();

      res.json({
        success: true,
        data: status,
        message: 'System status retrieved successfully'
      });
    } catch (error) {
      this.logger.error('[NuclearCleanupController] Error getting system status:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get system status'
      });
    }
  }

  /**
   * Nuclear cleanup for a specific user
   * POST /users/:userId/nuke
   */
  async nukeUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { confirmationCode } = req.body;

      this.logger.info(`[NuclearCleanupController] Nuclear cleanup requested for user: ${userId}`);

      // Validate confirmation code
      const expectedCode = `NUKE_${userId}_${Date.now().toString().slice(-6)}`;
      if (confirmationCode !== expectedCode) {
        res.status(400).json({
          success: false,
          message: 'Invalid confirmation code',
          expectedCode,
          instructions: `To confirm the deletion, send the code: ${expectedCode}`
        });
        return;
      }

      const cleanupResult = await this.nuclearCleanupService.nukeUserDataCompletely(userId);

      if (cleanupResult.success) {
        res.json({
          success: true,
          data: cleanupResult,
          message: 'Nuclear cleanup completed successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          data: cleanupResult,
          message: 'Nuclear cleanup completed with errors'
        });
      }
    } catch (error) {
      this.logger.error('[NuclearCleanupController] Error in nuclear cleanup:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to perform nuclear cleanup'
      });
    }
  }

  /**
   * Nuclear cleanup for all users
   * POST /nuke-all-users
   */
  async nukeAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const { confirmationCode } = req.body;

      this.logger.info('[NuclearCleanupController] Mass nuclear cleanup requested');

      // Validate confirmation code
      if (confirmationCode !== 'NUKE_ALL_CONFIRMED') {
        res.status(400).json({
          success: false,
          message: 'Invalid confirmation code for mass cleanup',
          instructions: 'To confirm mass deletion, send the code: NUKE_ALL_CONFIRMED'
        });
        return;
      }

      const results = await this.nuclearCleanupService.nukeAllUsers();

      if (results.failed === 0) {
        res.json({
          success: true,
          data: results,
          message: `Nuclear cleanup completed for ${results.successful} users`
        });
      } else {
        res.status(207).json({
          success: false,
          data: results,
          message: `Nuclear cleanup completed with errors. ${results.successful} successful, ${results.failed} failed`
        });
      }
    } catch (error) {
      this.logger.error('[NuclearCleanupController] Error in mass nuclear cleanup:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to perform mass nuclear cleanup'
      });
    }
  }

  /**
   * Verify user data cleanup
   * GET /users/:userId/cleanup/verify
   */
  async verifyUserCleanup(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      this.logger.info(`[NuclearCleanupController] Verifying cleanup for user: ${userId}`);

      const verification = await this.nuclearCleanupService.verifyUserDataCleanup(userId);

      res.json({
        success: true,
        data: verification,
        message: 'Cleanup verification completed'
      });
    } catch (error) {
      this.logger.error('[NuclearCleanupController] Error verifying cleanup:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to verify cleanup'
      });
    }
  }

  /**
   * Get cleanup statistics
   * GET /cleanup/statistics
   */
  async getCleanupStatistics(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('[NuclearCleanupController] Getting cleanup statistics');

      const status = await this.nuclearCleanupService.getSystemStatus();
      
      // Calculate additional statistics
      const statistics = {
        system: status,
        cleanup: {
          available: true,
          endpoints: [
            'GET /cleanup/status',
            'GET /cleanup/statistics',
            'POST /nuke-all-users',
            'POST /users/:userId/nuke',
            'GET /users/:userId/cleanup/verify'
          ],
          features: [
            'Complete user data deletion',
            'Mass cleanup operations',
            'Cleanup verification',
            'System status monitoring',
            'Real-time progress tracking'
          ]
        }
      };

      res.json({
        success: true,
        data: statistics,
        message: 'Cleanup statistics retrieved successfully'
      });
    } catch (error) {
      this.logger.error('[NuclearCleanupController] Error getting cleanup statistics:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get cleanup statistics'
      });
    }
  }

  /**
   * Health check for nuclear cleanup service
   * GET /cleanup/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('[NuclearCleanupController] Health check requested');

      const status = await this.nuclearCleanupService.getSystemStatus();

      const health = {
        status: 'healthy',
        service: 'Nuclear Cleanup Service',
        timestamp: new Date(),
        details: 'Service is operational',
        system: {
          uptime: status.uptime,
          memoryUsage: status.memoryUsage,
          activeConnections: status.activeWebSocketConnections
        }
      };

      res.json({
        success: true,
        data: health,
        message: 'Nuclear cleanup service is healthy'
      });
    } catch (error) {
      this.logger.error('[NuclearCleanupController] Health check failed:', error);
      res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          service: 'Nuclear Cleanup Service',
          timestamp: new Date(),
          details: `Service error: ${error.message}`
        },
        message: 'Nuclear cleanup service is unhealthy'
      });
    }
  }
} 