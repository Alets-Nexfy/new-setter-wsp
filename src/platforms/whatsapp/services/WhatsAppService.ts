import { Client, LocalAuth, Message, MessageMedia, Contact } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import { EventEmitter } from 'events';
import { LoggerService } from '@/core/services/LoggerService';
import { DatabaseService } from '@/core/services/DatabaseService';
import { CacheService } from '@/core/services/CacheService';
import { QueueService } from '@/core/services/QueueService';
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
  private static instances: Map<string, WhatsAppService> = new Map();
  private client: Client | null = null;
  private sessionId: string;
  private userId: string;
  private logger: LoggerService;
  private db: DatabaseService;
  private cache: CacheService;
  private queue: QueueService;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor(sessionId: string, userId: string) {
    super();
    this.sessionId = sessionId;
    this.userId = userId;
    this.logger = LoggerService.getInstance();
    this.db = DatabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.queue = QueueService.getInstance();
  }

  public static getInstance(sessionId: string, userId: string): WhatsAppService {
    const key = `${userId}:${sessionId}`;
    if (!WhatsAppService.instances.has(key)) {
      WhatsAppService.instances.set(key, new WhatsAppService(sessionId, userId));
    }
    return WhatsAppService.instances.get(key)!;
  }

  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing WhatsApp service', {
        sessionId: this.sessionId,
        userId: this.userId,
      });

      // Check if session exists in database
      const session = await this.getSession();
      if (!session) {
        throw new Error('Session not found');
      }

      // Initialize WhatsApp client
      await this.initializeClient();

      // Update session status
      await this.updateSessionStatus('connecting');

    } catch (error) {
      this.logger.error('Failed to initialize WhatsApp service', {
        sessionId: this.sessionId,
        userId: this.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async initializeClient(): Promise<void> {
    try {
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: this.sessionId,
          dataPath: environment.paths.userDataPath,
        }),
        puppeteer: {
          headless: whatsappConfig.headless,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
          userAgent: whatsappConfig.userAgent,
        },
        webVersion: '2.2402.5',
        webVersionCache: {
          type: 'local',
        },
      });

      this.setupEventHandlers();
      await this.client.initialize();

    } catch (error) {
      this.logger.error('Failed to initialize WhatsApp client', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    // Authentication events
    this.client.on('qr', async (qr: string) => {
      try {
        const qrCodeDataUrl = await qrcode.toDataURL(qr);
        await this.updateSessionQRCode(qrCodeDataUrl);
        this.emit('qr', qrCodeDataUrl);
        
        this.logger.info('QR code generated', {
          sessionId: this.sessionId,
          userId: this.userId,
        });
      } catch (error) {
        this.logger.error('Failed to generate QR code', {
          sessionId: this.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.client.on('ready', async () => {
      try {
        const info = this.client!.info;
        await this.updateSessionConnectionInfo(info.wid.user, info.pushname);
        await this.updateSessionStatus('connected');
        
        this.logger.info('WhatsApp client ready', {
          sessionId: this.sessionId,
          userId: this.userId,
          phoneNumber: info.wid.user,
          pushName: info.pushname,
        });

        this.emit('ready', {
          phoneNumber: info.wid.user,
          pushName: info.pushname,
        });

        // Reset reconnect attempts on successful connection
        this.reconnectAttempts = 0;

      } catch (error) {
        this.logger.error('Error in ready event', {
          sessionId: this.sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.client.on('authenticated', () => {
      this.logger.info('WhatsApp client authenticated', {
        sessionId: this.sessionId,
        userId: this.userId,
      });
      this.emit('authenticated');
    });

    this.client.on('auth_failure', async (msg: string) => {
      this.logger.error('WhatsApp authentication failed', {
        sessionId: this.sessionId,
        userId: this.userId,
        message: msg,
      });

      await this.updateSessionStatus('error');
      this.emit('auth_failure', msg);
    });

    // Message events
    this.client.on('message', async (message: Message) => {
      try {
        await this.handleIncomingMessage(message);
      } catch (error) {
        this.logger.error('Error handling incoming message', {
          sessionId: this.sessionId,
          messageId: message.id._serialized,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.client.on('message_create', async (message: Message) => {
      try {
        // Handle outgoing messages (messages sent by the client)
        if (message.fromMe) {
          await this.handleOutgoingMessage(message);
        }
      } catch (error) {
        this.logger.error('Error handling outgoing message', {
          sessionId: this.sessionId,
          messageId: message.id._serialized,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Connection events
    this.client.on('disconnected', async (reason: string) => {
      this.logger.warn('WhatsApp client disconnected', {
        sessionId: this.sessionId,
        userId: this.userId,
        reason,
      });

      await this.updateSessionStatus('disconnected');
      this.emit('disconnected', reason);

      // Attempt reconnection
      await this.handleReconnection();
    });

    this.client.on('loading_screen', (percent: string, message: string) => {
      this.logger.debug('WhatsApp loading screen', {
        sessionId: this.sessionId,
        percent,
        message,
      });
    });
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    try {
      // Skip system messages
      if (message.isStatus) return;

      const messageData: WhatsAppMessage = {
        id: message.id._serialized,
        from: message.from,
        to: message.to,
        body: message.body,
        type: this.mapMessageType(message.type),
        timestamp: new Date(message.timestamp * 1000),
        metadata: {
          isGroup: message.from.includes('@g.us'),
          isFromMe: message.fromMe,
          hasMedia: message.hasMedia,
        },
      };

      // Handle media messages
      if (message.hasMedia) {
        const media = await message.downloadMedia();
        if (media) {
          messageData.mediaUrl = media.data;
          messageData.fileName = media.filename;
          messageData.mimeType = media.mimetype;
          messageData.caption = message.caption;
        }
      }

      // Save message to database
      await this.saveMessage(messageData);

      // Emit event
      this.emit('message', messageData);

      // Queue for AI processing if enabled
      await this.queue.addAIJob('ai:generate-response', {
        sessionId: this.sessionId,
        messageId: messageData.id,
        platform: 'whatsapp',
        message: messageData,
      });

      this.logger.info('Incoming message processed', {
        sessionId: this.sessionId,
        messageId: messageData.id,
        from: messageData.from,
        type: messageData.type,
      });

    } catch (error) {
      this.logger.error('Error processing incoming message', {
        sessionId: this.sessionId,
        messageId: message.id._serialized,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleOutgoingMessage(message: Message): Promise<void> {
    try {
      const messageData: WhatsAppMessage = {
        id: message.id._serialized,
        from: message.from,
        to: message.to,
        body: message.body,
        type: this.mapMessageType(message.type),
        timestamp: new Date(message.timestamp * 1000),
        metadata: {
          isGroup: message.from.includes('@g.us'),
          isFromMe: message.fromMe,
          hasMedia: message.hasMedia,
        },
      };

      // Save message to database
      await this.saveMessage(messageData);

      // Update message status
      await this.updateMessageStatus(messageData.id, 'sent');

      this.logger.info('Outgoing message processed', {
        sessionId: this.sessionId,
        messageId: messageData.id,
        to: messageData.to,
        type: messageData.type,
      });

    } catch (error) {
      this.logger.error('Error processing outgoing message', {
        sessionId: this.sessionId,
        messageId: message.id._serialized,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private mapMessageType(whatsappType: string): MessageType {
    switch (whatsappType) {
      case 'text':
        return 'text';
      case 'image':
        return 'image';
      case 'video':
        return 'video';
      case 'audio':
        return 'audio';
      case 'document':
        return 'document';
      case 'location':
        return 'location';
      case 'contact':
        return 'contact';
      default:
        return 'text';
    }
  }

  // Public methods for sending messages
  public async sendMessage(to: string, content: string): Promise<string> {
    if (!this.client || !this.isConnected()) {
      throw new Error('WhatsApp client not connected');
    }

    try {
      const message = await this.client.sendMessage(to, content);
      
      this.logger.info('Message sent successfully', {
        sessionId: this.sessionId,
        messageId: message.id._serialized,
        to,
        content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      });

      return message.id._serialized;

    } catch (error) {
      this.logger.error('Failed to send message', {
        sessionId: this.sessionId,
        to,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<string> {
    if (!this.client || !this.isConnected()) {
      throw new Error('WhatsApp client not connected');
    }

    try {
      const media = MessageMedia.fromUrl(mediaUrl);
      const message = await this.client.sendMessage(to, media, { caption });

      this.logger.info('Media message sent successfully', {
        sessionId: this.sessionId,
        messageId: message.id._serialized,
        to,
        mediaUrl,
        caption,
      });

      return message.id._serialized;

    } catch (error) {
      this.logger.error('Failed to send media message', {
        sessionId: this.sessionId,
        to,
        mediaUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async sendContact(to: string, contactId: string): Promise<string> {
    if (!this.client || !this.isConnected()) {
      throw new Error('WhatsApp client not connected');
    }

    try {
      const contact = await this.client.getContactById(contactId);
      const message = await this.client.sendMessage(to, contact);

      this.logger.info('Contact message sent successfully', {
        sessionId: this.sessionId,
        messageId: message.id._serialized,
        to,
        contactId,
      });

      return message.id._serialized;

    } catch (error) {
      this.logger.error('Failed to send contact message', {
        sessionId: this.sessionId,
        to,
        contactId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Connection management
  public isConnected(): boolean {
    return this.client?.info !== undefined;
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }

      await this.updateSessionStatus('disconnected');

      this.logger.info('WhatsApp client disconnected', {
        sessionId: this.sessionId,
        userId: this.userId,
      });

      this.emit('disconnected', 'Manual disconnect');

    } catch (error) {
      this.logger.error('Error disconnecting WhatsApp client', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async handleReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached', {
        sessionId: this.sessionId,
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.logger.info('Attempting reconnection', {
      sessionId: this.sessionId,
      attempt: this.reconnectAttempts,
      delay,
    });

    setTimeout(async () => {
      try {
        await this.initialize();
      } catch (error) {
        this.logger.error('Reconnection failed', {
          sessionId: this.sessionId,
          attempt: this.reconnectAttempts,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, delay);
  }

  // Database operations
  private async getSession(): Promise<Session | null> {
    try {
      const doc = await this.db.doc('sessions', this.sessionId).get();
      if (doc.exists) {
        return Session.fromFirestore({ id: doc.id, ...doc.data() });
      }
      return null;
    } catch (error) {
      this.logger.error('Error getting session', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  private async updateSessionStatus(status: ConnectionStatus): Promise<void> {
    try {
      await this.db.doc('sessions', this.sessionId).update({
        status,
        updatedAt: new Date(),
      });
    } catch (error) {
      this.logger.error('Error updating session status', {
        sessionId: this.sessionId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async updateSessionQRCode(qrCode: string): Promise<void> {
    try {
      await this.db.doc('sessions', this.sessionId).update({
        qrCode,
        updatedAt: new Date(),
      });
    } catch (error) {
      this.logger.error('Error updating session QR code', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async updateSessionConnectionInfo(phoneNumber?: string, username?: string): Promise<void> {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (phoneNumber) updateData.phoneNumber = phoneNumber;
      if (username) updateData.username = username;

      await this.db.doc('sessions', this.sessionId).update(updateData);
    } catch (error) {
      this.logger.error('Error updating session connection info', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async saveMessage(messageData: WhatsAppMessage): Promise<void> {
    try {
      await this.db.collection('messages').add({
        ...messageData,
        sessionId: this.sessionId,
        platform: 'whatsapp',
        status: 'received',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      this.logger.error('Error saving message', {
        sessionId: this.sessionId,
        messageId: messageData.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async updateMessageStatus(messageId: string, status: MessageStatus): Promise<void> {
    try {
      const query = this.db.collection('messages')
        .where('id', '==', messageId)
        .where('sessionId', '==', this.sessionId);

      const snapshot = await query.get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        await doc.ref.update({
          status,
          updatedAt: new Date(),
        });
      }
    } catch (error) {
      this.logger.error('Error updating message status', {
        sessionId: this.sessionId,
        messageId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Cleanup
  public static async cleanup(): Promise<void> {
    for (const [key, instance] of WhatsAppService.instances) {
      try {
        await instance.disconnect();
      } catch (error) {
        console.error(`Error cleaning up WhatsApp service ${key}:`, error);
      }
    }
    WhatsAppService.instances.clear();
  }
} 