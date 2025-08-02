import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { CacheService } from '@/core/services/CacheService';
import { QueueService } from '@/core/services/QueueService';
import { WhatsAppService } from './WhatsAppService';
import { WhatsAppSessionManager } from './WhatsAppSessionManager';
import { MessageType, MessageStatus, Platform } from '@/shared/types';

export interface SendMessageOptions {
  sessionId: string;
  to: string;
  content: string;
  type?: MessageType;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  caption?: string;
  metadata?: Record<string, any>;
}

export interface MessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

export interface MessageInfo {
  id: string;
  sessionId: string;
  platform: Platform;
  from: string;
  to: string;
  type: MessageType;
  content: string;
  status: MessageStatus;
  timestamp: Date;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  caption?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export class WhatsAppMessageHandler {
  private static instance: WhatsAppMessageHandler;
  private logger: LoggerService;
  private db: SupabaseService;
  private cache: CacheService;
  private queue: QueueService;
  private sessionManager: WhatsAppSessionManager;

  private constructor() {
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.queue = QueueService.getInstance();
    this.sessionManager = WhatsAppSessionManager.getInstance();
  }

  public static getInstance(): WhatsAppMessageHandler {
    if (!WhatsAppMessageHandler.instance) {
      WhatsAppMessageHandler.instance = new WhatsAppMessageHandler();
    }
    return WhatsAppMessageHandler.instance;
  }

  public async sendMessage(options: SendMessageOptions): Promise<MessageResponse> {
    try {
      // Validate session
      const session = await this.sessionManager.getSession(options.sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
          timestamp: new Date(),
        };
      }

      // Get WhatsApp service
      const whatsappService = this.sessionManager.getActiveService(options.sessionId);
      if (!whatsappService || !whatsappService.isConnected()) {
        return {
          success: false,
          error: 'WhatsApp session not connected',
          timestamp: new Date(),
        };
      }

      let messageId: string;

      // Send based on type
      switch (options.type) {
        case 'text':
          messageId = await whatsappService.sendMessage(options.to, options.content);
          break;

        case 'image':
        case 'video':
        case 'audio':
        case 'document':
          if (!options.mediaUrl) {
            return {
              success: false,
              error: 'Media URL is required for media messages',
              timestamp: new Date(),
            };
          }
          messageId = await whatsappService.sendMedia(options.to, options.mediaUrl, options.caption);
          break;

        case 'contact':
          messageId = await whatsappService.sendContact(options.to, options.content);
          break;

        default:
          messageId = await whatsappService.sendMessage(options.to, options.content);
      }

      // Save message to database
      const messageData: MessageInfo = {
        id: messageId,
        sessionId: options.sessionId,
        platform: 'whatsapp',
        from: 'me',
        to: options.to,
        type: options.type || 'text',
        content: options.content,
        status: 'sent',
        timestamp: new Date(),
        mediaUrl: options.mediaUrl,
        fileName: options.fileName,
        mimeType: options.mimeType,
        caption: options.caption,
        metadata: options.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.saveMessage(messageData);

      // Update session activity
      await this.sessionManager.updateSessionActivity(options.sessionId);

      this.logger.info('Message sent successfully', {
        sessionId: options.sessionId,
        messageId,
        to: options.to,
        type: options.type || 'text',
      });

      return {
        success: true,
        messageId,
        timestamp: new Date(),
      };

    } catch (error) {
      this.logger.error('Failed to send message', {
        sessionId: options.sessionId,
        to: options.to,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  public async sendBulkMessages(
    sessionId: string,
    messages: Array<{ to: string; content: string; type?: MessageType; mediaUrl?: string; caption?: string }>
  ): Promise<MessageResponse[]> {
    try {
      const results: MessageResponse[] = [];

      for (const message of messages) {
        const result = await this.sendMessage({
          sessionId,
          to: message.to,
          content: message.content,
          type: message.type,
          mediaUrl: message.mediaUrl,
          caption: message.caption,
        });

        results.push(result);

        // Add delay between messages to avoid rate limiting
        if (results.length < messages.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return results;

    } catch (error) {
      this.logger.error('Failed to send bulk messages', {
        sessionId,
        messageCount: messages.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return messages.map(() => ({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      }));
    }
  }

  public async getMessages(
    sessionId: string,
    options: {
      limit?: number;
      offset?: number;
      from?: string;
      to?: string;
      type?: MessageType;
      status?: MessageStatus;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<MessageInfo[]> {
    try {
      let query = this.db.collection('messages')
        .where('sessionId', '==', sessionId)
        .where('platform', '==', 'whatsapp')
        .orderBy('timestamp', 'desc');

      // Apply filters
      if (options.from) {
        query = query.where('from', '==', options.from);
      }

      if (options.to) {
        query = query.where('to', '==', options.to);
      }

      if (options.type) {
        query = query.where('type', '==', options.type);
      }

      if (options.status) {
        query = query.where('status', '==', options.status);
      }

      if (options.startDate) {
        query = query.where('timestamp', '>=', options.startDate);
      }

      if (options.endDate) {
        query = query.where('timestamp', '<=', options.endDate);
      }

      // Apply pagination
      if (options.offset) {
        query = query.offset(options.offset);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      } else {
        query = query.limit(50); // Default limit
      }

      const snapshot = await query.get();

      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as MessageInfo);

    } catch (error) {
      this.logger.error('Failed to get messages', {
        sessionId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  public async getMessage(messageId: string): Promise<MessageInfo | null> {
    try {
      // Try cache first
      const cached = await this.cache.getJSON<MessageInfo>(`message:${messageId}`);
      if (cached) {
        return cached;
      }

      // Get from database
      const query = this.db.collection('messages')
        .where('id', '==', messageId)
        .limit(1);

      const snapshot = await query.get();

      if (snapshot.empty) {
        return null;
      }

      const messageData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MessageInfo;

      // Cache the result
      await this.cache.setJSON(`message:${messageId}`, messageData, 1800); // 30 minutes

      return messageData;

    } catch (error) {
      this.logger.error('Failed to get message', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  public async updateMessageStatus(messageId: string, status: MessageStatus): Promise<boolean> {
    try {
      const query = this.db.collection('messages')
        .where('id', '==', messageId);

      const snapshot = await query.get();

      if (snapshot.empty) {
        return false;
      }

      const doc = snapshot.docs[0];
      await doc.ref.update({
        status,
        updatedAt: new Date(),
      });

      // Update cache
      const messageData = await this.getMessage(messageId);
      if (messageData) {
        messageData.status = status;
        messageData.updatedAt = new Date();
        await this.cache.setJSON(`message:${messageId}`, messageData, 1800);
      }

      this.logger.info('Message status updated', {
        messageId,
        status,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to update message status', {
        messageId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  public async deleteMessage(messageId: string): Promise<boolean> {
    try {
      const query = this.db.collection('messages')
        .where('id', '==', messageId);

      const snapshot = await query.get();

      if (snapshot.empty) {
        return false;
      }

      const doc = snapshot.docs[0];
      await doc.ref.delete();

      // Remove from cache
      await this.cache.del(`message:${messageId}`);

      this.logger.info('Message deleted', {
        messageId,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to delete message', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  public async getMessageStats(sessionId: string): Promise<{
    total: number;
    sent: number;
    received: number;
    failed: number;
    byType: Record<MessageType, number>;
    byStatus: Record<MessageStatus, number>;
  }> {
    try {
      const snapshot = await this.db.collection('messages')
        .where('sessionId', '==', sessionId)
        .where('platform', '==', 'whatsapp')
        .get();

      const stats = {
        total: 0,
        sent: 0,
        received: 0,
        failed: 0,
        byType: {} as Record<MessageType, number>,
        byStatus: {} as Record<MessageStatus, number>,
      };

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        stats.total++;

        // Count by direction
        if (data.from === 'me') {
          stats.sent++;
        } else {
          stats.received++;
        }

        // Count by status
        if (data.status === 'failed') {
          stats.failed++;
        }

        // Count by type
        const type = data.type as MessageType;
        stats.byType[type] = (stats.byType[type] || 0) + 1;

        // Count by status
        const status = data.status as MessageStatus;
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      });

      return stats;

    } catch (error) {
      this.logger.error('Failed to get message stats', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        total: 0,
        sent: 0,
        received: 0,
        failed: 0,
        byType: {} as Record<MessageType, number>,
        byStatus: {} as Record<MessageStatus, number>,
      };
    }
  }

  private async saveMessage(messageData: MessageInfo): Promise<void> {
    try {
      await this.db.collection('messages').add(messageData);

      // Cache the message
      await this.cache.setJSON(`message:${messageData.id}`, messageData, 1800);

    } catch (error) {
      this.logger.error('Failed to save message', {
        messageId: messageData.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  public async cleanupOldMessages(retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const snapshot = await this.db.collection('messages')
        .where('platform', '==', 'whatsapp')
        .where('timestamp', '<', cutoffDate)
        .get();

      let deletedCount = 0;
      const batch = this.db.batch();

      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        deletedCount++;

        // Remove from cache
        await this.cache.del(`message:${doc.id}`);
      }

      if (deletedCount > 0) {
        await batch.commit();
      }

      this.logger.info('Old messages cleaned up', {
        deletedCount,
        retentionDays,
      });

      return deletedCount;

    } catch (error) {
      this.logger.error('Failed to cleanup old messages', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }
} 