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
import { SupabaseService } from './SupabaseService';
import { CacheService } from './CacheService';
import { QueueService } from './QueueService';
import { LoggerService } from './LoggerService';

export class ChatServiceSQL {
  private static instance: ChatServiceSQL;
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

  static getInstance(): ChatServiceSQL {
    if (!ChatServiceSQL.instance) {
      ChatServiceSQL.instance = new ChatServiceSQL();
    }
    return ChatServiceSQL.instance;
  }

  // ========== REFACTORED METHODS USING SQL RELATIONS ==========

  /**
   * Create a new chat using SQL relations
   */
  async createChat(userId: string, chatId: string, contactName: string, type: ChatType = 'individual'): Promise<Chat> {
    try {
      const now = new Date().toISOString();
      const chat: Chat = {
        id: chatId,
        userId,
        chatId,
        type,
        contactName,
        isActivated: false,
        userIsActive: false,
        createdAt: now,
        updatedAt: now
      };

      // Insert into chats table with user_id foreign key
      const { data, error } = await this.db
        .from('chats')
        .insert({
          id: chatId,
          user_id: userId,
          chat_id: chatId,
          type,
          contact_name: contactName,
          is_activated: false,
          user_is_active: false,
          created_at: now,
          updated_at: now
        })
        .select()
        .single();

      if (error) {
        this.logger.error('Error creating chat', { userId, chatId, error });
        throw error;
      }

      // Cache chat data
      await this.cache.set(`chat:${userId}:${chatId}`, JSON.stringify(chat), 3600);

      this.logger.info('Chat created successfully', { userId, chatId });
      return this.mapDbChatToChat(data);
    } catch (error) {
      this.logger.error('Failed to create chat', { userId, chatId, error });
      throw error;
    }
  }

  /**
   * Get a specific chat by ID
   */
  async getChat(userId: string, chatId: string): Promise<Chat | null> {
    try {
      // Check cache first
      const cached = await this.cache.get(`chat:${userId}:${chatId}`);
      if (cached) {
        return JSON.parse(cached) as Chat;
      }

      // Get from database using SQL query
      const { data, error } = await this.db
        .from('chats')
        .select('*')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Not found
          return null;
        }
        throw error;
      }

      const chat = this.mapDbChatToChat(data);
      
      // Cache for future use
      await this.cache.set(`chat:${userId}:${chatId}`, JSON.stringify(chat), 3600);

      return chat;
    } catch (error) {
      this.logger.error('Error getting chat', { userId, chatId, error });
      throw error;
    }
  }

  /**
   * Get all chats for a user with filtering and pagination
   */
  async getChats(request: GetChatsRequest): Promise<GetChatsResponse> {
    try {
      const { 
        userId, 
        limit = 50, 
        offset = 0, 
        search, 
        isActivated, 
        hasKanbanBoard, 
        sortBy = 'lastMessage', 
        sortOrder = 'desc' 
      } = request;
      
      // Build query
      let query = this.db
        .from('chats')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      // Apply filters
      if (search) {
        query = query.or(`contact_name.ilike.%${search}%,chat_id.ilike.%${search}%`);
      }
      
      if (isActivated !== undefined) {
        query = query.eq('is_activated', isActivated);
      }
      
      if (hasKanbanBoard !== undefined) {
        query = query.eq('has_kanban_board', hasKanbanBoard);
      }

      // Apply sorting
      const sortColumn = this.mapSortColumn(sortBy);
      query = query.order(sortColumn, { ascending: sortOrder === 'asc' });

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      const chats = data.map(this.mapDbChatToChat);

      return {
        success: true,
        data: chats,
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: (count || 0) > offset + limit
        }
      };
    } catch (error) {
      this.logger.error('Error getting chats', { request, error });
      throw error;
    }
  }

  /**
   * Update a chat
   */
  async updateChat(userId: string, chatId: string, updates: Partial<Chat>): Promise<Chat> {
    try {
      const updatedData = {
        ...this.mapChatToDbChat(updates),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.db
        .from('chats')
        .update(updatedData)
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const chat = this.mapDbChatToChat(data);

      // Invalidate cache
      await this.cache.del(`chat:${userId}:${chatId}`);

      return chat;
    } catch (error) {
      this.logger.error('Error updating chat', { userId, chatId, updates, error });
      throw error;
    }
  }

  /**
   * Delete a chat and all its messages
   */
  async deleteChat(userId: string, chatId: string): Promise<boolean> {
    try {
      // Delete all messages first (cascading delete if FK is set up properly)
      await this.db
        .from('messages')
        .delete()
        .eq('chat_id', chatId);

      // Delete the chat
      const { error } = await this.db
        .from('chats')
        .delete()
        .eq('user_id', userId)
        .eq('chat_id', chatId);

      if (error) {
        throw error;
      }

      // Clear cache
      await this.cache.del(`chat:${userId}:${chatId}`);
      await this.clearMessageCache(userId, chatId);

      this.logger.info('Chat deleted successfully', { userId, chatId });
      return true;
    } catch (error) {
      this.logger.error('Error deleting chat', { userId, chatId, error });
      throw error;
    }
  }

  /**
   * Send a message - refactored to use messages table
   */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      const { userId, chatId, message: content, origin, type = 'text', metadata } = request;

      // Verify chat exists
      const chat = await this.getChat(userId, chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      const messageData = {
        id: this.generateMessageId(),
        chat_id: chatId,
        user_id: userId,
        content,
        origin,
        type,
        metadata,
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      // Insert message into messages table
      const { data, error } = await this.db
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Update chat's last message info
      await this.updateChat(userId, chatId, {
        lastMessageTimestamp: messageData.timestamp,
        lastMessageContent: content,
        lastMessageOrigin: origin
      });

      // Update conversation context
      await this.updateConversationContext(userId, chatId, content, origin);

      // Queue for processing if from contact
      if (origin === 'contact') {
        await this.queue.add('process-message', {
          userId,
          chatId,
          messageId: data.id,
          content,
          metadata
        });
      }

      this.logger.info('Message sent successfully', { userId, chatId, messageId: data.id });

      return {
        success: true,
        message: 'Message sent successfully',
        data: {
          messageId: data.id,
          chatId,
          content,
          timestamp: messageData.timestamp,
          origin: origin || 'human'
        }
      };
    } catch (error) {
      this.logger.error('Error sending message', { request, error });
      throw error;
    }
  }

  /**
   * Get messages for a chat
   */
  async getMessages(userId: string, request: GetMessagesRequest): Promise<GetMessagesResponse> {
    try {
      const { chatId, limit = 50, offset = 0, before, after, origin, type } = request;

      // Build query
      let query = this.db
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .order('timestamp', { ascending: true });

      // Apply filters
      if (before) {
        query = query.lt('timestamp', before);
      }
      
      if (after) {
        query = query.gt('timestamp', after);
      }
      
      if (origin) {
        query = query.eq('origin', origin);
      }
      
      if (type) {
        query = query.eq('type', type);
      }

      // Apply pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      const messages = data.map(this.mapDbMessageToMessage);

      return {
        success: true,
        data: messages,
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: (count || 0) > offset + limit
        }
      };
    } catch (error) {
      this.logger.error('Error getting messages', { userId, request, error });
      throw error;
    }
  }

  /**
   * Activate a chat
   */
  async activateChat(userId: string, request: ChatActivationRequest): Promise<Chat> {
    try {
      const { chatId, method = 'manual', metadata } = request;

      const updates = {
        isActivated: true,
        activatedAt: new Date().toISOString(),
        activationMethod: (method === 'trigger' ? 'initial_trigger' : method) as 'manual' | 'initial_trigger' | 'auto',
        activationMetadata: metadata,
        userIsActive: true
      };

      const chat = await this.updateChat(userId, chatId, updates);

      // Queue activation event
      await this.queue.add('chat-activated', { userId, chatId, method });

      this.logger.info('Chat activated', { userId, chatId, method });
      return chat;
    } catch (error) {
      this.logger.error('Error activating chat', { userId, request, error });
      throw error;
    }
  }

  /**
   * Deactivate a chat
   */
  async deactivateChat(userId: string, request: ChatDeactivationRequest): Promise<Chat> {
    try {
      const { chatId, reason, sendFarewellMessage = false } = request;

      const updates = {
        isActivated: false,
        deactivatedAt: new Date().toISOString(),
        deactivationReason: reason,
        userIsActive: false
      };

      const chat = await this.updateChat(userId, chatId, updates);

      if (sendFarewellMessage) {
        await this.sendMessage({
          userId,
          chatId,
          message: 'Gracias por contactarnos. Esta conversación ha finalizado.',
          origin: 'bot',
          type: 'text'
        });
      }

      // Queue deactivation event
      await this.queue.add('chat-deactivated', { userId, chatId, reason });

      this.logger.info('Chat deactivated', { userId, chatId, reason });
      return chat;
    } catch (error) {
      this.logger.error('Error deactivating chat', { userId, request, error });
      throw error;
    }
  }

  /**
   * Get chat statistics
   */
  async getChatStatistics(userId: string): Promise<ChatStatistics> {
    try {
      // Get all chats for user
      const { data: chats, error } = await this.db
        .from('chats')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      const stats: ChatStatistics = {
        totalChats: chats.length,
        activatedChats: chats.filter(c => c.is_activated).length,
        activeUsers: chats.filter(c => c.user_is_active).length,
        totalMessages: 0,
        humanMessages: 0,
        botMessages: 0,
        contactMessages: 0,
        averageResponseTime: 0,
        topContacts: [],
        chatsWithKanban: chats.filter(c => c.kanban_enabled).length,
        averageMessagesPerChat: 0
      };

      // Get message counts
      const { count: totalMessages } = await this.db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { count: humanMessages } = await this.db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('origin', 'human');

      const { count: botMessages } = await this.db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('origin', 'bot');

      const { count: contactMessages } = await this.db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('origin', 'contact');

      stats.totalMessages = totalMessages || 0;
      stats.humanMessages = humanMessages || 0;
      stats.botMessages = botMessages || 0;
      stats.contactMessages = contactMessages || 0;

      // Calculate average conversation length
      if (stats.totalChats > 0) {
        stats.averageMessagesPerChat = Math.round(stats.totalMessages / stats.totalChats);
      }

      return stats;
    } catch (error) {
      this.logger.error('Error getting chat statistics', { userId, error });
      throw error;
    }
  }

  /**
   * Clear chat history
   */
  async clearChatHistory(userId: string, chatId: string): Promise<boolean> {
    try {
      // Delete all messages for the chat
      const { error } = await this.db
        .from('messages')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      // Update chat to reset message-related fields
      await this.updateChat(userId, chatId, {
        lastMessageTimestamp: null,
        lastMessageContent: null,
        lastMessageOrigin: null
      });

      // Clear cache
      await this.clearMessageCache(userId, chatId);

      this.logger.info('Chat history cleared', { userId, chatId });
      return true;
    } catch (error) {
      this.logger.error('Error clearing chat history', { userId, chatId, error });
      throw error;
    }
  }

  // ========== HELPER METHODS ==========

  /**
   * Map database chat to Chat type
   */
  private mapDbChatToChat(dbChat: any): Chat {
    return {
      id: dbChat.id,
      userId: dbChat.user_id,
      chatId: dbChat.chat_id,
      type: dbChat.type,
      contactName: dbChat.contact_name,
      contactDisplayName: dbChat.contact_display_name,
      isActivated: dbChat.is_activated,
      userIsActive: dbChat.user_is_active,
      activatedAt: dbChat.activated_at,
      activationMethod: dbChat.activation_method,
      lastMessageTimestamp: dbChat.last_message_time || dbChat.last_message_timestamp,
      lastMessageContent: dbChat.last_message_content,
      lastMessageOrigin: dbChat.last_message_origin,
      createdAt: dbChat.created_at,
      updatedAt: dbChat.updated_at,
      // Note: deactivation properties stored in DB but not in Chat interface
    };
  }

  /**
   * Map Chat type to database format
   */
  private mapChatToDbChat(chat: Partial<Chat>): any {
    const dbChat: any = {};
    
    if (chat.id !== undefined) dbChat.id = chat.id;
    if (chat.userId !== undefined) dbChat.user_id = chat.userId;
    if (chat.chatId !== undefined) dbChat.chat_id = chat.chatId;
    if (chat.type !== undefined) dbChat.type = chat.type;
    if (chat.contactName !== undefined) dbChat.contact_name = chat.contactName;
    if (chat.contactDisplayName !== undefined) dbChat.contact_display_name = chat.contactDisplayName;
    if (chat.isActivated !== undefined) dbChat.is_activated = chat.isActivated;
    if (chat.userIsActive !== undefined) dbChat.user_is_active = chat.userIsActive;
    if (chat.activatedAt !== undefined) dbChat.activated_at = chat.activatedAt;
    if (chat.activationMethod !== undefined) dbChat.activation_method = chat.activationMethod;
    if (chat.lastMessageTimestamp !== undefined) dbChat.last_message_timestamp = chat.lastMessageTimestamp;
    if (chat.lastMessageContent !== undefined) dbChat.last_message_content = chat.lastMessageContent;
    if (chat.lastMessageOrigin !== undefined) dbChat.last_message_origin = chat.lastMessageOrigin;
    if (chat.createdAt !== undefined) dbChat.created_at = chat.createdAt;
    if (chat.updatedAt !== undefined) dbChat.updated_at = chat.updatedAt;
    
    return dbChat;
  }

  /**
   * Map database message to Message type
   */
  private mapDbMessageToMessage(dbMessage: any): Message {
    return {
      id: dbMessage.id,
      chatId: dbMessage.chat_id,
      from: dbMessage.from_contact || '',
      to: dbMessage.to_contact || '',
      body: dbMessage.content || '',
      status: (dbMessage.status || 'sent') as 'pending' | 'sent' | 'delivered' | 'read' | 'failed',
      fromMe: dbMessage.origin === 'bot',
      isAutoReply: false,
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
      origin: (dbMessage.origin || 'human') as MessageOrigin,
      type: (dbMessage.message_type || dbMessage.type || 'text') as MessageType,
      timestamp: dbMessage.timestamp || dbMessage.created_at,
      createdAt: dbMessage.created_at,
      updatedAt: dbMessage.updated_at || dbMessage.created_at
    };
  }

  /**
   * Map sort column names
   */
  private mapSortColumn(sortBy: string): string {
    const columnMap: { [key: string]: string } = {
      'lastMessage': 'last_message_time',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
      'contactName': 'contact_name'
    };
    return columnMap[sortBy] || 'updated_at';
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear message cache for a chat
   */
  private async clearMessageCache(userId: string, chatId: string): Promise<void> {
    const pattern = `messages:${userId}:${chatId}:*`;
    // Use keys and del methods since delPattern may not exist\n    try {\n      const keys = await this.cache.keys(pattern);\n      if (keys.length > 0) {\n        await Promise.all(keys.map(key => this.cache.del(key)));\n      }\n    } catch (error) {\n      this.logger.warn('Failed to clear message cache pattern', { pattern, error });\n    }
  }

  /**
   * Update conversation context (for AI processing)
   */
  private async updateConversationContext(userId: string, chatId: string, content: string, origin: MessageOrigin): Promise<void> {
    const key = `${userId}:${chatId}`;
    let context = this.conversationTokenMap.get(key);
    
    if (!context) {
      context = {
        chatId,
        messages: [],
        totalTokens: 0,
        lastUpdated: new Date().toISOString()
      };
    }

    // Estimate tokens (rough approximation)
    const estimatedTokens = Math.ceil(content.length / this.TOKEN_ESTIMATE_RATIO);
    
    context.messages.push({
      role: origin === 'bot' ? 'assistant' : 'user',
      content,
      timestamp: new Date().toISOString(),
      estimatedTokens: estimatedTokens
    });
    
    context.totalTokens += estimatedTokens;
    context.lastUpdated = new Date().toISOString();

    // Trim if exceeding token limit
    while (context.totalTokens > this.MAX_CONVERSATION_TOKENS && context.messages.length > 1) {
      const removed = context.messages.shift();
      if (removed) {
        context.totalTokens -= removed.estimatedTokens || 0;
      }
    }

    this.conversationTokenMap.set(key, context);
  }
}