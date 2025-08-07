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

  // ========== REFACTORED METHODS USING SQL RELATIONS ==========

  /**
   * Create a new chat using SQL relations
   */
  async createChat(userId: string, chatId: string, contactName: string, type: ChatType = 'individual'): Promise<Chat> {
    try {
      // First, ensure user exists (create if not)
      const userUuid = this.ensureUUID(userId);
      await this.ensureUserExists(userUuid);
      
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

      // Insert into chats table with correct column names
      // Required fields: id, user_id, platform, contact_id, contact_name
      const insertData: any = {
        user_id: userUuid, // Use the UUID we just ensured exists
        platform: 'whatsapp', // Required field
        contact_id: chatId, // Required field (using chatId as contact_id)
        contact_name: contactName || 'Unknown', // Required field
        // Optional fields
        chat_id: chatId, // Store original chatId
        type: type || 'individual',
        is_activated: false,
        user_is_active: false,
        is_active: true,
        is_archived: false,
        human_present: false,
        auto_agent_paused: false,
        created_at: now,
        updated_at: now
      };

      const { data, error } = await this.db
        .from('chats')
        .insert(insertData)
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
        .eq('user_id', this.ensureUUID(userId))
        .eq('chat_id', this.ensureUUID(chatId))
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
  async getChats(userId: string, request: Partial<GetChatsRequest> = {}): Promise<GetChatsResponse> {
    try {
      const { 
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
        .eq('user_id', this.ensureUUID(userId));

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
        .eq('user_id', this.ensureUUID(userId))
        .eq('chat_id', this.ensureUUID(chatId))
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
   * Update contact name for a chat
   */
  async updateContactName(userId: string, chatId: string, name: string): Promise<{ success: boolean; error?: string; chat?: Chat }> {
    try {
      const chat = await this.updateChat(userId, chatId, { contactName: name });
      return { success: true, chat };
    } catch (error) {
      this.logger.error('Error updating contact name', { userId, chatId, name, error });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update contact name' 
      };
    }
  }

  /**
   * Reset all chat activations for a user
   */
  async resetAllChatActivations(userId: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const { data, error } = await this.db
        .from('chats')
        .update({
          is_activated: false,
          user_is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivation_reason: 'bulk_reset'
        })
        .eq('user_id', this.ensureUUID(userId))
        .eq('is_activated', true)
        .select();

      if (error) {
        throw error;
      }

      const count = data ? data.length : 0;
      
      // Clear all chat caches for this user
      const keys = await this.cache.keys(`chat:${userId}:*`);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.cache.del(key)));
      }

      this.logger.info('Reset all chat activations', { userId, count });
      
      return { success: true, count };
    } catch (error) {
      this.logger.error('Error resetting chat activations', { userId, error });
      return {
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : 'Failed to reset chat activations'
      };
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
        .eq('chat_id', this.ensureUUID(chatId));

      // Delete the chat
      const { error } = await this.db
        .from('chats')
        .delete()
        .eq('user_id', this.ensureUUID(userId))
        .eq('chat_id', this.ensureUUID(chatId));

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
      const { chatId, message: content, origin, type = 'text', metadata } = request;
      // Extract userId from chat context or parameter
      const userId = request.userId || '';

      // Verify chat exists
      const chat = await this.getChat(userId, chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      const now = new Date().toISOString();
      const messageData: any = {
        user_id: this.ensureUUID(userId),
        chat_id: this.ensureUUID(chatId),
        platform: 'whatsapp', // Required field
        from_contact: origin === 'contact' ? (chat.contactName || 'unknown') : 'bot', // Required field
        to_contact: origin === 'contact' ? 'bot' : (chat.contactName || 'unknown'), // Required field
        message_type: type || 'text', // Required field
        content,
        status: 'sent' // Required field
      };
      
      // Add optional fields
      if (origin) messageData.origin = origin;
      if (type) messageData.type = type;
      if (metadata) messageData.metadata = metadata;
      messageData.timestamp = now;
      messageData.created_at = now;

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
          chatId: chatId,
          content: content,
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
        .eq('chat_id', this.ensureUUID(chatId))
        .eq('user_id', this.ensureUUID(userId))
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
        .eq('user_id', this.ensureUUID(userId));

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
        chatsWithKanban: chats.filter(c => c.kanban_column_id).length,
        averageMessagesPerChat: 0,
        averageResponseTime: 0,
        topContacts: []
      };

      // Get message counts
      const { count: totalMessages } = await this.db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', this.ensureUUID(userId));

      const { count: humanMessages } = await this.db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', this.ensureUUID(userId))
        .eq('origin', 'human');

      const { count: botMessages } = await this.db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', this.ensureUUID(userId))
        .eq('origin', 'bot');

      const { count: contactMessages } = await this.db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', this.ensureUUID(userId))
        .eq('origin', 'contact');

      stats.totalMessages = totalMessages || 0;
      stats.humanMessages = humanMessages || 0;
      stats.botMessages = botMessages || 0;
      stats.contactMessages = contactMessages || 0;

      // Calculate average messages per chat
      if (stats.totalChats > 0) {
        stats.averageMessagesPerChat = Math.round(stats.totalMessages / stats.totalChats);
      }

      return stats;
    } catch (error) {
      this.logger.error('Error getting chat statistics', { userId, error });
      throw error;
    }
  }

  // Removed duplicate clearChatHistory function - kept the more comprehensive one below

  // ========== HELPER METHODS ==========

  /**
   * Ensure user exists in database (create if not)
   */
  private async ensureUserExists(userUuid: string): Promise<void> {
    try {
      // Check if user exists
      const { data: existingUser, error: checkError } = await this.db
        .from('users')
        .select('id')
        .eq('id', userUuid)
        .single();

      if (!existingUser && checkError?.code === 'PGRST116') {
        // User doesn't exist, create it
        this.logger.info('Creating user record', { userId: userUuid });
        
        const { error: insertError } = await this.db
          .from('users')
          .insert({
            id: userUuid,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          this.logger.error('Error creating user', { userId: userUuid, error: insertError });
          // Don't throw - user might exist due to race condition
        }
      }
    } catch (error) {
      this.logger.warn('Error checking/creating user', { userId: userUuid, error });
      // Don't throw - continue with chat creation attempt
    }
  }

  /**
   * Check if a string is a valid UUID
   */
  private isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Ensure value is a UUID (create deterministic UUID from string if not)
   */
  private ensureUUID(value: string): string {
    if (this.isValidUUID(value)) {
      return value;
    }
    // Create a deterministic UUID from the string using a namespace UUID
    // This ensures the same string always produces the same UUID
    const crypto = require('crypto');
    const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard namespace UUID
    const hash = crypto.createHash('sha1');
    hash.update(namespace + value);
    const hashBytes = hash.digest();
    
    // Format as UUID v5
    const uuid = [
      hashBytes.toString('hex', 0, 4),
      hashBytes.toString('hex', 4, 6),
      '5' + hashBytes.toString('hex', 7, 8), // Version 5
      ((hashBytes[8] & 0x3f) | 0x80).toString(16) + hashBytes.toString('hex', 9, 10),
      hashBytes.toString('hex', 10, 16)
    ].join('-');
    
    return uuid;
  }

  /**
   * Map database chat to Chat type
   */
  private mapDbChatToChat(dbChat: any): Chat {
    return {
      id: dbChat.id,
      userId: dbChat.user_id,
      chatId: dbChat.chat_id || dbChat.contact_id, // Use chat_id or fall back to contact_id
      type: dbChat.type || 'individual',
      contactName: dbChat.contact_name,
      contactDisplayName: dbChat.contact_display_name,
      isActivated: dbChat.is_activated || false,
      userIsActive: dbChat.user_is_active || false,
      activatedAt: dbChat.activated_at,
      activationMethod: dbChat.activation_method,
      lastMessageTimestamp: dbChat.last_message_timestamp || dbChat.last_message_time,
      lastMessageContent: dbChat.last_message_content || dbChat.last_message,
      lastMessageOrigin: dbChat.last_message_origin,
      createdAt: dbChat.created_at,
      updatedAt: dbChat.updated_at
    };
  }

  /**
   * Map Chat type to database format
   */
  private mapChatToDbChat(chat: Partial<Chat>): any {
    const dbChat: any = {};
    
    if (chat.id !== undefined) dbChat.id = chat.id;
    if (chat.userId !== undefined) dbChat.user_id = this.ensureUUID(chat.userId);
    if (chat.chatId !== undefined) {
      dbChat.chat_id = chat.chatId;
      dbChat.contact_id = chat.chatId; // Also update contact_id
    }
    if (chat.type !== undefined) dbChat.type = chat.type;
    if (chat.contactName !== undefined) dbChat.contact_name = chat.contactName;
    if (chat.contactDisplayName !== undefined) dbChat.contact_display_name = chat.contactDisplayName;
    if (chat.isActivated !== undefined) dbChat.is_activated = chat.isActivated;
    if (chat.userIsActive !== undefined) dbChat.user_is_active = chat.userIsActive;
    if (chat.activatedAt !== undefined) dbChat.activated_at = chat.activatedAt;
    // Remove deactivatedAt reference as it doesn't exist in Chat interface
    if (chat.activationMethod !== undefined) dbChat.activation_method = chat.activationMethod;
    if (chat.lastMessageTimestamp !== undefined) dbChat.last_message_timestamp = chat.lastMessageTimestamp;
    if (chat.lastMessageContent !== undefined) {
      dbChat.last_message_content = chat.lastMessageContent;
      dbChat.last_message = chat.lastMessageContent; // Also update last_message
    }
    if (chat.lastMessageOrigin !== undefined) dbChat.last_message_origin = chat.lastMessageOrigin;
    if (chat.createdAt !== undefined) dbChat.created_at = chat.createdAt;
    if (chat.updatedAt !== undefined) dbChat.updated_at = chat.updatedAt;
    // metadata removed - not part of Chat interface
    
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
      timestamp: dbMessage.timestamp || dbMessage.created_at,
      type: (dbMessage.message_type || dbMessage.type || 'text') as MessageType,
      origin: (dbMessage.origin || 'human') as MessageOrigin,
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
    // Use del method since delPattern may not exist
    try {
      const keys = await this.cache.keys(pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.cache.del(key)));
      }
    } catch (error) {
      this.logger.warn('Failed to clear message cache pattern', { pattern, error });
    }
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

    // Trim if exceeding token limit
    while (context.totalTokens > this.MAX_CONVERSATION_TOKENS && context.messages.length > 1) {
      const removed = context.messages.shift();
      if (removed) {
        context.totalTokens -= removed.estimatedTokens || 0;
      }
    }

    this.conversationTokenMap.set(key, context);
  }

  /**
   * Get a specific message by ID
   */
  async getMessage(userId: string, chatId: string, messageId: string): Promise<{ success: boolean; message?: Message; error?: string }> {
    try {
      const userUuid = this.ensureUUID(userId);

      const { data, error } = await this.db
        .from('messages')
        .select('*')
        .eq('user_id', userUuid)
        .eq('chat_id', chatId)
        .eq('id', messageId)
        .single();

      if (error || !data) {
        return { success: false, error: 'Message not found' };
      }

      return { success: true, message: data };
    } catch (error) {
      this.logger.error('Error getting message', { userId, chatId, messageId, error });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get conversation history for AI context
   */
  async getConversationHistory(
    userId: string,
    chatId: string,
    maxMessages: number = 6,
    maxTokens: number = 2000
  ): Promise<{ success: boolean; context?: ConversationContext; error?: string }> {
    try {
      const userUuid = this.ensureUUID(userId);

      const { data, error } = await this.db
        .from('messages')
        .select('*')
        .eq('user_id', userUuid)
        .eq('chat_id', chatId)
        .order('timestamp', { ascending: false })
        .limit(maxMessages);

      if (error) {
        return { success: false, error: error.message };
      }

      const messages = (data || []).reverse().map(msg => ({
        role: msg.origin === 'bot' ? 'assistant' as const : 'user' as const,
        content: msg.body || msg.content || '',
        timestamp: new Date(msg.timestamp).toISOString(),
        estimatedTokens: Math.ceil((msg.body || msg.content || '').length / 4)
      }));

      const context: ConversationContext = {
        chatId,
        messages,
        totalTokens: messages.reduce((sum, msg) => sum + msg.estimatedTokens, 0),
        lastUpdated: new Date().toISOString()
      };

      return { success: true, context };
    } catch (error) {
      this.logger.error('Error getting conversation history', { userId, chatId, error });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get message statistics for a chat
   */
  async getMessageStatistics(userId: string, chatId: string): Promise<{ success: boolean; statistics?: MessageStatistics; error?: string }> {
    try {
      const userUuid = this.ensureUUID(userId);

      const { data, error } = await this.db
        .from('messages')
        .select('origin, type')
        .eq('user_id', userUuid)
        .eq('chat_id', chatId);

      if (error) {
        return { success: false, error: error.message };
      }

      const messages = data || [];
      const statistics: MessageStatistics = {
        totalMessages: messages.length,
        messagesByOrigin: {
          human: messages.filter(m => m.origin === 'human').length,
          bot: messages.filter(m => m.origin === 'bot').length,
          contact: messages.filter(m => m.origin === 'contact').length,
          system: messages.filter(m => m.origin === 'system').length
        },
        messagesByType: {
          text: messages.filter(m => m.type === 'text').length,
          image: messages.filter(m => m.type === 'image').length,
          video: messages.filter(m => m.type === 'video').length,
          audio: messages.filter(m => m.type === 'audio').length,
          document: messages.filter(m => m.type === 'document').length,
          sticker: messages.filter(m => m.type === 'sticker').length,
          location: messages.filter(m => m.type === 'location').length,
          contact: messages.filter(m => m.type === 'contact').length,
          other: messages.filter(m => !['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact'].includes(m.type)).length
        },
        messagesPerDay: [],
        averageMessageLength: 0,
        responseTimeStats: {
          average: 0,
          median: 0,
          min: 0,
          max: 0
        }
      };

      return { success: true, statistics };
    } catch (error) {
      this.logger.error('Error getting message statistics', { userId, chatId, error });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Clear chat history with optional message count to keep
   */
  async clearChatHistory(userId: string, chatId: string, keepLastMessages: number = 0): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
    try {
      const userUuid = this.ensureUUID(userId);

      if (keepLastMessages > 0) {
        // Get messages to keep (latest ones)
        const { data: keepMessages, error: keepError } = await this.db
          .from('messages')
          .select('id')
          .eq('user_id', userUuid)
          .eq('chat_id', chatId)
          .order('timestamp', { ascending: false })
          .limit(keepLastMessages);

        if (keepError) {
          return { success: false, error: keepError.message };
        }

        const keepIds = (keepMessages || []).map(m => m.id);

        // Delete all messages except the ones to keep
        const { count, error } = await this.db
          .from('messages')
          .delete()
          .eq('user_id', userUuid)
          .eq('chat_id', chatId)
          .not('id', 'in', `(${keepIds.join(',')})`)
          .select('id', { count: 'exact', head: true });

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true, deletedCount: count || 0 };
      } else {
        // Delete all messages
        const { count, error } = await this.db
          .from('messages')
          .delete()
          .eq('user_id', userUuid)
          .eq('chat_id', chatId)
          .select('id', { count: 'exact', head: true });

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true, deletedCount: count || 0 };
      }
    } catch (error) {
      this.logger.error('Error clearing chat history', { userId, chatId, error });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}