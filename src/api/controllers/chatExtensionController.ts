import { Request, Response } from 'express';
import { ChatExtensionService } from '../../core/services/chatExtensionService';
import { logger } from '../../core/utils/logger';

export class ChatExtensionController {
  private chatExtensionService: ChatExtensionService;

  constructor() {
    this.chatExtensionService = new ChatExtensionService();
  }

  /**
   * Create chat extension
   */
  createChatExtension = async (req: Request, res: Response): Promise<void> => {
    try {
      const chatExtension = await this.chatExtensionService.createChatExtension(req.body);
      
      res.status(201).json({
        success: true,
        data: chatExtension,
        message: 'Chat extension created successfully'
      });
    } catch (error) {
      logger.error('Error in createChatExtension controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create chat extension'
      });
    }
  };

  /**
   * Get chat extension by ID
   */
  getChatExtension = async (req: Request, res: Response): Promise<void> => {
    try {
      const { extensionId } = req.params;
      const chatExtension = await this.chatExtensionService.getChatExtension(extensionId);
      
      if (!chatExtension) {
        res.status(404).json({
          success: false,
          message: 'Chat extension not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: chatExtension,
        message: 'Chat extension retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getChatExtension controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get chat extension'
      });
    }
  };

  /**
   * Get user's chat extensions
   */
  getUserChatExtensions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { type, isActive, tags, limit, offset } = req.query;

      const options = {
        type: type as any,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) as string[] : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      };

      const result = await this.chatExtensionService.getUserChatExtensions(userId, options);
      
      res.status(200).json({
        success: true,
        data: result,
        message: 'User chat extensions retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getUserChatExtensions controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user chat extensions'
      });
    }
  };

  /**
   * Update chat extension
   */
  updateChatExtension = async (req: Request, res: Response): Promise<void> => {
    try {
      const { extensionId } = req.params;
      const chatExtension = await this.chatExtensionService.updateChatExtension(extensionId, req.body);
      
      res.status(200).json({
        success: true,
        data: chatExtension,
        message: 'Chat extension updated successfully'
      });
    } catch (error) {
      logger.error('Error in updateChatExtension controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update chat extension'
      });
    }
  };

  /**
   * Delete chat extension
   */
  deleteChatExtension = async (req: Request, res: Response): Promise<void> => {
    try {
      const { extensionId } = req.params;
      await this.chatExtensionService.deleteChatExtension(extensionId);
      
      res.status(200).json({
        success: true,
        message: 'Chat extension deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteChatExtension controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete chat extension'
      });
    }
  };

  /**
   * Toggle chat extension active status
   */
  toggleChatExtension = async (req: Request, res: Response): Promise<void> => {
    try {
      const { extensionId } = req.params;
      const chatExtension = await this.chatExtensionService.toggleChatExtension(extensionId);
      
      res.status(200).json({
        success: true,
        data: chatExtension,
        message: 'Chat extension status toggled successfully'
      });
    } catch (error) {
      logger.error('Error in toggleChatExtension controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle chat extension'
      });
    }
  };

  /**
   * Increment usage count
   */
  incrementUsage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { extensionId } = req.params;
      await this.chatExtensionService.incrementUsage(extensionId);
      
      res.status(200).json({
        success: true,
        message: 'Usage count incremented successfully'
      });
    } catch (error) {
      logger.error('Error in incrementUsage controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to increment usage count'
      });
    }
  };

  /**
   * Get popular extensions
   */
  getPopularExtensions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : 10;
      
      const extensions = await this.chatExtensionService.getPopularExtensions(userId, limitNum);
      
      res.status(200).json({
        success: true,
        data: extensions,
        message: 'Popular extensions retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getPopularExtensions controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get popular extensions'
      });
    }
  };

  /**
   * Search extensions
   */
  searchExtensions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { query, type, tags, limit } = req.query;

      if (!query) {
        res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
        return;
      }

      const options = {
        type: type as any,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) as string[] : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      };

      const extensions = await this.chatExtensionService.searchExtensions(userId, query as string, options);
      
      res.status(200).json({
        success: true,
        data: extensions,
        message: 'Extensions search completed successfully'
      });
    } catch (error) {
      logger.error('Error in searchExtensions controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search extensions'
      });
    }
  };

  /**
   * Get extension statistics
   */
  getExtensionStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const stats = await this.chatExtensionService.getExtensionStats(userId);
      
      res.status(200).json({
        success: true,
        data: stats,
        message: 'Extension statistics retrieved successfully'
      });
    } catch (error) {
      logger.error('Error in getExtensionStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get extension statistics'
      });
    }
  };

  /**
   * Duplicate extension
   */
  duplicateExtension = async (req: Request, res: Response): Promise<void> => {
    try {
      const { extensionId } = req.params;
      const { newName } = req.body;

      if (!newName) {
        res.status(400).json({
          success: false,
          message: 'New name is required'
        });
        return;
      }

      const duplicated = await this.chatExtensionService.duplicateExtension(extensionId, newName);
      
      res.status(201).json({
        success: true,
        data: duplicated,
        message: 'Extension duplicated successfully'
      });
    } catch (error) {
      logger.error('Error in duplicateExtension controller:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to duplicate extension'
      });
    }
  };
} 