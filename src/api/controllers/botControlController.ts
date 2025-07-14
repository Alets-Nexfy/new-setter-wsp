import { Request, Response } from 'express';
import { BotControlService } from '../../core/services/botControlService';
import { logger } from '../../core/utils/logger';

export class BotControlController {
  private botControlService: BotControlService;

  constructor() {
    this.botControlService = new BotControlService();
  }

  /**
   * Create bot control
   */
  createBotControl = async (req: Request, res: Response): Promise<void> => {
    try {
      const botControl = await this.botControlService.createBotControl(req.body);
      
      res.status(201).json({
        success: true,
        data: botControl,
        message: 'Bot control created successfully'
      });
    } catch (error) {
      logger.error('Error in createBotControl controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create bot control'
      });
    }
  };

  /**
   * Get bot control for user and platform
   */
  getBotControl = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, platform } = req.params;
      const botControl = await this.botControlService.getBotControl(userId, platform);
      
      if (!botControl) {
        res.status(404).json({
          success: false,
          message: 'Bot control not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: botControl,
        message: 'Bot control retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getBotControl controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot control'
      });
    }
  };

  /**
   * Get all bot controls for user
   */
  getUserBotControls = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const botControls = await this.botControlService.getUserBotControls(userId);
      
      res.status(200).json({
        success: true,
        data: botControls,
        message: 'User bot controls retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getUserBotControls controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user bot controls'
      });
    }
  };

  /**
   * Update bot control
   */
  updateBotControl = async (req: Request, res: Response): Promise<void> => {
    try {
      const { botControlId } = req.params;
      const botControl = await this.botControlService.updateBotControl(botControlId, req.body);
      
      res.status(200).json({
        success: true,
        data: botControl,
        message: 'Bot control updated successfully'
      });
    } catch (error) {
      logger.error('Error in updateBotControl controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update bot control'
      });
    }
  };

  /**
   * Pause bot
   */
  pauseBot = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, platform } = req.params;
      const { reason } = req.body;
      
      await this.botControlService.pauseBot(userId, platform, reason);
      
      res.status(200).json({
        success: true,
        message: 'Bot paused successfully'
      });
    } catch (error) {
      logger.error('Error in pauseBot controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to pause bot'
      });
    }
  };

  /**
   * Resume bot
   */
  resumeBot = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, platform } = req.params;
      await this.botControlService.resumeBot(userId, platform);
      
      res.status(200).json({
        success: true,
        message: 'Bot resumed successfully'
      });
    } catch (error) {
      logger.error('Error in resumeBot controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resume bot'
      });
    }
  };

  /**
   * Stop bot
   */
  stopBot = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, platform } = req.params;
      await this.botControlService.stopBot(userId, platform);
      
      res.status(200).json({
        success: true,
        message: 'Bot stopped successfully'
      });
    } catch (error) {
      logger.error('Error in stopBot controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop bot'
      });
    }
  };

  /**
   * Update bot activity
   */
  updateBotActivity = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, platform } = req.params;
      await this.botControlService.updateBotActivity(userId, platform);
      
      res.status(200).json({
        success: true,
        message: 'Bot activity updated successfully'
      });
    } catch (error) {
      logger.error('Error in updateBotActivity controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update bot activity'
      });
    }
  };

  /**
   * Get all bot statuses
   */
  getAllBotStatuses = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.botControlService.getAllBotStatuses();
      
      res.status(200).json({
        success: true,
        data: stats,
        message: 'Bot statuses retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getAllBotStatuses controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot statuses'
      });
    }
  };

  /**
   * Get inactive bots
   */
  getInactiveBots = async (req: Request, res: Response): Promise<void> => {
    try {
      const { hours } = req.query;
      const hoursNum = hours ? parseInt(hours as string) : 24;
      
      const inactiveBots = await this.botControlService.getInactiveBots(hoursNum);
      
      res.status(200).json({
        success: true,
        data: inactiveBots,
        message: 'Inactive bots retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getInactiveBots controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get inactive bots'
      });
    }
  };

  /**
   * Delete bot control
   */
  deleteBotControl = async (req: Request, res: Response): Promise<void> => {
    try {
      const { botControlId } = req.params;
      await this.botControlService.deleteBotControl(botControlId);
      
      res.status(200).json({
        success: true,
        message: 'Bot control deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteBotControl controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete bot control'
      });
    }
  };

  /**
   * Cleanup old bot controls
   */
  cleanupOldBotControls = async (req: Request, res: Response): Promise<void> => {
    try {
      const { days } = req.query;
      const daysNum = days ? parseInt(days as string) : 30;
      
      const count = await this.botControlService.cleanupOldBotControls(daysNum);
      
      res.status(200).json({
        success: true,
        data: { cleanedCount: count },
        message: `Cleaned up ${count} old bot controls`
      });
    } catch (error) {
      logger.error('Error in cleanupOldBotControls controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup old bot controls'
      });
    }
  };
} 