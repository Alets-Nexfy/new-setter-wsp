import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { WhatsAppSessionManager } from '@/platforms/whatsapp/services/WhatsAppSessionManager';
import { WhatsAppMessageHandler } from '@/platforms/whatsapp/services/WhatsAppMessageHandler';
import { WhatsAppService } from '@/platforms/whatsapp/services/WhatsAppService';
import { QueueService } from '@/core/services/QueueService';
import { WorkerManagerService } from '@/core/services/WorkerManagerService';
import { DatabaseService } from '@/core/services/DatabaseService';
import { JOB_TYPES } from '@/shared/constants';

export class WhatsAppController {
  private logger: LoggerService;
  private sessionManager: WhatsAppSessionManager;
  private messageHandler: WhatsAppMessageHandler;
  private queue: QueueService;
  private workerManager: WorkerManagerService;
  private db: DatabaseService;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.sessionManager = WhatsAppSessionManager.getInstance();
    this.messageHandler = WhatsAppMessageHandler.getInstance();
    this.queue = QueueService.getInstance();
    this.workerManager = WorkerManagerService.getInstance();
    this.db = DatabaseService.getInstance();
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
          isActive,
          service,
          status: session.status,
          lastActivity: session.lastActivity,
        },
      });

    } catch (error) {
      this.logger.error('Error getting WhatsApp status', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get status',
      });
    }
  }

  // POST /api/v2/whatsapp/sessions/:sessionId/start
  public async startSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { forceRestart } = req.body;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      // Start session through session manager
      const session = await this.sessionManager.startSession({
        id: sessionId,
        userId: sessionId, // Assuming sessionId = userId for now
        platform: 'whatsapp',
        config: {},
      });

      res.json({
        success: true,
        data: {
          sessionId,
          status: session.status,
          message: 'Session started successfully',
        },
      });

    } catch (error) {
      this.logger.error('Error starting WhatsApp session', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to start session',
      });
    }
  }

  // POST /api/v2/whatsapp/sessions/:sessionId/stop
  public async stopSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      await this.sessionManager.stopSession(sessionId);

      res.json({
        success: true,
        data: {
          sessionId,
          message: 'Session stopped successfully',
        },
      });

    } catch (error) {
      this.logger.error('Error stopping WhatsApp session', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to stop session',
      });
    }
  }

  // POST /api/v2/whatsapp/sessions/:sessionId/messages
  public async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { to, message, mediaUrl, mediaType, mediaCaption } = req.body;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      if (!to || (!message && !mediaUrl)) {
        res.status(400).json({
          success: false,
          error: 'Recipient and message content are required',
        });
        return;
      }

      const service = this.sessionManager.getActiveService(sessionId);
      if (!service) {
        res.status(400).json({
          success: false,
          error: 'Session not active',
        });
        return;
      }

      let sentMessage;

      if (mediaUrl) {
        sentMessage = await service.sendMedia(to, {
          url: mediaUrl,
          type: this.determineMediaType(mediaType),
          caption: mediaCaption,
        });
      } else {
        sentMessage = await service.sendMessage(to, message);
      }

      res.json({
        success: true,
        data: {
          messageId: sentMessage.id,
          timestamp: sentMessage.timestamp,
          to,
          message,
        },
      });

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

  // POST /api/v2/whatsapp/sessions/:sessionId/media
  public async sendMedia(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { to, mediaUrl, mediaType, caption } = req.body;

      if (!sessionId || !to || !mediaUrl) {
        res.status(400).json({
          success: false,
          error: 'Session ID, recipient, and media URL are required',
        });
        return;
      }

      const service = this.sessionManager.getActiveService(sessionId);
      if (!service) {
        res.status(400).json({
          success: false,
          error: 'Session not active',
        });
        return;
      }

      const sentMessage = await service.sendMedia(to, {
        url: mediaUrl,
        type: this.determineMediaType(mediaType),
        caption: caption,
      });

      res.json({
        success: true,
        data: {
          messageId: sentMessage.id,
          timestamp: sentMessage.timestamp,
          to,
          mediaUrl,
          caption,
        },
      });

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

  // GET /api/v2/whatsapp/sessions/:sessionId/messages
  public async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { limit = 50, offset = 0, chatId } = req.query;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
        return;
      }

      const messages = await this.messageHandler.getMessages({
        sessionId,
        chatId: chatId as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      res.json({
        success: true,
        data: {
          messages,
          total: messages.length,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
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

  // GET /api/v2/whatsapp/sessions/:sessionId/messages/:messageId
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

  // ==========================================
  // MÉTODOS MIGRADOS DE V1 - WORKER MANAGEMENT
  // ==========================================

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 1076-1136
   * POST /api/whatsapp/:userId/connect
   * MEJORAS: TypeScript, WorkerManagerService integration, structured responses
   */
  public async connect(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { activeAgentId, forceRestart = false } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      this.logger.info('Connection request received', { 
        userId, 
        activeAgentId, 
        forceRestart 
      });

      // Check if user exists in database
      const userDoc = await this.db.doc('users', userId).get();
      if (!userDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Get current status
      const currentWorker = this.workerManager.getWorker(userId);
      const isActive = this.workerManager.isWorkerActive(userId);

      if (isActive && !forceRestart) {
        res.status(200).json({
          success: true,
          message: 'Connection is already active',
          data: {
            userId,
            status: currentWorker?.status || 'unknown',
            pid: currentWorker?.process.pid
          }
        });
        return;
      }

      // Start worker
      const worker = await this.workerManager.startWorker({
        userId,
        platform: 'whatsapp',
        activeAgentId,
        forceRestart
      });

      if (worker) {
        res.status(202).json({
          success: true,
          message: 'Connection request received. Starting process...',
          data: {
            userId,
            status: worker.status,
            pid: worker.process.pid,
            activeAgentId: worker.activeAgentId
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to start worker. Check server logs.',
        });
      }

    } catch (error) {
      this.logger.error('Error handling connect request', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 1143-1170
   * POST /api/whatsapp/:userId/disconnect
   * MEJORAS: TypeScript, WorkerManagerService integration
   */
  public async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      this.logger.info('Disconnect request received', { userId });

      const isActive = this.workerManager.isWorkerActive(userId);
      if (!isActive) {
        res.status(200).json({
          success: true,
          message: 'User is already disconnected',
          data: { userId, status: 'disconnected' }
        });
        return;
      }

      const result = await this.workerManager.stopWorker(userId);

      if (result) {
        res.status(200).json({
          success: true,
          message: 'Disconnection initiated successfully',
          data: { userId, status: 'disconnecting' }
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to initiate disconnection',
        });
      }

    } catch (error) {
      this.logger.error('Error handling disconnect request', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 1177-1208
   * GET /api/whatsapp/:userId/status
   * MEJORAS: TypeScript, comprehensive status information
   */
  public async getWorkerStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      const workerInfo = await this.workerManager.getWorkerInfo(userId);
      
      if (!workerInfo) {
        res.status(404).json({
          success: false,
          error: 'Worker not found',
          data: { userId, status: 'not_found' }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          userId,
          worker: workerInfo.worker,
          health: workerInfo.health,
          firestoreStatus: workerInfo.firestoreStatus,
          stats: workerInfo.stats
        }
      });

    } catch (error) {
      this.logger.error('Error getting worker status', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/whatsapp/:userId/qr
   * Get the current QR code for WhatsApp connection
   */
  public async getQRCode(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      // Get QR code from Firestore status collection
      const statusDocRef = this.db.getFirestore()
        .collection('users')
        .doc(userId)
        .collection('status')
        .doc('whatsapp');

      const statusDoc = await statusDocRef.get();
      
      if (!statusDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'WhatsApp status not found',
          data: { userId }
        });
        return;
      }

      const statusData = statusDoc.data();
      const qrCode = statusData?.last_qr_code;

      if (!qrCode) {
        res.status(404).json({
          success: false,
          error: 'QR code not available. Please start connection first.',
          data: { 
            userId,
            status: statusData?.status || 'unknown'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          userId,
          qr: qrCode,
          qrText: statusData?.last_qr_text,
          status: statusData?.status || 'unknown',
          timestamp: statusData?.updatedAt || new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error getting QR code', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/whatsapp/:userId/qr/image
   * Get the QR code as a PNG image
   */
  public async getQRImage(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).send('User ID is required');
        return;
      }

      // Get QR code from Firestore
      const statusDocRef = this.db.getFirestore()
        .collection('users')
        .doc(userId)
        .collection('status')
        .doc('whatsapp');

      const statusDoc = await statusDocRef.get();
      
      if (!statusDoc.exists) {
        res.status(404).send('WhatsApp status not found');
        return;
      }

      const statusData = statusDoc.data();
      const qrCode = statusData?.last_qr_code;

      if (!qrCode) {
        res.status(404).send('QR code not available. Please start connection first.');
        return;
      }

      // Extract base64 data and convert to buffer
      const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Set headers and send image
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', imageBuffer.length);
      res.send(imageBuffer);

    } catch (error) {
      this.logger.error('Error getting QR image', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /api/whatsapp/:userId/qr/view
   * View the QR code in a simple HTML page
   */
  public async viewQR(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).send('User ID is required');
        return;
      }

      // Get QR code from Firestore
      const statusDocRef = this.db.getFirestore()
        .collection('users')
        .doc(userId)
        .collection('status')
        .doc('whatsapp');

      const statusDoc = await statusDocRef.get();
      
      if (!statusDoc.exists) {
        res.status(404).send(`
          <html>
            <head><title>WhatsApp QR - User ${userId}</title></head>
            <body>
              <h2>WhatsApp QR Code</h2>
              <p>Status not found for user: ${userId}</p>
              <p><a href="javascript:window.location.reload()">Refresh</a></p>
            </body>
          </html>
        `);
        return;
      }

      const statusData = statusDoc.data();
      const qrCode = statusData?.last_qr_code;
      const status = statusData?.status || 'unknown';

      if (!qrCode) {
        res.send(`
          <html>
            <head>
              <title>WhatsApp QR - User ${userId}</title>
              <meta http-equiv="refresh" content="5">
            </head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2>WhatsApp QR Code</h2>
              <p>Status: <strong>${status}</strong></p>
              <p>QR code not available yet. Please start connection first.</p>
              <p><em>This page refreshes automatically every 5 seconds...</em></p>
              <p><a href="javascript:window.location.reload()">Manual Refresh</a></p>
            </body>
          </html>
        `);
        return;
      }

      // Return HTML page with QR code
      res.send(`
        <html>
          <head>
            <title>WhatsApp QR - User ${userId}</title>
            <meta http-equiv="refresh" content="30">
          </head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>WhatsApp QR Code</h2>
            <p>Status: <strong>${status}</strong></p>
            <p>Scan this QR code with your WhatsApp app:</p>
            <div style="margin: 20px 0;">
              <img src="${qrCode}" alt="WhatsApp QR Code" style="border: 2px solid #25D366; border-radius: 10px;" />
            </div>
            <p><em>This page refreshes automatically every 30 seconds...</em></p>
            <p><a href="javascript:window.location.reload()">Manual Refresh</a></p>
            <p><small>User ID: ${userId}</small></p>
          </body>
        </html>
      `);

    } catch (error) {
      this.logger.error('Error viewing QR', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).send('Internal server error');
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 1261-1347
   * POST /api/whatsapp/:userId/send-message
   * MEJORAS: TypeScript, WorkerManagerService integration, validation
   */
  public async sendWorkerMessage(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { number, message } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      if (!number || !message || !number.trim() || !message.trim()) {
        res.status(400).json({
          success: false,
          error: 'Phone number and message are required',
        });
        return;
      }

      this.logger.info('Send message request received', {
        userId,
        phoneNumber: number.trim(),
        messageLength: message.trim().length
      });

      // Check if worker is active
      if (!this.workerManager.isWorkerActive(userId)) {
        res.status(400).json({
          success: false,
          error: `Worker for user ${userId} is not active. Please connect first.`,
        });
        return;
      }

      // Send message via worker
      const success = await this.workerManager.sendMessage(
        userId,
        number.trim(),
        message.trim()
      );

      if (success) {
        res.status(202).json({
          success: true,
          message: 'Message send command sent to worker',
          data: {
            userId,
            phoneNumber: number.trim(),
            messageLength: message.trim().length
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to send message command to worker',
        });
      }

    } catch (error) {
      this.logger.error('Error sending message via worker', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2315-2395
   * PUT /api/whatsapp/:userId/active-agent
   * MEJORAS: TypeScript, comprehensive validation, agent verification
   */
  public async setActiveAgent(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { agentId } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      if (!agentId) {
        res.status(400).json({
          success: false,
          error: 'Agent ID is required',
        });
        return;
      }

      this.logger.info('Set active agent request received', { userId, agentId });

      // Verify user exists
      const userDoc = await this.db.doc('users', userId).get();
      if (!userDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Verify agent exists
      const agentDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('agents')
        .doc(agentId)
        .get();

      if (!agentDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
        return;
      }

      // Update active agent in Firestore
      await this.db.doc('users', userId).update({
        active_agent_id: agentId,
        updatedAt: this.db.serverTimestamp()
      });

      // Switch agent in worker if active
      if (this.workerManager.isWorkerActive(userId)) {
        const success = await this.workerManager.switchAgent(userId, agentId);
        
        if (!success) {
          this.logger.warn('Failed to switch agent in worker, but Firestore updated', {
            userId,
            agentId
          });
        }
      }

      const agentData = agentDoc.data();
      res.json({
        success: true,
        message: 'Active agent updated successfully',
        data: {
          userId,
          agentId,
          agentName: agentData?.persona?.name || 'Unknown',
          workerNotified: this.workerManager.isWorkerActive(userId)
        }
      });

    } catch (error) {
      this.logger.error('Error setting active agent', {
        userId: req.params.userId,
        agentId: req.body.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 4161-4195
   * POST /api/whatsapp/:userId/pause
   * MEJORAS: TypeScript, pause/resume functionality
   */
  public async pauseBot(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { pause = true } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      this.logger.info('Bot pause request received', { userId, pause });

      // Check if worker is active
      if (!this.workerManager.isWorkerActive(userId)) {
        res.status(400).json({
          success: false,
          error: `Worker for user ${userId} is not active`,
        });
        return;
      }

      // Send pause command to worker
      const success = await this.workerManager.setBotPause(userId, pause);

      if (success) {
        res.json({
          success: true,
          message: `Bot ${pause ? 'paused' : 'resumed'} successfully`,
          data: {
            userId,
            paused: pause,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to send pause command to worker',
        });
      }

    } catch (error) {
      this.logger.error('Error setting bot pause state', {
        userId: req.params.userId,
        pause: req.body.pause,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * GET /api/whatsapp/workers/stats
   * Obtener estadísticas generales de todos los workers
   */
  public async getWorkerStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.workerManager.getWorkerStats();
      const healthChecks = await this.workerManager.performHealthCheck();

      res.json({
        success: true,
        data: {
          stats,
          health: {
            total: healthChecks.length,
            healthy: healthChecks.filter(hc => hc.isHealthy).length,
            unhealthy: healthChecks.filter(hc => !hc.isHealthy).length,
            checks: healthChecks
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error getting worker stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * POST /api/whatsapp/workers/cleanup
   * Limpiar workers no saludables
   */
  public async cleanupWorkers(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('Manual worker cleanup requested');

      const cleanedCount = await this.workerManager.cleanupUnhealthyWorkers();

      res.json({
        success: true,
        message: 'Worker cleanup completed',
        data: {
          cleanedWorkers: cleanedCount,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error('Error during worker cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
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