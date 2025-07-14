// Base types
export type Platform = 'whatsapp' | 'instagram';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

// User and Session types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface Session {
  id: string;
  userId: string;
  platform: Platform;
  sessionId: string;
  status: ConnectionStatus;
  qrCode?: string;
  phoneNumber?: string;
  username?: string;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Message types
export interface BaseMessage {
  id: string;
  sessionId: string;
  platform: Platform;
  from: string;
  to: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  status: MessageStatus;
  metadata?: Record<string, any>;
}

export interface TextMessage extends BaseMessage {
  type: 'text';
  content: string;
}

export interface MediaMessage extends BaseMessage {
  type: 'image' | 'video' | 'audio' | 'document';
  content: string;
  mediaUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  caption?: string;
}

export interface LocationMessage extends BaseMessage {
  type: 'location';
  content: string;
  latitude: number;
  longitude: number;
  address?: string;
}

export interface ContactMessage extends BaseMessage {
  type: 'contact';
  content: string;
  contactName: string;
  contactNumber: string;
}

export type Message = TextMessage | MediaMessage | LocationMessage | ContactMessage;

// AI and Automation types
export interface AIResponse {
  id: string;
  messageId: string;
  response: string;
  confidence: number;
  model: string;
  tokens: number;
  processingTime: number;
  createdAt: Date;
}

export interface AutomationRule {
  id: string;
  userId: string;
  platform: Platform;
  name: string;
  description?: string;
  triggers: AutomationTrigger[];
  actions: AutomationAction[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationTrigger {
  type: 'keyword' | 'regex' | 'time' | 'event';
  value: string;
  conditions?: Record<string, any>;
}

export interface AutomationAction {
  type: 'send_message' | 'send_media' | 'ai_response' | 'webhook' | 'delay';
  value: string;
  parameters?: Record<string, any>;
}

// Queue and Worker types
export interface QueueJob {
  id: string;
  type: string;
  data: Record<string, any>;
  priority: number;
  delay?: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface WorkerStatus {
  id: string;
  platform: Platform;
  isRunning: boolean;
  lastHeartbeat: Date;
  processedJobs: number;
  failedJobs: number;
  uptime: number;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Webhook types
export interface WebhookPayload {
  id: string;
  platform: Platform;
  event: string;
  data: Record<string, any>;
  timestamp: Date;
  signature?: string;
}

// Statistics types
export interface MessageStats {
  total: number;
  sent: number;
  received: number;
  failed: number;
  byType: Record<MessageType, number>;
  byPlatform: Record<Platform, number>;
  byDate: Array<{
    date: string;
    count: number;
  }>;
}

export interface SessionStats {
  total: number;
  active: number;
  inactive: number;
  byPlatform: Record<Platform, number>;
  byStatus: Record<ConnectionStatus, number>;
}

// Error types
export interface AppError extends Error {
  code: string;
  statusCode: number;
  isOperational: boolean;
  details?: Record<string, any>;
}

// Event types
export interface PlatformEvent {
  type: string;
  platform: Platform;
  sessionId: string;
  data: Record<string, any>;
  timestamp: Date;
}

// Configuration types
export interface PlatformConfig {
  platform: Platform;
  enabled: boolean;
  maxSessions: number;
  rateLimit: {
    messagesPerMinute: number;
    mediaPerHour: number;
  };
  features: {
    aiEnabled: boolean;
    automationEnabled: boolean;
    webhooksEnabled: boolean;
  };
} 