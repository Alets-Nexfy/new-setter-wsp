import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { ChatService } from '@/core/services/chatService';
import { WorkerManagerService } from '@/core/services/WorkerManagerService';
import { 
  Message,
  SendMessageRequest,
  GetMessagesRequest,
  MessageFilters,
  MessageSortOptions,
  MessageStatistics,
  ConversationContext,
  MessageOrigin,
  MessageType
} from '@/shared/types/chat';

export class MessageController {
  private logger: LoggerService;
  private chatService: ChatService;
  private workerManager: WorkerManagerService;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.chatService = ChatService.getInstance();
    this.workerManager = WorkerManagerService.getInstance();
  }

  /**
   * GET /api/v2/messages/:userId/:chatId
   * Get messages for a chat
   */
  public async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const {
        limit = 50,
        offset = 0,
        before,
        after,
        origin,
        type,
        search,
        sortBy = 'timestamp',
        sortOrder = 'asc'
      } = req.query;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.info('Get messages request', {
        userId,
        chatId,
        limit: Number(limit),
        offset: Number(offset),
        before,
        after,
        origin,
        type
      });

      // Use ChatService to get messages with SQL queries
      const getMessagesRequest: GetMessagesRequest = {
        chatId,
        limit: Number(limit),
        offset: Number(offset),
        before: before as string,
        after: after as string,
        origin: origin as MessageOrigin,
        type: type as MessageType
      };

      const result = await this.chatService.getMessages(userId, getMessagesRequest);

      this.logger.info('Messages retrieved successfully', {
        userId,
        chatId,
        count: result.data.length,
        total: result.pagination.total
      });

      res.json({
        success: true,
        data: result.data,
        pagination: {
          limit: result.pagination.limit,
          offset: result.pagination.offset,
          total: result.pagination.total,
          hasMore: result.pagination.hasMore
        }
      });

    } catch (error) {
      this.logger.error('Error getting messages', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get messages',
      });
    }
  }

  /**
   * POST /api/v2/messages/:userId/:chatId
   * Send a message
   */
  public async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { message, origin = 'human', metadata = {} }: SendMessageRequest = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      if (!message || !message.trim()) {
        res.status(400).json({
          success: false,
          error: 'Message content is required',
        });
        return;
      }

      this.logger.info('Send message request', {
        userId,
        chatId,
        messageLength: message.trim().length,
        origin
      });

      // Check if worker is connected and active
      if (!this.workerManager.isWorkerActive(userId)) {
        res.status(400).json({
          success: false,
          error: `User ${userId} is not connected to WhatsApp. Please connect first.`,
        });
        return;
      }

      // Send message via worker
      const success = await this.workerManager.sendMessageToWorker(
        userId,
        'whatsapp',
        {
          chatId,
          content: message.trim(),
          type: 'text'
        }
      );

      if (!success) {
        res.status(500).json({
          success: false,
          error: 'Failed to send message command to worker',
        });
        return;
      }

      // Save message using ChatService (SQL-based)
      const messageRequest: SendMessageRequest & { userId: string; content: string } = {
        userId,
        chatId,
        message: message.trim(),
        content: message.trim(),
        origin: origin as MessageOrigin || 'human',
        type: 'text'
      };

      const saveResult = await this.chatService.sendMessage(messageRequest);

      if (!saveResult.success) {
        this.logger.error('Failed to save message to database', {
          userId,
          chatId,
          error: saveResult.message
        });
      }

      this.logger.info('Message sent successfully', {
        userId,
        chatId,
        messageLength: message.trim().length
      });

      res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
          chatId,
          content: message.trim(),
          origin,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error sending message', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to send message',
      });
    }
  }

  /**
   * GET /api/v2/messages/:userId/:chatId/:messageId
   * Get specific message by ID
   */
  public async getMessage(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId, messageId } = req.params;

      if (!userId || !chatId || !messageId) {
        res.status(400).json({
          success: false,
          error: 'User ID, Chat ID, and Message ID are required',
        });
        return;
      }

      this.logger.debug('Get message request', { userId, chatId, messageId });

      const result = await this.chatService.getMessage(userId, chatId, messageId);

      if (!result.success) {
        res.status(404).json({
          success: false,
          error: result.error || 'Message not found',
        });
        return;
      }

      res.json({
        success: true,
        data: result.message
      });

    } catch (error) {
      this.logger.error('Error getting message', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        messageId: req.params.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get message',
      });
    }
  }

  /**
   * GET /api/v2/messages/:userId/:chatId/conversation-history
   * Get conversation history for AI context
   */
  public async getConversationHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { maxMessages = 6, maxTokens = 2000 } = req.query;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.debug('Get conversation history request', {
        userId,
        chatId,
        maxMessages: Number(maxMessages),
        maxTokens: Number(maxTokens)
      });

      const result = await this.chatService.getConversationHistory(
        userId,
        chatId,
        Number(maxMessages),
        Number(maxTokens)
      );

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to get conversation history',
        });
        return;
      }

      res.json({
        success: true,
        data: result.context
      });

    } catch (error) {
      this.logger.error('Error getting conversation history', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get conversation history',
      });
    }
  }

  /**
   * GET /api/v2/messages/:userId/:chatId/statistics
   * Get message statistics for a chat
   */
  public async getMessageStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.debug('Get message statistics request', { userId, chatId });

      const result = await this.chatService.getMessageStatistics(userId, chatId);

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to get statistics',
        });
        return;
      }

      res.json({
        success: true,
        data: result.statistics
      });

    } catch (error) {
      this.logger.error('Error getting message statistics', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get message statistics',
      });
    }
  }

  /**
   * DELETE /api/v2/messages/:userId/:chatId/clear-history
   * Clear all messages in a chat
   */
  public async clearHistory(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { keepLastMessages = 0 } = req.body;

      if (!userId || !chatId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Chat ID are required',
        });
        return;
      }

      this.logger.info('Clear chat history request', { 
        userId, 
        chatId, 
        keepLastMessages: Number(keepLastMessages) 
      });

      const result = await this.chatService.clearChatHistory(
        userId, 
        chatId, 
        Number(keepLastMessages)
      );

      if (!result.success) {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to clear chat history',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Chat history cleared successfully',
        data: {
          chatId,
          messagesDeleted: result.deletedCount || 0,
          messagesKept: Number(keepLastMessages),
          clearedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error clearing chat history', {
        userId: req.params.userId,
        chatId: req.params.chatId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to clear chat history',
      });
    }
  }
}