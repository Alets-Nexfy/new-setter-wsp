import { EventEmitter } from 'events';
import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { CacheService } from '@/core/services/CacheService';
import { QueueService } from '@/core/services/QueueService';
import { WhatsAppWorkerManager } from '@/workers/whatsapp-worker/WorkerManager';
import { WorkerStatus, WorkerConfig } from '@/workers/whatsapp-worker/types';
import { Session } from '@/core/models/Session';
import { Platform, ConnectionStatus, MessageType, MessageStatus } from '@/shared/types';
import environment from '../../../../config/environment';

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  type: MessageType;
  timestamp: Date;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  caption?: string;
  metadata?: Record<string, any>;
}

export interface WhatsAppContact {
  id: string;
  name: string;
  number: string;
  isGroup: boolean;
  isMe: boolean;
  isMyContact: boolean;
}

export class WhatsAppService extends EventEmitter {
  private static instance: WhatsAppService | null = null;
  private workerManager: WhatsAppWorkerManager;
  private logger: LoggerService;
  private db: SupabaseService;
  private cache: CacheService;
  private queue: QueueService;
  private isInitialized: boolean = false;

  private constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.queue = QueueService.getInstance();
    this.workerManager = new WhatsAppWorkerManager();
    this.setupWorkerManagerEvents();
  }

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing WhatsApp service with WorkerManager');

      // Initialize the worker manager (it will handle worker processes)
      // The WorkerManager initializes itself in its constructor
      
      this.isInitialized = true;
      this.emit('service:ready');
      
      this.logger.info('WhatsApp service initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize WhatsApp service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private setupWorkerManagerEvents(): void {
    // Forward worker events to service events
    this.workerManager.on('worker:qr', (data) => {
      this.emit('qr', {
        userId: data.userId,
        qr: data.qr,
        qrImage: data.qrImage
      });
    });

    this.workerManager.on('worker:ready', (data) => {
      this.emit('ready', {
        userId: data.userId,
        phoneNumber: data.phoneNumber
      });
    });

    this.workerManager.on('worker:message', (data) => {
      this.emit('message', {
        userId: data.userId,
        messageData: data.messageData
      });
    });

    this.workerManager.on('worker:auth_failure', (data) => {
      this.emit('auth_failure', {
        userId: data.userId,
        error: data.error
      });
    });

    this.workerManager.on('worker:error', (data) => {
      this.emit('error', {
        userId: data.userId,
        error: data.error
      });
    });

    this.workerManager.on('worker:created', (data) => {
      this.emit('worker_created', data);
    });

    this.workerManager.on('worker:exit', (data) => {
      this.emit('worker_exit', data);
    });

    this.workerManager.on('manager:ready', () => {
      this.logger.info('WorkerManager is ready');
    });

    this.workerManager.on('manager:shutdown', () => {
      this.logger.info('WorkerManager has shut down');
    });
  }

  // Session Management Methods
  public async createSession(userId: string, config: Partial<WorkerConfig> = {}): Promise<boolean> {
    try {
      this.logger.info('Creating WhatsApp session', { userId });

      // Check if session already exists in database
      const existingSession = await this.getSession(userId);
      if (!existingSession) {
        // Create new session in database
        await this.createSessionInDatabase(userId);
      }

      // Create worker for this user
      const success = await this.workerManager.createWorker(userId, config);
      
      if (success) {
        this.logger.info('WhatsApp session created successfully', { userId });
        return true;
      } else {
        this.logger.error('Failed to create WhatsApp worker', { userId });
        return false;
      }

    } catch (error) {
      this.logger.error('Error creating WhatsApp session', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async getSessionStatus(userId: string): Promise<WorkerStatus | null> {
    try {
      return await this.workerManager.getWorkerStatus(userId);
    } catch (error) {
      this.logger.error('Error getting session status', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  public async disconnectSession(userId: string): Promise<void> {
    try {
      this.logger.info('Disconnecting WhatsApp session', { userId });
      
      await this.workerManager.disconnectWorker(userId);
      await this.updateSessionStatus(userId, 'disconnected');
      
      this.logger.info('WhatsApp session disconnected successfully', { userId });
      
    } catch (error) {
      this.logger.error('Error disconnecting WhatsApp session', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Message Sending Methods
  public async sendMessage(userId: string, to: string, content: string): Promise<string> {
    try {
      this.logger.info('Sending WhatsApp message', {
        userId,
        to,
        contentLength: content.length
      });

      const result = await this.workerManager.sendMessage(userId, to, content);
      
      this.logger.info('WhatsApp message sent successfully', {
        userId,
        to,
        messageId: result?.messageId
      });

      return result?.messageId || 'unknown';

    } catch (error) {
      this.logger.error('Failed to send WhatsApp message', {
        userId,
        to,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async sendMedia(userId: string, to: string, mediaUrl: string, caption?: string): Promise<string> {
    try {
      this.logger.info('Sending WhatsApp media message', {
        userId,
        to,
        mediaUrl,
        caption
      });

      const result = await this.workerManager.sendMessage(userId, to, '', {
        media: { url: mediaUrl },
        caption
      });

      this.logger.info('WhatsApp media message sent successfully', {
        userId,
        to,
        messageId: result?.messageId
      });

      return result?.messageId || 'unknown';

    } catch (error) {
      this.logger.error('Failed to send WhatsApp media message', {
        userId,
        to,
        mediaUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Bot Control Methods
  public async pauseBot(userId: string): Promise<void> {
    try {
      this.logger.info('Pausing WhatsApp bot', { userId });
      
      await this.workerManager.pauseBot(userId);
      await this.updateSessionMetadata(userId, { botPaused: true });
      
      this.logger.info('WhatsApp bot paused successfully', { userId });
      
    } catch (error) {
      this.logger.error('Error pausing WhatsApp bot', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async resumeBot(userId: string): Promise<void> {
    try {
      this.logger.info('Resuming WhatsApp bot', { userId });
      
      await this.workerManager.resumeBot(userId);
      await this.updateSessionMetadata(userId, { botPaused: false });
      
      this.logger.info('WhatsApp bot resumed successfully', { userId });
      
    } catch (error) {
      this.logger.error('Error resuming WhatsApp bot', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async setActiveAgent(userId: string, agentId: string): Promise<void> {
    try {
      this.logger.info('Setting active agent', { userId, agentId });
      
      await this.workerManager.setActiveAgent(userId, agentId);
      await this.updateSessionMetadata(userId, { activeAgentId: agentId });
      
      this.logger.info('Active agent set successfully', { userId, agentId });
      
    } catch (error) {
      this.logger.error('Error setting active agent', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Statistics and Monitoring
  public getActiveWorkersCount(): number {
    return this.workerManager.getActiveWorkerCount();
  }

  public getAllWorkerStatuses(): Map<string, WorkerStatus> {
    return this.workerManager.getAllWorkerStatuses();
  }

  public async getSessionMetrics(userId: string): Promise<any> {
    try {
      const status = await this.workerManager.getWorkerStatus(userId);
      const session = await this.getSession(userId);
      
      return {
        status: status?.status || 'unknown',
        isAuthenticated: status?.isAuthenticated || false,
        phoneNumber: status?.phoneNumber,
        uptime: status?.uptime || 0,
        memoryUsage: status?.memoryUsage,
        lastActivity: status?.lastActivity,
        session: session ? {
          id: session.id,
          userId: session.userId,
          platform: session.platform,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        } : null
      };
      
    } catch (error) {
      this.logger.error('Error getting session metrics', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  // Database Operations
  private async createSessionInDatabase(userId: string): Promise<void> {
    try {
      const session = new Session({
        id: `whatsapp_${userId}_${Date.now()}`,
        userId,
        platform: 'whatsapp' as Platform,
        status: 'connecting' as ConnectionStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          workerCreated: true,
          botPaused: false
        }
      });

      await this.db.collection('sessions').add(session.toFirestore());
      
    } catch (error) {
      this.logger.error('Error creating session in database', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async getSession(userId: string): Promise<Session | null> {
    try {
      const query = this.db.collection('sessions')
        .where('userId', '==', userId)
        .where('platform', '==', 'whatsapp')
        .orderBy('createdAt', 'desc')
        .limit(1);

      const snapshot = await query.get();
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return Session.fromFirestore({ id: doc.id, ...doc.data() });
      }
      
      return null;
      
    } catch (error) {
      this.logger.error('Error getting session', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  private async updateSessionStatus(userId: string, status: ConnectionStatus): Promise<void> {
    try {
      const query = this.db.collection('sessions')
        .where('userId', '==', userId)
        .where('platform', '==', 'whatsapp');

      const snapshot = await query.get();

      for (const doc of snapshot.docs) {
        await doc.ref.update({
          status,
          updatedAt: new Date(),
        });
      }
      
    } catch (error) {
      this.logger.error('Error updating session status', {
        userId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async updateSessionMetadata(userId: string, metadata: Record<string, any>): Promise<void> {
    try {
      const query = this.db.collection('sessions')
        .where('userId', '==', userId)
        .where('platform', '==', 'whatsapp');

      const snapshot = await query.get();

      for (const doc of snapshot.docs) {
        const currentMetadata = doc.data().metadata || {};
        await doc.ref.update({
          metadata: { ...currentMetadata, ...metadata },
          updatedAt: new Date(),
        });
      }
      
    } catch (error) {
      this.logger.error('Error updating session metadata', {
        userId,
        metadata,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  public async isConnected(userId: string): Promise<boolean> {
    try {
      const status = await this.getSessionStatus(userId);
      return status?.status === 'running';
    } catch (error) {
      this.logger.error('Error checking connection status:', error);
      return false;
    }
  }

  public async disconnect(userId: string): Promise<void> {
    try {
      await this.disconnectSession(userId);
    } catch (error) {
      this.logger.error('Error disconnecting session:', error);
      throw error;
    }
  }

  public async sendContact(userId: string, to: string, contact: any): Promise<string> {
    try {
      if (!this.isInitialized) {
        throw new Error('WhatsApp service not initialized');
      }

      const messageId = this.generateMessageId();
      const contactMessage = `Contact: ${contact.name}`;
      const options = { type: 'contact', contact };

      await this.workerManager.sendMessage(userId, to, contactMessage, options);
      return messageId;
    } catch (error) {
      this.logger.error('Error sending contact:', error);
      throw error;
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Cleanup
  public async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down WhatsApp service');
      
      await this.workerManager.shutdown();
      this.isInitialized = false;
      
      this.logger.info('WhatsApp service shut down successfully');
      
    } catch (error) {
      this.logger.error('Error shutting down WhatsApp service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public static async cleanup(): Promise<void> {
    if (WhatsAppService.instance) {
      await WhatsAppService.instance.shutdown();
      WhatsAppService.instance = null;
    }
  }
}