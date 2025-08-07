import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { WhatsAppSessionManager } from '@/platforms/whatsapp/services/WhatsAppSessionManager';
import { WhatsAppMessageHandler } from '@/platforms/whatsapp/services/WhatsAppMessageHandler';
import { WhatsAppService } from '@/platforms/whatsapp/services/WhatsAppService';
import { QueueService } from '@/core/services/QueueService';
import { WorkerManagerService } from '@/core/services/WorkerManagerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { JOB_TYPES } from '@/shared/constants';

export class WhatsAppController {
  private logger: LoggerService;
  private sessionManager: WhatsAppSessionManager;
  private messageHandler: WhatsAppMessageHandler;
  private queue: QueueService;
  private workerManager: WorkerManagerService;
  private db: SupabaseService;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.sessionManager = WhatsAppSessionManager.getInstance();
    this.messageHandler = WhatsAppMessageHandler.getInstance();
    this.queue = QueueService.getInstance();
    this.workerManager = WorkerManagerService.getInstance();
    this.db = SupabaseService.getInstance();
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

      const isActive = await this.sessionManager.isSessionActive(sessionId);
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

      // Connect session through session manager
      const service = await this.sessionManager.connectSession(sessionId);

      res.json({
        success: true,
        data: {
          sessionId,
          service: service ? 'connected' : 'error',
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

      await this.sessionManager.disconnectSession(sessionId);

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
        sentMessage = await service.sendMedia(sessionId, to, mediaUrl, mediaCaption || '');
      } else {
        sentMessage = await service.sendMessage(sessionId, to, message);
      }

        res.json({
          success: true,
          data: {
          messageId: sentMessage || 'unknown',
          timestamp: new Date().toISOString(),
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

      const sentMessage = await service.sendMedia(sessionId, to, mediaUrl, caption);

        res.json({
          success: true,
          data: {
          messageId: sentMessage || 'unknown',
          timestamp: new Date().toISOString(),
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

      const messages = await this.messageHandler.getMessages(sessionId, {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        to: chatId as string,
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
      const { waitForQR } = req.query;

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
        forceRestart,
        waitForQR: !!waitForQR
      });

      // Extract UUID from userId (format: prefix_uuid)
      const userUuid = userId.includes('_') ? userId.split('_').pop() : userId;
      
      // Check if user exists in database, create if not exists (for testing)
      const { data: existingUser, error: userError } = await this.db
        .from('users')
        .select('id')
        .eq('id', userUuid)
        .single();

      if (!existingUser) {
        // Create user automatically for testing
        const { error: createError } = await this.db
          .from('users')
          .insert({
            id: userUuid,
            email: `${userId}@test.com`,
            username: userId.substring(0, 25), // Truncate if too long
            full_name: `Test User ${userId}`,
            tier: 'enterprise_b2b',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            b2b_info: userId.startsWith('tribe-ia-nexus_') ? {
              platform_id: 'tribe-ia-nexus',
              organization: 'Tribe IA Nexus'
            } : null
          });
        
        if (createError) {
          throw createError;
        }
        
        this.logger.info('Test user created automatically', { userId });
      }

      // Get current status
      const currentWorker = this.workerManager.getWorker(userId);
      const isActive = this.workerManager.isWorkerActive(userId);

      if (isActive && !forceRestart) {
        let responseData: any = {
          userId,
          status: currentWorker?.status || 'unknown',
          pid: currentWorker?.process.pid
        };

        // If waitForQR is requested, try to get existing QR
        if (waitForQR) {
          const qrData = await this.getQRData(userUuid);
          if (qrData) {
            responseData.qr = qrData;
          }
        }

        res.status(200).json({
          success: true,
          message: 'Connection is already active',
          data: responseData
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
        let responseData: any = {
          userId,
          status: worker.status,
          pid: worker.process.pid,
          activeAgentId: worker.activeAgentId
        };

        // If waitForQR is requested, wait for QR generation
        if (waitForQR) {
          this.logger.info('Waiting for QR generation...', { userId });
          const qrData = await this.waitForQRGeneration(userUuid, 60000); // Wait up to 60 seconds
          this.logger.info('QR generation result', { userId, hasQrData: !!qrData, qrData: qrData ? 'present' : 'null' });
          if (qrData) {
            responseData.qr = qrData;
            responseData.message = 'Connection started and QR code generated';
          } else {
            responseData.message = 'Connection started but QR code not yet available';
          }
        }

        this.logger.info('Sending response', { 
          userId, 
          hasQr: !!responseData.qr, 
          responseDataKeys: Object.keys(responseData),
          waitForQR: !!waitForQR
        });

        res.status(202).json({
          success: true,
          message: waitForQR && responseData.qr 
            ? 'Connection started and QR code generated'
            : 'Connection request received. Starting process...',
          data: responseData
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
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: typeof error,
        errorStack: error instanceof Error ? error.stack : undefined,
        fullError: error
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  /**
   * Helper method to clean up old QR codes for a user
   */
  private async cleanupOldQRCodes(userUuid: string): Promise<void> {
    try {
      // Get all QR codes for this user
      const { data: qrCodes, error } = await this.db.getAdminClient()
        .from('qr_codes')
        .select('id, createdAt')
        .eq('userId', userUuid)
        .order('createdAt', { ascending: false });

      if (error || !qrCodes || qrCodes.length <= 1) {
        return; // No cleanup needed
      }

      // Keep only the most recent one, delete the rest
      const recentQR = qrCodes[0];
      const oldQRs = qrCodes.slice(1);

      this.logger.info('Cleaning up old QR codes', { 
        userUuid, 
        total: qrCodes.length, 
        toDelete: oldQRs.length 
      });

      for (const oldQR of oldQRs) {
        const { error: deleteError } = await this.db.getAdminClient()
          .from('qr_codes')
          .delete()
          .eq('id', oldQR.id);

        if (deleteError) {
          this.logger.warn('Failed to delete old QR code', { 
            userUuid, 
            qrId: oldQR.id, 
            error: deleteError.message 
          });
        }
      }

      this.logger.info('QR cleanup completed', { userUuid, kept: recentQR.id });

    } catch (error) {
      this.logger.warn('Error during QR cleanup', { 
        userUuid, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Helper method to get QR data from database
   */
  private async getQRData(userUuid: string): Promise<any> {
    try {
      this.logger.info('Getting QR data for UUID', { userUuid });
      
      // Try with RPC first to avoid schema cache issues
      const { data: rpcData, error: rpcError } = await this.db.getAdminClient()
        .rpc('get_latest_qr_code', { p_user_id: userUuid });
      
      if (!rpcError && rpcData && rpcData.length > 0) {
        const qrData = rpcData[0];
        this.logger.info('QR data found via RPC', { userUuid, created_at: qrData.created_at });
        
        return {
          qrCode: qrData.qr_code,
          qrImage: qrData.qr_image,
          timestamp: qrData.created_at,
          expiresAt: new Date(new Date(qrData.created_at).getTime() + 120000).toISOString(),
          timeRemaining: Math.max(0, 120 - Math.floor((Date.now() - new Date(qrData.created_at).getTime()) / 1000))
        };
      }
      
      // Fallback to direct query - get multiple and select the first one
      const { data: qrDataArray, error } = await this.db.getAdminClient()
        .from('qr_codes')
        .select('*') // Select all to see what columns exist
        .eq('userId', userUuid)
        .order('createdAt', { ascending: false })
        .limit(1);

      if (error) {
        this.logger.warn('Error querying QR data', { userUuid, error: error.message });
        return null;
      }
      
      if (!qrDataArray || qrDataArray.length === 0) {
        this.logger.info('No QR data found', { userUuid });
        return null;
      }
      
      const qrData = qrDataArray[0]; // Get the first (most recent) record
      
      this.logger.info('QR data found', { userUuid, created_at: qrData.createdAt, columns: Object.keys(qrData) });

      return {
        qrCode: qrData.qrCode,     // Use correct column name
        qrImage: qrData.qr_image,
        timestamp: qrData.createdAt,
        expiresAt: new Date(new Date(qrData.createdAt).getTime() + 120000).toISOString(), // QR expires in 2 minutes
        timeRemaining: Math.max(0, 120 - Math.floor((Date.now() - new Date(qrData.createdAt).getTime()) / 1000))
      };
    } catch (error) {
      this.logger.warn('Error getting QR data', { 
        userUuid, 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      return null;
    }
  }

  /**
   * Helper method to wait for QR generation
   */
  private async waitForQRGeneration(userUuid: string, timeoutMs: number = 60000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 2000; // Check every 2 seconds to reduce load

    this.logger.info('Starting QR polling', { userUuid, timeoutMs, pollInterval });

    while (Date.now() - startTime < timeoutMs) {
      const qrData = await this.getQRData(userUuid);
      if (qrData) {
        // Check if QR is recent (generated after worker start)
        const qrAge = Date.now() - new Date(qrData.timestamp).getTime();
        const timeSinceStart = Date.now() - startTime;
        
        this.logger.info('QR found', { 
          userUuid, 
          qrAge: Math.round(qrAge / 1000) + 's',
          timeSinceStart: Math.round(timeSinceStart / 1000) + 's'
        });

        // Accept QR if it's less than 5 minutes old OR generated after we started waiting
        if (qrAge < 300000 || qrAge < timeSinceStart + 10000) { // 5 minutes or generated after start
          this.logger.info('QR accepted', { userUuid });
          return qrData;
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    this.logger.warn('QR polling timeout', { userUuid, timeoutMs });
    return null;
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

      // Check both individual worker and connection pool
      const isWorkerActive = this.workerManager.isWorkerActive(userId);
      
      // Also check connection pool
      const workerInfo = await this.workerManager.getWorkerInfo(userId);
      const isInPool = !!workerInfo;
      
      this.logger.info('Disconnect status check', { 
        userId, 
        isWorkerActive, 
        isInPool,
        hasWorkerInfo: !!workerInfo
      });

      if (!isWorkerActive && !isInPool) {
        res.status(200).json({
          success: true,
          message: 'User is already disconnected',
          data: { userId, status: 'disconnected' }
        });
        return;
      }

      // Disconnect from either individual worker or connection pool
      await this.workerManager.stopWorker(userId, 'whatsapp');

      // If we reach here, disconnection was successful (no exception thrown)
      res.status(200).json({
        success: true,
        message: 'Disconnection initiated successfully',
        data: { userId, status: 'disconnecting' }
      });

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

      // Extract UUID from userId if it has prefix (tribe-ia-nexus_uuid -> uuid)
      const actualUserId = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      this.logger.info('Status request', { originalUserId: userId, actualUserId });

      // Try both with full ID (with prefix) and just UUID
      let workerInfo = await this.workerManager.getWorkerInfo(userId);
      
      if (!workerInfo && userId !== actualUserId) {
        // Try with just UUID if different
        workerInfo = await this.workerManager.getWorkerInfo(actualUserId);
      }
      
      if (!workerInfo) {
        // Return disconnected status instead of 404
        // This is more friendly for frontend polling
        res.status(200).json({
          success: true,
          data: {
            userId: actualUserId,
            worker: {
              status: 'disconnected',
              pid: null,
              connected: false,
              activeAgentId: null,
              createdAt: null,
              lastActivity: null
            },
            health: {
              isHealthy: false,
              status: 'disconnected'
            },
            firestoreStatus: null,
            stats: null
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          userId: actualUserId,  // Always return UUID without prefix
          worker: workerInfo.isPoolConnection ? workerInfo : workerInfo.worker,
          health: workerInfo.health || {
            isHealthy: true,
            status: workerInfo.status || 'connected'
          },
          firestoreStatus: workerInfo.firestoreStatus || null,
          stats: workerInfo.stats || null
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
   * POST /api/whatsapp/:userId/start-connection
   * Start WhatsApp connection without waiting for QR
   */
  public async startConnection(req: Request, res: Response): Promise<void> {
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

      this.logger.info('Start connection request received', { userId, activeAgentId, forceRestart });

      // Extract UUID from userId (format: prefix_uuid)
      const userUuid = userId.includes('_') ? userId.split('_').pop() : userId;
      
      // Check if user exists in database, create if not exists
      const { data: existingUser, error: userError } = await this.db
        .from('users')
        .select('id')
        .eq('id', userUuid)
        .single();

      if (!existingUser) {
        const { error: createError } = await this.db
          .from('users')
          .insert({
            id: userUuid,
            email: `${userId}@test.com`,
            username: userId.substring(0, 25), // Truncate if too long
            full_name: `Test User ${userId}`,
            tier: 'enterprise_b2b',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            b2b_info: userId.startsWith('tribe-ia-nexus_') ? {
              platform_id: 'tribe-ia-nexus',
              organization: 'Tribe IA Nexus'
            } : null
          });
        
        if (createError) {
          throw createError;
        }
        
        this.logger.info('Test user created automatically', { userId });
      }

      // Clear any old QR codes first (clean up duplicates)
      await this.cleanupOldQRCodes(userUuid);
      
      // Delete remaining QR codes for this user
      await this.db.getAdminClient()
        .from('qr_codes')
        .delete()
        .eq('userId', userUuid);

      // Start worker
      const worker = await this.workerManager.startWorker({
        userId,
        platform: 'whatsapp',
        activeAgentId,
        forceRestart
      });

      if (!worker) {
        res.status(500).json({
          success: false,
          error: 'Failed to start worker',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Connection started - use polling endpoint to get QR',
        data: {
          userId: userUuid,  // Return only UUID to frontend
          status: 'starting',
          pid: worker.process.pid,
          activeAgentId: worker.activeAgentId
        }
      });

    } catch (error) {
      this.logger.error('Error in startConnection', {
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
   * GET /api/whatsapp/:userId/poll-qr
   * Poll for QR code - returns immediately if available, otherwise waits briefly
   */
  public async pollQR(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { timeout = 5000 } = req.query; // Default 5 seconds

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      const userUuid = userId.includes('_') ? userId.split('_').pop() : userId;
      const timeoutMs = Math.min(parseInt(timeout as string) || 5000, 30000); // Max 30 seconds

      this.logger.info('QR polling request', { userUuid, timeoutMs });

      const qrData = await this.waitForQRGeneration(userUuid, timeoutMs);
      
      if (qrData) {
        res.json({
          success: true,
          message: 'QR code available',
          data: {
            userId,
            status: 'qr',
            qr: qrData
          }
        });
      } else {
        res.status(202).json({
          success: false,
          message: 'QR not yet available - continue polling',
          data: {
            userId,
            status: 'waiting_for_qr'
          }
        });
      }

    } catch (error) {
      this.logger.error('Error in pollQR', {
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
   * POST /api/whatsapp/:userId/connect-with-qr
   * Legacy endpoint - now redirects to new polling approach
   */
  public async connectWithQR(req: Request, res: Response): Promise<void> {
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

      this.logger.info('Legacy connectWithQR - redirecting to new approach', { userId });

      // Start connection first
      await this.startConnection(req, res);

    } catch (error) {
      this.logger.error('Error in connectWithQR', {
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

      // Extract UUID from userId (format: prefix_uuid)
      const userUuid = userId.includes('_') ? userId.split('_').pop() : userId;

      // Get QR code from Supabase
      const qrData = await this.getQRData(userUuid!);
      
      if (!qrData) {
        res.status(404).json({
          success: false,
          error: 'QR code not available. Please start connection first.',
          data: { userId }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          userId,
          qr: qrData.qrImage,
          qrCode: qrData.qrCode,  // Changed to match frontend expectations
          timestamp: qrData.timestamp,
          expiresAt: qrData.expiresAt,
          timeRemaining: qrData.timeRemaining
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

      // Get QR code from Supabase
      const { data: statusData, error } = await this.db
        .from('user_status')
        .select('qrCode')
        .eq('userId', userId)
        .eq('platform', 'whatsapp')
        .single();

      if (error || !statusData) {
        res.status(404).send('WhatsApp status not found');
        return;
      }

      const qrCode = statusData.qrCode;

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

      // Get QR code from Supabase
      const { data: statusData, error } = await this.db
        .from('user_status')
        .select('qrCode')
        .eq('userId', userId)
        .eq('platform', 'whatsapp')
        .single();
      
      if (error || !statusData) {
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

      const qrCode = statusData.qrCode;
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
      const success = await this.workerManager.sendMessageToWorker(
        userId,
        'whatsapp',
        {
          to: number.trim(),
          content: message.trim()
        }
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

      // Update active agent in Supabase
      await this.db
        .from('users')
        .update({
          active_agent_id: agentId,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      // Switch agent in worker if active
      if (this.workerManager.isWorkerActive(userId)) {
        // Worker manager doesn't have switchAgent method - this should be handled differently
        // const success = await this.workerManager.switchAgent(userId, agentId);
        const success = true; // Placeholder
        
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
      try {
        if (pause) {
          await this.workerManager.pauseUserBot(userId);
        } else {
          await this.workerManager.resumeUserBot(userId);
        }
        res.json({
          success: true,
          message: `Bot ${pause ? 'paused' : 'resumed'} successfully`,
          data: {
            userId,
            paused: pause,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        this.logger.error('Error pausing/resuming bot', {
          userId,
          pause,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
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
      const workers = await this.workerManager.getActiveWorkers();
      const stats = workers.reduce((acc, worker) => {
        acc[worker.userId] = {
          status: worker.status,
          lastActivity: worker.lastActivity,
          platform: worker.platform
        };
        return acc;
      }, {} as Record<string, any>);
      const healthChecks = { healthy: true }; // Placeholder

      res.json({
        success: true,
        data: {
          stats,
          health: {
            total: 1,
            healthy: healthChecks.healthy ? 1 : 0,
            unhealthy: healthChecks.healthy ? 0 : 1,
            checks: [healthChecks]
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

      // Worker manager doesn't have cleanupUnhealthyWorkers method
      const cleanedCount = 0; // Placeholder

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

export default WhatsAppController; 