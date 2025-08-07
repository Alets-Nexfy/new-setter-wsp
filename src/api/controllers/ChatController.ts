import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { ChatService } from '@/core/services/chatService';
import { 
  Chat,
  ChatListItem,
  GetChatsRequest,
  UpdateContactNameRequest,
  ChatActivationRequest,
  ChatDeactivationRequest,
  BulkChatOperation,
  ChatFilters,
  ChatSortOptions
} from '@/shared/types/chat';

export class ChatController {
  private logger: LoggerService;
  private chatService: ChatService;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.chatService = ChatService.getInstance();
  }

  /**
   * GET /api/v2/chats/:userId
   * Get all chats for a user
   */
  public async getChats(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { 
        limit = 50, 
        offset = 0, 
        search,
        isActivated,
        hasKanbanBoard,
        sortBy = 'lastMessageTimestamp',
        sortOrder = 'desc'
      } = req.query;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      this.logger.info('Get chats request', { 
        userId, 
        limit: Number(limit), 
        offset: Number(offset), 
        search,
        isActivated,
        hasKanbanBoard 
      });

      // Use ChatService to get chats
      const request: GetChatsRequest = {
        userId,
        limit: Number(limit),
        offset: Number(offset),
        search: search as string,
        isActivated: isActivated ? isActivated === 'true' : undefined,
        sortBy: sortBy as 'createdAt' | 'lastMessage' | 'contactName',
        sortOrder: sortOrder as 'asc' | 'desc'
      };

      const result = await this.chatService.getChats(userId, request);

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: 'Failed to get chats',
        });
        return;
      }

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });

    } catch (error) {
      this.logger.error('Error getting chats', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get chats',
      });
    }
  }

  /**
   * GET /api/v2/chats/:userId/:chatId
   * Get specific chat details
   */
  public async getChat(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.debug('Get chat request', { userId, chatId });

      const chat = await this.chatService.getChat(userId, chatId);

      if (!chat) {
        res.status(404).json({
          success: false,
          error: 'Chat not found',
        });
        return;
      }

      res.json({
        success: true,
        data: chat
      });

    } catch (error) {
      this.logger.error('Error getting chat', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get chat',
      });
    }
  }

  /**
   * PUT /api/v2/chats/:userId/:chatId/contact-name
   * Update contact display name
   */
  public async updateContactName(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { name }: UpdateContactNameRequest = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      if (name === undefined || typeof name !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Name field (string) is required in body',
        });
        return;
      }

      this.logger.info('Update contact name request', { 
        userId, 
        chatId, 
        name: name.trim() 
      });

      const result = await this.chatService.updateContactName(userId, chatId, name.trim());

      if (!result.success) {
        res.status(404).json({
          success: false,
          error: result.error || 'Failed to update contact name',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Contact name updated successfully',
        data: {
          chatId,
          contactDisplayName: name.trim()
        }
      });

    } catch (error) {
      this.logger.error('Error updating contact name', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update contact name',
      });
    }
  }

  /**
   * POST /api/v2/chats/:userId/:chatId/activate
   * Activate chat for bot responses
   */
  public async activateChat(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { method = 'manual', metadata = {} }: ChatActivationRequest = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.info('Activate chat request', { 
        userId, 
        chatId, 
        method 
      });

      const chat = await this.chatService.activateChat(userId, { chatId, method, metadata });

      res.json({
        success: true,
        message: 'Chat activated successfully',
        data: {
          chatId,
          isActivated: true,
          activationMethod: method,
          activatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error activating chat', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to activate chat',
      });
    }
  }

  /**
   * POST /api/v2/chats/:userId/:chatId/deactivate
   * Deactivate chat to stop bot responses
   */
  public async deactivateChat(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { reason = 'manual', sendFarewellMessage = false }: ChatDeactivationRequest = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.info('Deactivate chat request', { 
        userId, 
        chatId, 
        reason,
        sendFarewellMessage 
      });

      const chat = await this.chatService.deactivateChat(userId, { 
        chatId, 
        reason, 
        sendFarewellMessage 
      });

      // TODO: Send farewell message if requested
      if (sendFarewellMessage) {
        this.logger.debug('Farewell message requested', { userId, chatId });
      }

      res.json({
        success: true,
        message: 'Chat deactivated successfully',
        data: {
          chatId,
          isActivated: false,
          deactivationReason: reason,
          deactivatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error deactivating chat', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to deactivate chat',
      });
    }
  }

  /**
   * POST /api/v2/chats/:userId/reset-activations
   * Reset all chat activations
   */
  public async resetChatActivations(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      this.logger.info('Reset chat activations request', { userId });

      const result = await this.chatService.resetAllChatActivations(userId);

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to reset chat activations',
        });
        return;
      }

      res.json({
        success: true,
        message: `Successfully reset ${result.count} chats`,
        data: {
          count: result.count
        }
      });

    } catch (error) {
      this.logger.error('Error resetting chat activations', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to reset chat activations',
      });
    }
  }

  /**
   * POST /api/v2/chats/:userId/bulk-operation
   * Perform bulk operations on multiple chats
   */
  public async bulkOperation(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { operation, chatIds, parameters = {} }: BulkChatOperation = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      if (!operation || !chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Operation and chat IDs array are required',
        });
        return;
      }

      this.logger.info('Bulk chat operation request', {
        userId,
        operation,
        chatCount: chatIds.length,
        parameters
      });

      const results = [];
      let successCount = 0;
      let failCount = 0;

      // Process each chat
      for (const chatId of chatIds) {
        try {
          let operationResult: any = { success: false };

          switch (operation) {
            case 'activate':
              await this.chatService.activateChat(userId, { 
                chatId, 
                method: 'manual',
                metadata: parameters
              });
              operationResult = { success: true };
              break;

            case 'deactivate':
              await this.chatService.deactivateChat(userId, { 
                chatId, 
                reason: 'bulk_operation' 
              });
              operationResult = { success: true };
              break;

            case 'clear_history':
              operationResult = await this.chatService.clearChatHistory(userId, chatId);
              break;

            case 'delete':
              operationResult = await this.chatService.deleteChat(userId, chatId);
              break;

            default:
              throw new Error(`Unknown operation: ${operation}`);
          }

          if (operationResult.success) {
            results.push({
              chatId,
              success: true
            });
            successCount++;
          } else {
            results.push({
              chatId,
              success: false,
              error: operationResult.error || 'Operation failed'
            });
            failCount++;
          }

        } catch (error) {
          results.push({
            chatId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          failCount++;
        }
      }

      this.logger.info('Bulk operation completed', {
        userId,
        operation,
        total: chatIds.length,
        successful: successCount,
        failed: failCount
      });

      res.json({
        success: true,
        message: `Bulk ${operation} completed`,
        data: {
          results,
          summary: {
            total: chatIds.length,
            successful: successCount,
            failed: failCount
          }
        }
      });

    } catch (error) {
      this.logger.error('Error in bulk operation', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform bulk operation',
      });
    }
  }

  /**
   * GET /api/v2/chats/:userId/statistics
   * Get chat statistics for user
   */
  public async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      this.logger.debug('Get chat statistics request', { userId });

      const statistics = await this.chatService.getChatStatistics(userId);

      res.json({
        success: true,
        data: statistics
      });

    } catch (error) {
      this.logger.error('Error getting chat statistics', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get statistics',
      });
    }
  }
}

export default ChatController;
