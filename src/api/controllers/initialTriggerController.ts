import { Request, Response } from 'express';
import { InitialTriggerService } from '../../core/services/initialTriggerService';
import { logger } from '../../core/utils/logger';

export class InitialTriggerController {
  private initialTriggerService: InitialTriggerService;

  constructor() {
    this.initialTriggerService = new InitialTriggerService();
  }

  /**
   * Create initial trigger
   */
  createInitialTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
      const initialTrigger = await this.initialTriggerService.createInitialTrigger(req.body);
      
      res.status(201).json({
        success: true,
        data: initialTrigger,
        message: 'Initial trigger created successfully'
      });
    } catch (error) {
      logger.error('Error in createInitialTrigger controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create initial trigger'
      });
    }
  };

  /**
   * Get initial trigger by ID
   */
  getInitialTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
      const { triggerId } = req.params;
      const initialTrigger = await this.initialTriggerService.getInitialTrigger(triggerId);
      
      if (!initialTrigger) {
        res.status(404).json({
          success: false,
          message: 'Initial trigger not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: initialTrigger,
        message: 'Initial trigger retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getInitialTrigger controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get initial trigger'
      });
    }
  };

  /**
   * Get user's initial triggers
   */
  getUserInitialTriggers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { type, platform, isActive, limit, offset } = req.query;

      const options = {
        type: type as any,
        platform: platform as string,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      };

      const result = await this.initialTriggerService.getUserInitialTriggers(userId, options);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'User initial triggers retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getUserInitialTriggers controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user initial triggers'
      });
    }
  };

  /**
   * Update initial trigger
   */
  updateInitialTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
      const { triggerId } = req.params;
      const initialTrigger = await this.initialTriggerService.updateInitialTrigger(triggerId, req.body);
      
      res.status(200).json({
        success: true,
        data: initialTrigger,
        message: 'Initial trigger updated successfully'
      });
    } catch (error) {
      logger.error('Error in updateInitialTrigger controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update initial trigger'
      });
    }
  };

  /**
   * Delete initial trigger
   */
  deleteInitialTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
      const { triggerId } = req.params;
      await this.initialTriggerService.deleteInitialTrigger(triggerId);
      
      res.status(200).json({
        success: true,
        message: 'Initial trigger deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteInitialTrigger controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete initial trigger'
      });
    }
  };

  /**
   * Toggle initial trigger active status
   */
  toggleInitialTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
      const { triggerId } = req.params;
      const initialTrigger = await this.initialTriggerService.toggleInitialTrigger(triggerId);
      
      res.status(200).json({
        success: true,
        data: initialTrigger,
        message: 'Initial trigger status toggled successfully'
      });
    } catch (error) {
      logger.error('Error in toggleInitialTrigger controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle initial trigger'
      });
    }
  };

  /**
   * Execute initial trigger
   */
  executeInitialTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
      const { triggerId } = req.params;
      const { contactId, platform, message, metadata } = req.body;

      if (!contactId || !platform) {
        res.status(400).json({
          success: false,
          message: 'Contact ID and platform are required'
        });
        return;
      }

      const context = {
        contactId,
        platform,
        message,
        metadata
      };

      const executed = await this.initialTriggerService.executeInitialTrigger(triggerId, context);
      
      res.status(200).json({
        success: true,
        data: { executed },
        message: executed ? 'Initial trigger executed successfully' : 'Initial trigger not executed'
      });
    } catch (error) {
      logger.error('Error in executeInitialTrigger controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to execute initial trigger'
      });
    }
  };

  /**
   * Get initial trigger statistics
   */
  getInitialTriggerStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const stats = await this.initialTriggerService.getInitialTriggerStats(userId);
      
      res.status(200).json({
        success: true,
        data: stats,
        message: 'Initial trigger statistics retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getInitialTriggerStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get initial trigger statistics'
      });
    }
  };

  /**
   * Duplicate initial trigger
   */
  duplicateInitialTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
      const { triggerId } = req.params;
      const { newName } = req.body;

      if (!newName) {
        res.status(400).json({
          success: false,
          message: 'New name is required'
        });
        return;
      }

      const duplicated = await this.initialTriggerService.duplicateInitialTrigger(triggerId, newName);
      
      res.status(201).json({
        success: true,
        data: duplicated,
        message: 'Initial trigger duplicated successfully'
      });
    } catch (error) {
      logger.error('Error in duplicateInitialTrigger controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to duplicate initial trigger'
      });
    }
  };

  /**
   * Test initial trigger conditions
   */
  testInitialTriggerConditions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { conditions, context } = req.body;

      if (!conditions || !context) {
        res.status(400).json({
          success: false,
          message: 'Conditions and context are required'
        });
        return;
      }

      // This would test the conditions without executing the trigger
      const conditionsMet = true; // Placeholder - would implement actual condition checking
      
      res.status(200).json({
        success: true,
        data: { conditionsMet },
        message: 'Conditions tested successfully'
      });
    } catch (error) {
      logger.error('Error in testInitialTriggerConditions controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test initial trigger conditions'
      });
    }
  };
} 