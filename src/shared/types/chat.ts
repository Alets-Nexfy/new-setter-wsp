import { Timestamp } from 'firebase/firestore';

// Message types
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'group_invite' | 'unknown';
export type MessageOrigin = 'human' | 'bot' | 'contact' | 'system';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

// Chat types
export type ChatType = 'individual' | 'group' | 'broadcast' | 'status';

// Base message interface
export interface Message {
  id: string;
  chatId: string;
  from: string;
  to: string;
  body: string;
  timestamp: Timestamp | string;
  type: MessageType;
  origin: MessageOrigin;
  status: MessageStatus;
  fromMe: boolean;
  isAutoReply: boolean;
  messageId?: string;
  
  // Media properties
  hasMedia: boolean;
  mediaKey?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaSize?: number;
  
  // Message properties
  hasReacted: boolean;
  hasSticker: boolean;
  isEphemeral: boolean;
  isForwarded: boolean;
  isGif: boolean;
  isStarred: boolean;
  isStatus: boolean;
  
  // Additional properties
  ack?: number;
  inviteV4?: string;
  mentionedIds: string[];
  reaction?: any;
  vCards: any[];
  
  // Metadata
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

// Chat interface
export interface Chat {
  id: string;
  userId: string;
  chatId: string;
  type: ChatType;
  
  // Contact information
  contactName: string;
  contactDisplayName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactCompany?: string;
  
  // Chat status
  isActivated: boolean;
  activatedAt?: Timestamp | string;
  activationMethod?: 'initial_trigger' | 'manual' | 'auto';
  
  // Activity tracking
  userIsActive: boolean;
  lastActivityTimestamp?: Timestamp | string;
  lastHumanMessageTimestamp?: Timestamp | string;
  lastBotMessageTimestamp?: Timestamp | string;
  lastContactMessageTimestamp?: Timestamp | string;
  
  // Last message info
  lastMessageContent?: string;
  lastMessageTimestamp?: Timestamp | string;
  lastMessageType?: MessageType;
  lastMessageOrigin?: MessageOrigin;
  
  // Kanban integration
  kanbanBoardId?: string;
  kanbanColumnId?: string;
  kanbanCardId?: string;
  
  // Timestamps
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
  historyClearedAt?: Timestamp | string;
}

// Message collections structure
export interface MessageCollections {
  messages_all: Message[];
  messages_human: Message[];
  messages_bot: Message[];
  messages_contact: Message[];
}

// Chat with messages
export interface ChatWithMessages extends Chat {
  messages: Message[];
  messageCount: number;
  humanMessageCount: number;
  botMessageCount: number;
  contactMessageCount: number;
}

// Chat list item
export interface ChatListItem {
  chatId: string;
  contactName: string;
  contactDisplayName?: string;
  lastMessageContent: string;
  lastMessageTimestamp: string;
  lastMessageType: MessageType;
  lastMessageOrigin: MessageOrigin;
  isActivated: boolean;
  userIsActive: boolean;
  unreadCount: number;
  kanbanBoardId?: string;
  kanbanColumnId?: string;
}

// Send message request
export interface SendMessageRequest {
  chatId: string;
  message: string;
  origin?: MessageOrigin;
  type?: MessageType;
  metadata?: Record<string, any>;
}

// Send message response
export interface SendMessageResponse {
  success: boolean;
  message: string;
  data?: {
    messageId: string;
    chatId: string;
    content: string;
    timestamp: string;
    origin: MessageOrigin;
  };
}

// Get messages request
export interface GetMessagesRequest {
  chatId: string;
  limit?: number;
  offset?: number;
  before?: string;
  after?: string;
  origin?: MessageOrigin;
  type?: MessageType;
}

// Get messages response
export interface GetMessagesResponse {
  success: boolean;
  data: Message[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

// Get chats request
export interface GetChatsRequest {
  userId: string;
  limit?: number;
  offset?: number;
  search?: string;
  isActivated?: boolean;
  hasKanbanBoard?: boolean;
  sortBy?: 'lastMessage' | 'contactName' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// Get chats response
export interface GetChatsResponse {
  success: boolean;
  data: ChatListItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

// Update contact name request
export interface UpdateContactNameRequest {
  chatId: string;
  name: string;
}

// Chat activation request
export interface ChatActivationRequest {
  chatId: string;
  method?: 'manual' | 'trigger' | 'auto';
  metadata?: Record<string, any>;
}

// Chat deactivation request
export interface ChatDeactivationRequest {
  chatId: string;
  reason?: string;
  sendFarewellMessage?: boolean;
}

// Bulk chat operation
export interface BulkChatOperation {
  operation: 'activate' | 'deactivate' | 'delete' | 'move_to_kanban' | 'clear_history';
  chatIds: string[];
  parameters?: Record<string, any>;
}

// Bulk chat operation result
export interface BulkChatOperationResult {
  success: boolean;
  results: {
    chatId: string;
    success: boolean;
    error?: string;
  }[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

// Chat filters
export interface ChatFilters {
  search?: string;
  isActivated?: boolean;
  userIsActive?: boolean;
  hasKanbanBoard?: boolean;
  kanbanBoardId?: string;
  kanbanColumnId?: string;
  contactName?: string;
  lastMessageAfter?: string;
  lastMessageBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
}

// Chat sort options
export interface ChatSortOptions {
  field: 'lastMessageTimestamp' | 'contactName' | 'createdAt' | 'lastActivityTimestamp';
  order: 'asc' | 'desc';
}

// Message filters
export interface MessageFilters {
  origin?: MessageOrigin;
  type?: MessageType;
  fromMe?: boolean;
  isAutoReply?: boolean;
  hasMedia?: boolean;
  search?: string;
  timestampAfter?: string;
  timestampBefore?: string;
}

// Message sort options
export interface MessageSortOptions {
  field: 'timestamp' | 'createdAt';
  order: 'asc' | 'desc';
}

// Chat statistics
export interface ChatStatistics {
  totalChats: number;
  activatedChats: number;
  activeUsers: number;
  totalMessages: number;
  humanMessages: number;
  botMessages: number;
  contactMessages: number;
  chatsWithKanban: number;
  averageMessagesPerChat: number;
  averageResponseTime: number; // in minutes
  topContacts: {
    chatId: string;
    contactName: string;
    messageCount: number;
  }[];
}

// Message statistics
export interface MessageStatistics {
  totalMessages: number;
  messagesByOrigin: {
    human: number;
    bot: number;
    contact: number;
    system: number;
  };
  messagesByType: {
    text: number;
    image: number;
    video: number;
    audio: number;
    document: number;
    sticker: number;
    location: number;
    contact: number;
    other: number;
  };
  messagesPerDay: {
    date: string;
    count: number;
  }[];
  averageMessageLength: number;
  responseTimeStats: {
    average: number;
    median: number;
    min: number;
    max: number;
  };
}

// Chat activity
export interface ChatActivity {
  id: string;
  chatId: string;
  userId: string;
  action: 'created' | 'activated' | 'deactivated' | 'message_sent' | 'message_received' | 'contact_updated' | 'moved_to_kanban' | 'history_cleared';
  details: string;
  metadata?: Record<string, any>;
  timestamp: Timestamp | string;
}

// Conversation context for AI
export interface ConversationContext {
  chatId: string;
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    estimatedTokens: number;
  }[];
  totalTokens: number;
  lastUpdated: string;
}

// Token tracking
export interface TokenTracking {
  chatId: string;
  totalTokens: number;
  messageCount: number;
  lastUpdated: string;
  maxTokensReached: boolean;
}

// Chat presence
export interface ChatPresence {
  chatId: string;
  userId: string;
  isUserActive: boolean;
  lastActivity: string;
  activitySource: 'message' | 'typing' | 'read' | 'manual';
  inactivityDuration: number; // in minutes
}

// Chat cleanup configuration
export interface ChatCleanupConfig {
  enabled: boolean;
  maxAge: number; // in days
  maxMessages: number;
  keepMinMessages: number;
  collections: ('messages_all' | 'messages_human' | 'messages_bot' | 'messages_contact')[];
  schedule: string; // cron expression
}

// Chat cleanup result
export interface ChatCleanupResult {
  success: boolean;
  stats: {
    usersProcessed: number;
    chatsProcessed: number;
    messagesDeleted: number;
    errors: number;
  };
  duration: number; // in milliseconds
  timestamp: string;
}

// Chat export format
export interface ChatExport {
  chatId: string;
  contactName: string;
  contactDisplayName?: string;
  exportedAt: string;
  messageCount: number;
  dateRange: {
    start: string;
    end: string;
  };
  messages: {
    id: string;
    timestamp: string;
    from: string;
    to: string;
    content: string;
    type: MessageType;
    origin: MessageOrigin;
    fromMe: boolean;
  }[];
  metadata: {
    userId: string;
    exportVersion: string;
    totalSize: number;
  };
}

// Chat import format
export interface ChatImport {
  chatId: string;
  contactName: string;
  messages: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>[];
  metadata?: Record<string, any>;
}

// Chat webhook event
export interface ChatWebhookEvent {
  type: 'message_received' | 'message_sent' | 'chat_activated' | 'chat_deactivated' | 'contact_updated';
  chatId: string;
  userId: string;
  timestamp: string;
  data: any;
}

// Chat notification
export interface ChatNotification {
  id: string;
  chatId: string;
  userId: string;
  type: 'new_message' | 'chat_activated' | 'response_needed' | 'error';
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: string;
}

// Chat template
export interface ChatTemplate {
  id: string;
  name: string;
  description: string;
  category: 'greeting' | 'farewell' | 'auto_response' | 'notification' | 'custom';
  template: string;
  variables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Chat automation rule
export interface ChatAutomationRule {
  id: string;
  name: string;
  description: string;
  conditions: {
    messageContains?: string;
    fromContact?: boolean;
    isFirstMessage?: boolean;
    timeOfDay?: {
      start: string;
      end: string;
    };
    chatInactive?: number; // minutes
  };
  actions: {
    sendMessage?: string;
    activateChat?: boolean;
    deactivateChat?: boolean;
    moveToKanban?: {
      boardId: string;
      columnId: string;
    };
    setContactName?: string;
    addTag?: string;
  };
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

// Chat health check
export interface ChatHealthCheck {
  chatId: string;
  userId: string;
  healthy: boolean;
  issues: string[];
  checks: {
    hasMessages: boolean;
    hasRecentActivity: boolean;
    contactInfoComplete: boolean;
    kanbanIntegration: boolean;
    messageCollectionsSync: boolean;
  };
  lastCheck: string;
  score: number; // 0-100
}

// Chat backup
export interface ChatBackup {
  id: string;
  userId: string;
  chatIds: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  totalChats: number;
  processedChats: number;
  totalMessages: number;
  backupSize: number; // in bytes
  filePath?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
} 