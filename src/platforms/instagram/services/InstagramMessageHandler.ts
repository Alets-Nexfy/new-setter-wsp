import { Logger } from '../../../core/services/LoggerService';
import { CacheService } from '../../../core/services/CacheService';
import { DatabaseService } from '../../../core/services/DatabaseService';
import { QueueService } from '../../../core/services/QueueService';
import { 
  InstagramMessage, 
  InstagramConversation,
  InstagramApiResponse,
  InstagramSession 
} from '../../../shared/types/instagram';
import { INSTAGRAM_CONSTANTS } from '../../../shared/constants/instagram';

export class InstagramMessageHandler {
  constructor(
    private readonly logger: Logger,
    private readonly cache: CacheService,
    private readonly database: DatabaseService,
    private readonly queue: QueueService
  ) {}

  /**
   * Send a direct message
   */
  async sendMessage(
    sessionId: string,
    recipientUsername: string,
    content: string,
    messageType: 'text' | 'image' | 'video' = 'text',
    mediaUrl?: string
  ): Promise<InstagramApiResponse<InstagramMessage>> {
    try {
      // Validate session
      const session = await this.validateSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Invalid or expired session',
          timestamp: new Date(),
        };
      }

      // Create message object
      const message: InstagramMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        conversationId: `conv_${session.username}_${recipientUsername}`,
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId: session.userId,
        senderUsername: session.username,
        recipientId: `user_${recipientUsername}`,
        recipientUsername,
        content,
        messageType,
        mediaUrl,
        mediaType: messageType === 'text' ? undefined : messageType,
        isRead: false,
        isFromMe: true,
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          hashtags: this.extractHashtags(content),
          mentions: this.extractMentions(content),
        },
      };

      // Add to queue for processing
      await this.queue.add(INSTAGRAM_CONSTANTS.QUEUE_NAMES.INSTAGRAM_MESSAGES, {
        type: INSTAGRAM_CONSTANTS.JOB_TYPES.SEND_MESSAGE,
        data: message,
      });

      // Save to database
      await this.database.collection('instagram_messages').doc(message.id).set(message);

      // Update conversation
      await this.updateConversation(sessionId, recipientUsername, message);

      this.logger.info(`Queued Instagram message to ${recipientUsername}: ${content.substring(0, 50)}...`);

      return {
        success: true,
        data: message,
        message: 'Message queued for sending',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error sending Instagram message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send message',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Send bulk messages
   */
  async sendBulkMessages(
    sessionId: string,
    recipients: string[],
    content: string,
    messageType: 'text' | 'image' | 'video' = 'text',
    mediaUrl?: string,
    delayBetweenMessages: number = 30000
  ): Promise<InstagramApiResponse<{ sent: number; failed: number; messages: InstagramMessage[] }>> {
    try {
      const session = await this.validateSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Invalid or expired session',
          timestamp: new Date(),
        };
      }

      const messages: InstagramMessage[] = [];
      let sent = 0;
      let failed = 0;

      for (const recipient of recipients) {
        try {
          const result = await this.sendMessage(sessionId, recipient, content, messageType, mediaUrl);
          if (result.success && result.data) {
            messages.push(result.data);
            sent++;
          } else {
            failed++;
          }

          // Add delay between messages
          if (delayBetweenMessages > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
          }
        } catch (error) {
          this.logger.error(`Error sending message to ${recipient}:`, error);
          failed++;
        }
      }

      return {
        success: true,
        data: { sent, failed, messages },
        message: `Bulk message completed: ${sent} sent, ${failed} failed`,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error sending bulk messages:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send bulk messages',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get conversation messages
   */
  async getConversationMessages(
    sessionId: string,
    conversationId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<InstagramApiResponse<InstagramMessage[]>> {
    try {
      const session = await this.validateSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Invalid or expired session',
          timestamp: new Date(),
        };
      }

      const snapshot = await this.database
        .collection('instagram_messages')
        .where('sessionId', '==', sessionId)
        .where('conversationId', '==', conversationId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .offset(offset)
        .get();

      const messages = snapshot.docs.map(doc => doc.data() as InstagramMessage);

      return {
        success: true,
        data: messages,
        message: `Retrieved ${messages.length} messages`,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error getting conversation messages:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get messages',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get user conversations
   */
  async getUserConversations(sessionId: string): Promise<InstagramApiResponse<InstagramConversation[]>> {
    try {
      const session = await this.validateSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Invalid or expired session',
          timestamp: new Date(),
        };
      }

      const snapshot = await this.database
        .collection('instagram_conversations')
        .where('sessionId', '==', sessionId)
        .orderBy('lastActivity', 'desc')
        .get();

      const conversations = snapshot.docs.map(doc => doc.data() as InstagramConversation);

      return {
        success: true,
        data: conversations,
        message: `Retrieved ${conversations.length} conversations`,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error getting user conversations:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get conversations',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(messageId: string): Promise<InstagramApiResponse<void>> {
    try {
      const doc = await this.database.collection('instagram_messages').doc(messageId).get();
      if (!doc.exists) {
        return {
          success: false,
          error: 'Message not found',
          timestamp: new Date(),
        };
      }

      await this.database.collection('instagram_messages').doc(messageId).update({
        isRead: true,
        updatedAt: new Date(),
      });

      return {
        success: true,
        message: 'Message marked as read',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error marking message as read:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark message as read',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string): Promise<InstagramApiResponse<void>> {
    try {
      const doc = await this.database.collection('instagram_messages').doc(messageId).get();
      if (!doc.exists) {
        return {
          success: false,
          error: 'Message not found',
          timestamp: new Date(),
        };
      }

      await this.database.collection('instagram_messages').doc(messageId).delete();

      return {
        success: true,
        message: 'Message deleted successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error deleting message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete message',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get message statistics
   */
  async getMessageStats(sessionId: string, period: 'day' | 'week' | 'month' = 'day'): Promise<InstagramApiResponse<{
    total: number;
    sent: number;
    received: number;
    read: number;
    unread: number;
    byType: Record<string, number>;
  }>> {
    try {
      const session = await this.validateSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Invalid or expired session',
          timestamp: new Date(),
        };
      }

      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      const snapshot = await this.database
        .collection('instagram_messages')
        .where('sessionId', '==', sessionId)
        .where('timestamp', '>=', startDate)
        .get();

      const messages = snapshot.docs.map(doc => doc.data() as InstagramMessage);

      const stats = {
        total: messages.length,
        sent: messages.filter(m => m.isFromMe).length,
        received: messages.filter(m => !m.isFromMe).length,
        read: messages.filter(m => m.isRead).length,
        unread: messages.filter(m => !m.isRead).length,
        byType: {} as Record<string, number>,
      };

      // Count by message type
      messages.forEach(message => {
        stats.byType[message.messageType] = (stats.byType[message.messageType] || 0) + 1;
      });

      return {
        success: true,
        data: stats,
        message: `Retrieved message statistics for ${period}`,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Error getting message stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get message statistics',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Update conversation
   */
  private async updateConversation(sessionId: string, recipientUsername: string, lastMessage: InstagramMessage): Promise<void> {
    try {
      const conversationId = `conv_${lastMessage.senderUsername}_${recipientUsername}`;
      
      const conversation: InstagramConversation = {
        id: conversationId,
        sessionId,
        conversationId,
        participants: [
          {
            userId: lastMessage.senderId,
            username: lastMessage.senderUsername,
          },
          {
            userId: lastMessage.recipientId,
            username: lastMessage.recipientUsername,
          },
        ],
        lastMessage,
        unreadCount: 0, // Will be updated when messages are received
        isArchived: false,
        isMuted: false,
        lastActivity: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          isGroupChat: false,
        },
      };

      // Check if conversation exists
      const existingDoc = await this.database.collection('instagram_conversations').doc(conversationId).get();
      
      if (existingDoc.exists) {
        // Update existing conversation
        await this.database.collection('instagram_conversations').doc(conversationId).update({
          lastMessage,
          lastActivity: new Date(),
          updatedAt: new Date(),
        });
      } else {
        // Create new conversation
        await this.database.collection('instagram_conversations').doc(conversationId).set(conversation);
      }
    } catch (error) {
      this.logger.error('Error updating conversation:', error);
    }
  }

  /**
   * Validate session
   */
  private async validateSession(sessionId: string): Promise<InstagramSession | null> {
    try {
      const cachedSession = await this.cache.get(`${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`);
      if (cachedSession) {
        return cachedSession as InstagramSession;
      }

      const doc = await this.database.collection('instagram_sessions').doc(sessionId).get();
      if (doc.exists) {
        const session = doc.data() as InstagramSession;
        
        // Check if session is active and not expired
        if (session.isActive) {
          const cutoffTime = new Date(Date.now() - INSTAGRAM_CONSTANTS.SESSION_TIMEOUT);
          if (session.lastActivity >= cutoffTime) {
            return session;
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Error validating session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Extract hashtags from text
   */
  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#[\w\u0590-\u05ff]+/g;
    return text.match(hashtagRegex) || [];
  }

  /**
   * Extract mentions from text
   */
  private extractMentions(text: string): string[] {
    const mentionRegex = /@[\w.]+/g;
    return text.match(mentionRegex) || [];
  }
} 