// API Constants
export const API_VERSION = 'v2';
export const API_PREFIX = `/api/${API_VERSION}`;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error Codes
export const ERROR_CODES = {
  // Authentication
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
  
  // Session Management
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS: 'SESSION_ALREADY_EXISTS',
  SESSION_CONNECTION_FAILED: 'SESSION_CONNECTION_FAILED',
  SESSION_DISCONNECTED: 'SESSION_DISCONNECTED',
  
  // Message Handling
  MESSAGE_SEND_FAILED: 'MESSAGE_SEND_FAILED',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  INVALID_MESSAGE_TYPE: 'INVALID_MESSAGE_TYPE',
  MEDIA_UPLOAD_FAILED: 'MEDIA_UPLOAD_FAILED',
  
  // Platform Specific
  WHATSAPP_NOT_CONNECTED: 'WHATSAPP_NOT_CONNECTED',
  INSTAGRAM_NOT_CONNECTED: 'INSTAGRAM_NOT_CONNECTED',
  QR_CODE_EXPIRED: 'QR_CODE_EXPIRED',
  PHONE_NUMBER_INVALID: 'PHONE_NUMBER_INVALID',
  
  // AI Integration
  AI_GENERATION_FAILED: 'AI_GENERATION_FAILED',
  AI_MODEL_UNAVAILABLE: 'AI_MODEL_UNAVAILABLE',
  AI_RATE_LIMIT_EXCEEDED: 'AI_RATE_LIMIT_EXCEEDED',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  
  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  
  // External Services
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  WEBHOOK_FAILED: 'WEBHOOK_FAILED',
  
  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
} as const;

// Message Types
export const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  LOCATION: 'location',
  CONTACT: 'contact',
} as const;

// Platform Types
export const PLATFORMS = {
  WHATSAPP: 'whatsapp',
  INSTAGRAM: 'instagram',
} as const;

// Connection Status
export const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
} as const;

// Message Status
export const MESSAGE_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
} as const;

// Queue Job Types
export const JOB_TYPES = {
  // WhatsApp Jobs
  WHATSAPP_SEND_MESSAGE: 'whatsapp:send-message',
  WHATSAPP_SEND_MEDIA: 'whatsapp:send-media',
  WHATSAPP_PROCESS_WEBHOOK: 'whatsapp:process-webhook',
  
  // Instagram Jobs
  INSTAGRAM_SEND_MESSAGE: 'instagram:send-message',
  INSTAGRAM_SEND_MEDIA: 'instagram:send-media',
  INSTAGRAM_PROCESS_WEBHOOK: 'instagram:process-webhook',
  
  // AI Jobs
  AI_GENERATE_RESPONSE: 'ai:generate-response',
  AI_ANALYZE_SENTIMENT: 'ai:analyze-sentiment',
  AI_SUMMARIZE_CONVERSATION: 'ai:summarize-conversation',
  
  // Automation Jobs
  AUTOMATION_TRIGGER: 'automation:trigger',
  AUTOMATION_EXECUTE: 'automation:execute',
  
  // Maintenance Jobs
  CLEANUP_OLD_MESSAGES: 'maintenance:cleanup-old-messages',
  CLEANUP_EXPIRED_SESSIONS: 'maintenance:cleanup-expired-sessions',
  BACKUP_DATA: 'maintenance:backup-data',
} as const;

// Event Types
export const EVENT_TYPES = {
  // Session Events
  SESSION_CONNECTED: 'session:connected',
  SESSION_DISCONNECTED: 'session:disconnected',
  SESSION_ERROR: 'session:error',
  QR_CODE_GENERATED: 'session:qr-code-generated',
  
  // Message Events
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_SENT: 'message:sent',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  MESSAGE_FAILED: 'message:failed',
  
  // AI Events
  AI_RESPONSE_GENERATED: 'ai:response-generated',
  AI_ERROR: 'ai:error',
  
  // Automation Events
  AUTOMATION_TRIGGERED: 'automation:triggered',
  AUTOMATION_EXECUTED: 'automation:executed',
  
  // System Events
  WORKER_STARTED: 'worker:started',
  WORKER_STOPPED: 'worker:stopped',
  WORKER_ERROR: 'worker:error',
} as const;

// File Upload Limits
export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv'],
  ALLOWED_AUDIO_TYPES: ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
} as const;

// Rate Limiting
export const RATE_LIMITS = {
  DEFAULT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  DEFAULT_MAX_REQUESTS: 100,
  MESSAGE_SEND_WINDOW_MS: 60 * 1000, // 1 minute
  MESSAGE_SEND_MAX_REQUESTS: 30,
  AI_GENERATION_WINDOW_MS: 60 * 1000, // 1 minute
  AI_GENERATION_MAX_REQUESTS: 10,
} as const;

// Cache Keys
export const CACHE_KEYS = {
  SESSION_PREFIX: 'session:',
  USER_PREFIX: 'user:',
  MESSAGE_PREFIX: 'message:',
  STATS_PREFIX: 'stats:',
  RATE_LIMIT_PREFIX: 'rate_limit:',
} as const;

// Database Collections
export const COLLECTIONS = {
  USERS: 'users',
  SESSIONS: 'sessions',
  MESSAGES: 'messages',
  AI_RESPONSES: 'ai_responses',
  AUTOMATION_RULES: 'automation_rules',
  WEBHOOK_LOGS: 'webhook_logs',
  STATISTICS: 'statistics',
} as const;

// WebSocket Events
export const WS_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  SESSION_UPDATE: 'session:update',
  MESSAGE_UPDATE: 'message:update',
  AI_RESPONSE: 'ai:response',
  ERROR: 'error',
} as const;

// Logging
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

// Time Constants
export const TIME_CONSTANTS = {
  ONE_MINUTE: 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
  ONE_MONTH: 30 * 24 * 60 * 60 * 1000,
} as const;

// Default Values
export const DEFAULTS = {
  PAGINATION_LIMIT: 20,
  MAX_PAGINATION_LIMIT: 100,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  MESSAGE_RETENTION_DAYS: 90,
  AI_MAX_TOKENS: 1000,
  AI_TEMPERATURE: 0.7,
} as const; 