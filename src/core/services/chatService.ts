import {
  Chat,
  Message,
  ChatWithMessages,
  ChatListItem,
  SendMessageRequest,
  SendMessageResponse,
  GetMessagesRequest,
  GetMessagesResponse,
  GetChatsRequest,
  GetChatsResponse,
  UpdateContactNameRequest,
  ChatActivationRequest,
  ChatDeactivationRequest,
  BulkChatOperation,
  BulkChatOperationResult,
  ChatFilters,
  ChatSortOptions,
  MessageFilters,
  MessageSortOptions,
  ChatStatistics,
  MessageStatistics,
  ChatActivity,
  ConversationContext,
  TokenTracking,
  ChatPresence,
  ChatCleanupConfig,
  ChatCleanupResult,
  ChatExport,
  ChatImport,
  ChatHealthCheck,
  ChatBackup,
  MessageOrigin,
  MessageType,
  ChatType
} from '../../shared/types/chat';
import { DatabaseService } from './database';
import { CacheService } from './cache';
import { QueueService } from './queue';
import { LoggerService } from './logger';

export class ChatService {
  private static instance: ChatService;
  private db: SupabaseService;
  private cache: CacheService;
  private queue: QueueService;
  private logger: LoggerService;
  
  // Token tracking for conversations
  private conversationTokenMap: Map<string, ConversationContext> = new Map();
  
  // Constants
  private readonly MAX_CONVERSATION_TOKENS = 15000;
  private readonly MAX_HISTORY_TOKENS_FOR_PROMPT = 2000;
  private readonly TOKEN_ESTIMATE_RATIO = 4;
  private readonly INACTIVITY_TIMEOUT_MS = 36 * 60 * 60 * 1000; // 36 hours

  private constructor() {
    this.db = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.queue = QueueService.getInstance();
    this.logger = LoggerService.getInstance();
  }

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  // Chat CRUD operations
  async createChat(userId: string, chatId: string, contactName: string, type: ChatType = 'individual'): Promise<Chat> {
    try {
      const now = new Date();
      const chat: Chat = {
        id: chatId,
        userId,
        chatId,
        type,
        contactName,
        isActivated: false,
        userIsActive: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      // Create chat document
      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      await chatDocRef.set({
        ...chat,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Initialize message collections
      await this.ensureChatCollections(userId, chatId);

      // Cache chat data
      await this.cache.set(`chat:${userId}:${chatId}`, chat, 3600);

      // Log activity
      await this.logChatActivity(userId, chatId, 'created', 'Chat created');

      this.logger.info(`Chat created: ${chatId} for user ${userId}`, { userId, chatId, contactName });
      return chat;
    } catch (error) {
      this.logger.error(`Error creating chat ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  async getChat(userId: string, chatId: string): Promise<Chat | null> {
    try {
      // Try cache first
      const cacheKey = `chat:${userId}:${chatId}`;
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached as Chat;
      }

      // Get from database
      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      const doc = await chatDocRef.get();
      
      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as Chat;
      const chat: Chat = {
        ...data,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };

      // Cache result
      await this.cache.set(cacheKey, chat, 3600);
      return chat;
    } catch (error) {
      this.logger.error(`Error getting chat ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  async getChats(request: GetChatsRequest): Promise<GetChatsResponse> {
    try {
      const { userId, limit = 50, offset = 0, search, isActivated, hasKanbanBoard, sortBy = 'lastMessage', sortOrder = 'desc' } = request;
      
      let query = this.db.collection('users').doc(userId).collection('chats');

      // Apply filters
      if (isActivated !== undefined) {
        query = query.where('isActivated', '==', isActivated);
      }
      if (hasKanbanBoard !== undefined) {
        if (hasKanbanBoard) {
          query = query.where('kanbanBoardId', '!=', null);
        } else {
          query = query.where('kanbanBoardId', '==', null);
        }
      }

      // Apply sorting
      const sortField = sortBy === 'lastMessage' ? 'lastMessageTimestamp' : 
                       sortBy === 'contactName' ? 'contactName' : 'createdAt';
      query = query.orderBy(sortField, sortOrder);

      // Apply pagination
      query = query.limit(limit).offset(offset);

      const snapshot = await query.get();
      const chats: ChatListItem[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data() as Chat;
        
        // Apply search filter if provided
        if (search && !data.contactName.toLowerCase().includes(search.toLowerCase()) &&
            !data.contactDisplayName?.toLowerCase().includes(search.toLowerCase())) {
          continue;
        }

        // Get unread count (this would need to be implemented based on your read tracking)
        const unreadCount = await this.getUnreadMessageCount(userId, data.chatId);

        chats.push({
          chatId: data.chatId,
          contactName: data.contactName,
          contactDisplayName: data.contactDisplayName,
          lastMessageContent: data.lastMessageContent || '',
          lastMessageTimestamp: data.lastMessageTimestamp?.toString() || '',
          lastMessageType: data.lastMessageType || 'text',
          lastMessageOrigin: data.lastMessageOrigin || 'contact',
          isActivated: data.isActivated,
          userIsActive: data.userIsActive,
          unreadCount,
          kanbanBoardId: data.kanbanBoardId,
          kanbanColumnId: data.kanbanColumnId
        });
      }

      // Get total count
      const totalQuery = this.db.collection('users').doc(userId).collection('chats');
      const totalSnapshot = await totalQuery.get();
      const total = totalSnapshot.size;

      return {
        success: true,
        data: chats,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total
        }
      };
    } catch (error) {
      this.logger.error(`Error getting chats for user ${request.userId}:`, error);
      throw error;
    }
  }

  async updateChat(userId: string, chatId: string, updates: Partial<Chat>): Promise<Chat | null> {
    try {
      const chat = await this.getChat(userId, chatId);
      if (!chat) {
        return null;
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      await chatDocRef.update(updatedData);

      // Clear cache
      await this.cache.delete(`chat:${userId}:${chatId}`);

      // Get updated chat
      const updatedChat = await this.getChat(userId, chatId);
      
      this.logger.info(`Chat updated: ${chatId} for user ${userId}`, { userId, chatId, updates });
      return updatedChat;
    } catch (error) {
      this.logger.error(`Error updating chat ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  async deleteChat(userId: string, chatId: string): Promise<boolean> {
    try {
      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      
      // Delete all message collections
      const messageCollections = ['messages_all', 'messages_human', 'messages_bot', 'messages_contact'];
      
      for (const collection of messageCollections) {
        await this.deleteCollection(chatDocRef.collection(collection));
      }

      // Delete chat document
      await chatDocRef.delete();

      // Clear cache
      await this.cache.delete(`chat:${userId}:${chatId}`);

      // Log activity
      await this.logChatActivity(userId, chatId, 'deleted', 'Chat deleted');

      this.logger.info(`Chat deleted: ${chatId} for user ${userId}`, { userId, chatId });
      return true;
    } catch (error) {
      this.logger.error(`Error deleting chat ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  // Message operations
  async sendMessage(userId: string, request: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      const { chatId, message, origin = 'human', type = 'text', metadata } = request;

      // Ensure chat exists
      let chat = await this.getChat(userId, chatId);
      if (!chat) {
        // Create chat if it doesn't exist
        const contactName = chatId.includes('@') ? chatId.split('@')[0] : chatId;
        chat = await this.createChat(userId, chatId, contactName);
      }

      // Create message
      const messageData: Omit<Message, 'id'> = {
        chatId,
        from: origin === 'human' ? `me (${userId})` : `bot (${userId})`,
        to: chatId,
        body: message,
        timestamp: new Date().toISOString(),
        type,
        origin,
        status: 'pending',
        fromMe: origin === 'human' || origin === 'bot',
        isAutoReply: origin === 'bot',
        hasMedia: false,
        hasReacted: false,
        hasSticker: false,
        isEphemeral: false,
        isForwarded: false,
        isGif: false,
        isStarred: false,
        isStatus: false,
        mentionedIds: [],
        vCards: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save message to appropriate collections
      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      const messageRef = await chatDocRef.collection('messages_all').add({
        ...messageData,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Save to origin-specific collection
      const originCollection = origin === 'human' ? 'messages_human' : 
                              origin === 'bot' ? 'messages_bot' : 'messages_contact';
      await chatDocRef.collection(originCollection).add({
        ...messageData,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update chat metadata
      await this.updateChatMetadata(userId, chatId, {
        lastMessageContent: message,
        lastMessageTimestamp: new Date().toISOString(),
        lastMessageType: type,
        lastMessageOrigin: origin,
        userIsActive: origin === 'human',
        lastActivityTimestamp: new Date().toISOString()
      });

      // Track tokens for conversation
      if (origin === 'human' || origin === 'bot') {
        this.trackMessageTokens(chatId, origin === 'human' ? 'user' : 'assistant', message);
      }

      // Log activity
      await this.logChatActivity(userId, chatId, 'message_sent', `Message sent: ${message.substring(0, 50)}...`);

      this.logger.info(`Message sent: ${chatId} for user ${userId}`, { userId, chatId, origin, messageLength: message.length });

      return {
        success: true,
        message: 'Message sent successfully',
        data: {
          messageId: messageRef.id,
          chatId,
          content: message,
          timestamp: new Date().toISOString(),
          origin
        }
      };
    } catch (error) {
      this.logger.error(`Error sending message to chat ${request.chatId} for user ${userId}:`, error);
      return {
        success: false,
        message: 'Internal error sending message'
      };
    }
  }

  async getMessages(userId: string, request: GetMessagesRequest): Promise<GetMessagesResponse> {
    try {
      const { chatId, limit = 50, offset = 0, before, after, origin, type } = request;

      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      let query = chatDocRef.collection('messages_all').orderBy('timestamp', 'asc');

      // Apply filters
      if (before) {
        const beforeTimestamp = new Date(before);
        query = query.where('timestamp', '<', beforeTimestamp);
      }
      if (after) {
        const afterTimestamp = new Date(after);
        query = query.where('timestamp', '>', afterTimestamp);
      }
      if (origin) {
        query = query.where('origin', '==', origin);
      }
      if (type) {
        query = query.where('type', '==', type);
      }

      // Apply pagination
      query = query.limit(limit).offset(offset);

      const snapshot = await query.get();
      const messages: Message[] = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp?.toDate?.() ? data.timestamp.toDate().toISOString() : data.timestamp,
          createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : data.updatedAt
        } as Message);
      });

      // Get total count
      const totalQuery = chatDocRef.collection('messages_all');
      const totalSnapshot = await totalQuery.get();
      const total = totalSnapshot.size;

      return {
        success: true,
        data: messages,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total
        }
      };
    } catch (error) {
      this.logger.error(`Error getting messages for chat ${request.chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  async updateContactName(userId: string, request: UpdateContactNameRequest): Promise<boolean> {
    try {
      const { chatId, name } = request;

      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      await chatDocRef.update({
        contactDisplayName: name.trim(),
        updatedAt: new Date().toISOString()
      });

      // Clear cache
      await this.cache.delete(`chat:${userId}:${chatId}`);

      // Log activity
      await this.logChatActivity(userId, chatId, 'contact_updated', `Contact name updated to: ${name}`);

      this.logger.info(`Contact name updated: ${chatId} for user ${userId}`, { userId, chatId, name });
      return true;
    } catch (error) {
      this.logger.error(`Error updating contact name for chat ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  // Chat activation/deactivation
  async activateChat(userId: string, request: ChatActivationRequest): Promise<boolean> {
    try {
      const { chatId, method = 'manual', metadata } = request;

      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      const serverTimestamp = new Date().toISOString();

      await chatDocRef.set({
        isActivated: true,
        activatedAt: serverTimestamp,
        activationMethod: method,
        lastActivityTimestamp: serverTimestamp,
        updatedAt: serverTimestamp,
        ...(metadata && { metadata })
      }, { merge: true });

      // Clear cache
      await this.cache.delete(`chat:${userId}:${chatId}`);

      // Log activity
      await this.logChatActivity(userId, chatId, 'activated', `Chat activated via ${method}`);

      this.logger.info(`Chat activated: ${chatId} for user ${userId}`, { userId, chatId, method });
      return true;
    } catch (error) {
      this.logger.error(`Error activating chat ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  async deactivateChat(userId: string, request: ChatDeactivationRequest): Promise<boolean> {
    try {
      const { chatId, reason, sendFarewellMessage = false } = request;

      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      const serverTimestamp = new Date().toISOString();

      await chatDocRef.update({
        isActivated: false,
        deactivatedAt: serverTimestamp,
        deactivationReason: reason,
        updatedAt: serverTimestamp
      });

      // Send farewell message if requested
      if (sendFarewellMessage) {
        await this.sendMessage(userId, {
          chatId,
          message: 'Thank you for chatting with us. This conversation has been deactivated.',
          origin: 'bot'
        });
      }

      // Clear cache
      await this.cache.delete(`chat:${userId}:${chatId}`);

      // Log activity
      await this.logChatActivity(userId, chatId, 'deactivated', `Chat deactivated: ${reason || 'No reason provided'}`);

      this.logger.info(`Chat deactivated: ${chatId} for user ${userId}`, { userId, chatId, reason });
      return true;
    } catch (error) {
      this.logger.error(`Error deactivating chat ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  async isChatActivated(userId: string, chatId: string): Promise<boolean> {
    try {
      const chat = await this.getChat(userId, chatId);
      if (!chat || !chat.isActivated) {
        return false;
      }

      // Check if chat has been inactive for too long
      const lastActivity = chat.lastActivityTimestamp ? new Date(chat.lastActivityTimestamp) : new Date(chat.activatedAt || 0);
      const now = new Date();
      const inactiveTime = now.getTime() - lastActivity.getTime();

      if (inactiveTime > this.INACTIVITY_TIMEOUT_MS) {
        // Auto-deactivate inactive chat
        await this.deactivateChat(userId, {
          chatId,
          reason: 'Automatic deactivation due to inactivity'
        });
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error checking chat activation for ${chatId} for user ${userId}:`, error);
      return false;
    }
  }

  // Bulk operations
  async bulkChatOperation(userId: string, operation: BulkChatOperation): Promise<BulkChatOperationResult> {
    try {
      const { operation: op, chatIds, parameters } = operation;
      const results = [];
      const summary = {
        total: chatIds.length,
        successful: 0,
        failed: 0
      };

      for (const chatId of chatIds) {
        try {
          let result = false;
          
          switch (op) {
            case 'activate':
              result = await this.activateChat(userId, { chatId, method: 'manual' });
              break;
            case 'deactivate':
              result = await this.deactivateChat(userId, { chatId, reason: parameters?.reason });
              break;
            case 'delete':
              result = await this.deleteChat(userId, chatId);
              break;
            case 'move_to_kanban':
              if (parameters?.kanbanBoardId && parameters?.kanbanColumnId) {
                result = await this.updateChat(userId, chatId, {
                  kanbanBoardId: parameters.kanbanBoardId,
                  kanbanColumnId: parameters.kanbanColumnId
                });
              }
              break;
            case 'clear_history':
              result = await this.clearChatHistory(userId, chatId);
              break;
          }

          results.push({
            chatId,
            success: !!result
          });
          summary.successful++;
        } catch (error) {
          results.push({
            chatId,
            success: false,
            error: error.message
          });
          summary.failed++;
        }
      }

      return {
        success: summary.failed === 0,
        results,
        summary
      };
    } catch (error) {
      this.logger.error(`Error in bulk chat operation for user ${userId}:`, error);
      throw error;
    }
  }

  // Chat presence and activity
  async isUserActiveInChat(userId: string, chatId: string): Promise<boolean> {
    try {
      const chat = await this.getChat(userId, chatId);
      if (!chat) {
        return false;
      }

      // Check explicit activity flag
      if (chat.userIsActive) {
        return true;
      }

      // Check recent human message activity
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const lastHumanActivity = chat.lastHumanMessageTimestamp ? new Date(chat.lastHumanMessageTimestamp) : null;
      
      if (lastHumanActivity && lastHumanActivity > tenMinutesAgo) {
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error checking user activity for chat ${chatId} for user ${userId}:`, error);
      return false;
    }
  }

  async getChatPresence(userId: string, chatId: string): Promise<ChatPresence> {
    try {
      const chat = await this.getChat(userId, chatId);
      const lastActivity = chat?.lastActivityTimestamp ? new Date(chat.lastActivityTimestamp) : new Date(0);
      const now = new Date();
      const inactivityDuration = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60)); // in minutes

      return {
        chatId,
        userId,
        isUserActive: chat?.userIsActive || false,
        lastActivity: lastActivity.toISOString(),
        activitySource: 'message', // This could be enhanced based on actual activity tracking
        inactivityDuration
      };
    } catch (error) {
      this.logger.error(`Error getting chat presence for ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  // Conversation context and token tracking
  async getConversationContext(userId: string, chatId: string, maxMessages = 6): Promise<ConversationContext> {
    try {
      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      const messagesSnapshot = await chatDocRef.collection('messages_all')
        .orderBy('timestamp', 'desc')
        .limit(maxMessages * 2)
        .get();

      const messages = [];
      let totalTokens = 0;

      messagesSnapshot.forEach(doc => {
        const msgData = doc.data();
        if (msgData.body) {
          const estimatedTokens = Math.ceil((msgData.body.length || 0) / this.TOKEN_ESTIMATE_RATIO);
          const role = (msgData.origin === 'bot' || (msgData.isFromMe && msgData.isAutoReply)) ? 'assistant' : 'user';
          
          messages.push({
            role,
            content: msgData.body,
            timestamp: msgData.timestamp?.toDate?.() ? msgData.timestamp.toDate().toISOString() : msgData.timestamp,
            estimatedTokens
          });
          totalTokens += estimatedTokens;
        }
      });

      // Sort chronologically (oldest first)
      messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Limit tokens for prompt
      const limitedMessages = [];
      let promptTokens = 0;
      
      for (let i = messages.length - 1; i >= 0; i--) {
        if (promptTokens + messages[i].estimatedTokens <= this.MAX_HISTORY_TOKENS_FOR_PROMPT) {
          limitedMessages.unshift(messages[i]);
          promptTokens += messages[i].estimatedTokens;
        } else {
          break;
        }
      }

      return {
        chatId,
        messages: limitedMessages,
        totalTokens: promptTokens,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Error getting conversation context for chat ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  private trackMessageTokens(chatId: string, role: 'user' | 'assistant', content: string): void {
    const estimatedTokens = Math.ceil((content?.length || 0) / this.TOKEN_ESTIMATE_RATIO);
    
    if (!this.conversationTokenMap.has(chatId)) {
      this.conversationTokenMap.set(chatId, {
        chatId,
        messages: [],
        totalTokens: 0,
        lastUpdated: new Date().toISOString()
      });
    }

    const conversation = this.conversationTokenMap.get(chatId)!;
    
    conversation.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      estimatedTokens
    });
    
    conversation.totalTokens += estimatedTokens;
    conversation.lastUpdated = new Date().toISOString();

    // Remove old messages if exceeding token limit
    while (conversation.totalTokens > this.MAX_CONVERSATION_TOKENS && conversation.messages.length > 1) {
      const oldestMessage = conversation.messages.shift();
      if (oldestMessage) {
        conversation.totalTokens -= oldestMessage.estimatedTokens;
      }
    }

    this.logger.debug(`Token tracking for chat ${chatId}: ${conversation.messages.length} messages, ~${conversation.totalTokens} tokens`);
  }

  // Statistics and analytics
  async getChatStatistics(userId: string): Promise<ChatStatistics> {
    try {
      const chatsSnapshot = await this.db.collection('users').doc(userId).collection('chats').get();
      const chats = chatsSnapshot.docs.map(doc => doc.data() as Chat);

      const stats: ChatStatistics = {
        totalChats: chats.length,
        activatedChats: chats.filter(c => c.isActivated).length,
        activeUsers: chats.filter(c => c.userIsActive).length,
        totalMessages: 0,
        humanMessages: 0,
        botMessages: 0,
        contactMessages: 0,
        chatsWithKanban: chats.filter(c => c.kanbanBoardId).length,
        averageMessagesPerChat: 0,
        averageResponseTime: 0,
        topContacts: []
      };

      // Calculate message counts (this would need to be optimized for large datasets)
      for (const chat of chats) {
        const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chat.chatId);
        
        const [allMessages, humanMessages, botMessages, contactMessages] = await Promise.all([
          chatDocRef.collection('messages_all').get(),
          chatDocRef.collection('messages_human').get(),
          chatDocRef.collection('messages_bot').get(),
          chatDocRef.collection('messages_contact').get()
        ]);

        stats.totalMessages += allMessages.size;
        stats.humanMessages += humanMessages.size;
        stats.botMessages += botMessages.size;
        stats.contactMessages += contactMessages.size;
      }

      stats.averageMessagesPerChat = stats.totalChats > 0 ? stats.totalMessages / stats.totalChats : 0;

      return stats;
    } catch (error) {
      this.logger.error(`Error getting chat statistics for user ${userId}:`, error);
      throw error;
    }
  }

  // Chat cleanup
  async clearChatHistory(userId: string, chatId: string): Promise<boolean> {
    try {
      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      const messageCollections = ['messages_all', 'messages_human', 'messages_bot', 'messages_contact'];

      // Delete all message collections
      for (const collection of messageCollections) {
        await this.deleteCollection(chatDocRef.collection(collection));
      }

      // Update chat metadata
      await chatDocRef.update({
        lastMessageTimestamp: null,
        lastMessageContent: null,
        lastHumanMessageTimestamp: null,
        lastBotMessageTimestamp: null,
        lastContactMessageTimestamp: null,
        userIsActive: false,
        historyClearedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Clear cache
      await this.cache.delete(`chat:${userId}:${chatId}`);

      // Clear conversation tokens
      this.conversationTokenMap.delete(chatId);

      // Log activity
      await this.logChatActivity(userId, chatId, 'history_cleared', 'Chat history cleared');

      this.logger.info(`Chat history cleared: ${chatId} for user ${userId}`, { userId, chatId });
      return true;
    } catch (error) {
      this.logger.error(`Error clearing chat history for ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  async resetChatActivations(userId: string): Promise<{ success: boolean; count: number }> {
    try {
      const chatsSnapshot = await this.db.collection('users').doc(userId).collection('chats').get();
      
      if (chatsSnapshot.empty) {
        return { success: true, count: 0 };
      }

      // Process in batches
      const batches = [];
      let currentBatch = this.db.batch();
      let operationCount = 0;

      chatsSnapshot.forEach(doc => {
        const chatRef = this.db.collection('users').doc(userId).collection('chats').doc(doc.id);
        currentBatch.update(chatRef, { 
          isActivated: false,
          updatedAt: new Date().toISOString()
        });
        operationCount++;

        if (operationCount >= 499) {
          batches.push(currentBatch);
          currentBatch = this.db.batch();
          operationCount = 0;
        }
      });

      if (operationCount > 0) {
        batches.push(currentBatch);
      }

      // Execute all batches
      await Promise.all(batches.map(batch => batch.commit()));

      this.logger.info(`Reset chat activations for user ${userId}`, { userId, count: chatsSnapshot.size });
      return { success: true, count: chatsSnapshot.size };
    } catch (error) {
      this.logger.error(`Error resetting chat activations for user ${userId}:`, error);
      throw error;
    }
  }

  // Health check
  async getChatHealth(userId: string, chatId: string): Promise<ChatHealthCheck> {
    try {
      const chat = await this.getChat(userId, chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      const [allMessages, humanMessages, botMessages, contactMessages] = await Promise.all([
        chatDocRef.collection('messages_all').get(),
        chatDocRef.collection('messages_human').get(),
        chatDocRef.collection('messages_bot').get(),
        chatDocRef.collection('messages_contact').get()
      ]);

      const checks = {
        hasMessages: allMessages.size > 0,
        hasRecentActivity: chat.lastActivityTimestamp ? 
          new Date().getTime() - new Date(chat.lastActivityTimestamp).getTime() < 24 * 60 * 60 * 1000 : false,
        contactInfoComplete: !!(chat.contactName && chat.contactName.trim()),
        kanbanIntegration: !!(chat.kanbanBoardId && chat.kanbanColumnId),
        messageCollectionsSync: allMessages.size === (humanMessages.size + botMessages.size + contactMessages.size)
      };

      const issues = [];
      if (!checks.hasMessages) issues.push('No messages found');
      if (!checks.hasRecentActivity) issues.push('No recent activity');
      if (!checks.contactInfoComplete) issues.push('Incomplete contact information');
      if (!checks.messageCollectionsSync) issues.push('Message collections out of sync');

      const score = Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100;

      return {
        chatId,
        userId,
        healthy: issues.length === 0,
        issues,
        checks,
        lastCheck: new Date().toISOString(),
        score: Math.round(score)
      };
    } catch (error) {
      this.logger.error(`Error getting chat health for ${chatId} for user ${userId}:`, error);
      throw error;
    }
  }

  // Helper methods
  private async ensureChatCollections(userId: string, chatId: string): Promise<void> {
    try {
      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      const collections = ['messages_all', 'messages_human', 'messages_bot', 'messages_contact'];

      for (const collection of collections) {
        // Create a dummy document to ensure collection exists, then delete it
        const dummyRef = chatDocRef.collection(collection).doc('dummy');
        await dummyRef.set({ dummy: true });
        await dummyRef.delete();
      }
    } catch (error) {
      this.logger.error(`Error ensuring chat collections for ${chatId} for user ${userId}:`, error);
    }
  }

  private async updateChatMetadata(userId: string, chatId: string, updates: any): Promise<void> {
    try {
      const chatDocRef = this.db.collection('users').doc(userId).collection('chats').doc(chatId);
      await chatDocRef.update({
        ...updates,
        updatedAt: new Date().toISOString()
      });

      // Clear cache
      await this.cache.delete(`chat:${userId}:${chatId}`);
    } catch (error) {
      this.logger.error(`Error updating chat metadata for ${chatId} for user ${userId}:`, error);
    }
  }

  private async deleteCollection(collectionRef: any): Promise<void> {
    const batchSize = 100;
    let query = collectionRef.limit(batchSize);
    
    return new Promise((resolve, reject) => {
      this.deleteQueryBatch(query, resolve, reject);
    });
  }

  private async deleteQueryBatch(query: any, resolve: Function, reject: Function): Promise<void> {
    try {
      const snapshot = await query.get();
      
      if (snapshot.size === 0) {
        resolve();
        return;
      }

      const batch = this.db.batch();
      snapshot.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      // Recurse on the next process tick
      process.nextTick(() => {
        this.deleteQueryBatch(query, resolve, reject);
      });
    } catch (error) {
      reject(error);
    }
  }

  private async getUnreadMessageCount(userId: string, chatId: string): Promise<number> {
    // This would need to be implemented based on your read tracking system
    // For now, return 0 as a placeholder
    return 0;
  }

  private async logChatActivity(userId: string, chatId: string, action: string, details: string, metadata?: any): Promise<void> {
    try {
      const activity: Omit<ChatActivity, 'id'> = {
        chatId,
        userId,
        action: action as any,
        details,
        metadata,
        timestamp: new Date().toISOString()
      };

      await this.db.collection('chat_activities').add(activity);
    } catch (error) {
      this.logger.error(`Error logging chat activity:`, error);
    }
  }
}

export const chatService = ChatService.getInstance(); 