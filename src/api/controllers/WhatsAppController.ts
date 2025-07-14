import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { WhatsAppSessionManager } from '@/platforms/whatsapp/services/WhatsAppSessionManager';
import { WhatsAppMessageHandler } from '@/platforms/whatsapp/services/WhatsAppMessageHandler';
import { WhatsAppService } from '@/platforms/whatsapp/services/WhatsAppService';
import { QueueService } from '@/core/services/QueueService';
import { JOB_TYPES } from '@/shared/constants';

export class WhatsAppController {
  private logger: LoggerService;
  private sessionManager: WhatsAppSessionManager;
  private messageHandler: WhatsAppMessageHandler;
  private queue: QueueService;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.sessionManager = WhatsAppSessionManager.getInstance();
    this.messageHandler = WhatsAppMessageHandler.getInstance();
    this.queue = QueueService.getInstance();
  }

  // GET /api/v2/whatsapp/status
  public async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      const isActive = this.sessionManager.isSessionActive(sessionId);
      const service = this.sessionManager.getActiveService(sessionId);

      res.json({
        success: true,
        data: {
          sessionId,
          status: session.status,
          isActive,
          isConnected: service?.isConnected() || false,
          phoneNumber: session.phoneNumber,
          username: session.username,
          lastActivity: session.lastActivity,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
      });

    } catch (error) {
      this.logger.error('Error getting WhatsApp status', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  // POST /api/v2/whatsapp/connect
  public async connect(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { userId } = req.body;

      if (!sessionId || !userId) {
        res.status(400).json({
          success: false,
          error: 'Session ID and User ID are required',
        });
        return;
      }

      // Check if session exists
      let session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        // Create new session
        session = await this.sessionManager.createSession({
          userId,
          platform: 'whatsapp',
          metadata: req.body.metadata,
        });
      }

      // Connect the session
      const whatsappService = await this.sessionManager.connectSession(sessionId);

      res.json({
        success: true,
        data: {
          sessionId,
          status: 'connecting',
          message: 'Session is connecting. Check status endpoint for QR code.',
        },
      });

    } catch (error) {
      this.logger.error('Error connecting WhatsApp session', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to connect session',
      });
    }
  }

  // DELETE /api/v2/whatsapp/disconnect
  public async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      await this.sessionManager.disconnectSession(sessionId);

      res.json({
        success: true,
        data: {
          sessionId,
          status: 'disconnected',
          message: 'Session disconnected successfully',
        },
      });

    } catch (error) {
      this.logger.error('Error disconnecting WhatsApp session', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to disconnect session',
      });
    }
  }

  // POST /api/v2/whatsapp/send-message
  public async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { to, message, type = 'text' } = req.body;

      if (!sessionId || !to || !message) {
        res.status(400).json({
          success: false,
          error: 'Session ID, recipient (to), and message are required',
        });
        return;
      }

      // Check if session is active
      if (!this.sessionManager.isSessionActive(sessionId)) {
        res.status(400).json({
          success: false,
          error: 'Session is not connected',
        });
        return;
      }

      // Send message
      const result = await this.messageHandler.sendMessage({
        sessionId,
        to,
        content: message,
        type,
      });

      if (result.success) {
        res.json({
          success: true,
          data: {
            messageId: result.messageId,
            status: 'sent',
            timestamp: result.timestamp,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }

    } catch (error) {
      this.logger.error('Error sending WhatsApp message', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to send message',
      });
    }
  }

  // POST /api/v2/whatsapp/send-media
  public async sendMedia(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { to, mediaUrl, caption, fileName, mimeType } = req.body;

      if (!sessionId || !to || !mediaUrl) {
        res.status(400).json({
          success: false,
          error: 'Session ID, recipient (to), and media URL are required',
        });
        return;
      }

      // Check if session is active
      if (!this.sessionManager.isSessionActive(sessionId)) {
        res.status(400).json({
          success: false,
          error: 'Session is not connected',
        });
        return;
      }

      // Determine media type
      const type = this.determineMediaType(mimeType);

      // Send media message
      const result = await this.messageHandler.sendMessage({
        sessionId,
        to,
        content: mediaUrl,
        type,
        mediaUrl,
        caption,
        fileName,
        mimeType,
      });

      if (result.success) {
        res.json({
          success: true,
          data: {
            messageId: result.messageId,
            status: 'sent',
            type,
            timestamp: result.timestamp,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
        });
      }

    } catch (error) {
      this.logger.error('Error sending WhatsApp media', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to send media',
      });
    }
  }

  // POST /api/v2/whatsapp/send-bulk
  public async sendBulkMessages(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { messages } = req.body;

      if (!sessionId || !messages || !Array.isArray(messages)) {
        res.status(400).json({
          success: false,
          error: 'Session ID and messages array are required',
        });
        return;
      }

      // Check if session is active
      if (!this.sessionManager.isSessionActive(sessionId)) {
        res.status(400).json({
          success: false,
          error: 'Session is not connected',
        });
        return;
      }

      // Send bulk messages
      const results = await this.messageHandler.sendBulkMessages(sessionId, messages);

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      res.json({
        success: true,
        data: {
          total: results.length,
          successful: successCount,
          failed: failureCount,
          results,
        },
      });

    } catch (error) {
      this.logger.error('Error sending bulk WhatsApp messages', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to send bulk messages',
      });
    }
  }

  // GET /api/v2/whatsapp/messages
  public async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { limit = 50, offset = 0, from, to, type, status, startDate, endDate } = req.query;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      const options = {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        from: from as string,
        to: to as string,
        type: type as any,
        status: status as any,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      };

      const messages = await this.messageHandler.getMessages(sessionId, options);

      res.json({
        success: true,
        data: {
          messages,
          pagination: {
            limit: options.limit,
            offset: options.offset,
            total: messages.length,
          },
        },
      });

    } catch (error) {
      this.logger.error('Error getting WhatsApp messages', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get messages',
      });
    }
  }

  // GET /api/v2/whatsapp/messages/:messageId
  public async getMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;

      if (!messageId) {
        res.status(400).json({
          success: false,
          error: 'Message ID is required',
        });
        return;
      }

      const message = await this.messageHandler.getMessage(messageId);

      if (!message) {
        res.status(404).json({
          success: false,
          error: 'Message not found',
        });
        return;
      }

      res.json({
        success: true,
        data: message,
      });

    } catch (error) {
      this.logger.error('Error getting WhatsApp message', {
        messageId: req.params.messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get message',
      });
    }
  }

  // GET /api/v2/whatsapp/sessions
  public async getSessions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.query;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      const sessions = await this.sessionManager.getUserSessions(userId as string);

      res.json({
        success: true,
        data: {
          sessions,
          total: sessions.length,
        },
      });

    } catch (error) {
      this.logger.error('Error getting WhatsApp sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get sessions',
      });
    }
  }

  // GET /api/v2/whatsapp/stats
  public async getStats(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      const [sessionStats, messageStats] = await Promise.all([
        this.sessionManager.getSessionStats(),
        this.messageHandler.getMessageStats(sessionId),
      ]);

      res.json({
        success: true,
        data: {
          session: sessionStats,
          messages: messageStats,
        },
      });

    } catch (error) {
      this.logger.error('Error getting WhatsApp stats', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get stats',
      });
    }
  }

  // POST /api/v2/whatsapp/webhook
  public async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const webhookData = req.body;

      if (!sessionId || !webhookData) {
        res.status(400).json({
          success: false,
          error: 'Session ID and webhook data are required',
        });
        return;
      }

      // Queue webhook processing
      await this.queue.addWhatsAppJob(JOB_TYPES.WHATSAPP_PROCESS_WEBHOOK, {
        sessionId,
        webhookData,
      });

      res.json({
        success: true,
        data: {
          message: 'Webhook received and queued for processing',
        },
      });

    } catch (error) {
      this.logger.error('Error handling WhatsApp webhook', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to process webhook',
      });
    }
  }

  // DELETE /api/v2/whatsapp/sessions/:sessionId
  public async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      await this.sessionManager.deleteSession(sessionId);

      res.json({
        success: true,
        data: {
          message: 'Session deleted successfully',
        },
      });

    } catch (error) {
      this.logger.error('Error deleting WhatsApp session', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to delete session',
      });
    }
  }

  private determineMediaType(mimeType?: string): 'image' | 'video' | 'audio' | 'document' {
    if (!mimeType) return 'document';

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  }
} 