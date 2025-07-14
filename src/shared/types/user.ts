import { Timestamp } from 'firebase/firestore';

// User status types
export type UserStatus = 'disconnected' | 'connecting' | 'connected' | 'generating_qr' | 'error' | 'session_destroyed';

// Platform types
export type Platform = 'whatsapp' | 'instagram';

// User base interface
export interface User {
  userId: string;
  status: UserStatus;
  activeAgentId: string | null;
  lastQrCode: string | null;
  workerPid: number | null;
  lastError: string | null;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

// Platform-specific status
export interface PlatformStatus {
  status: UserStatus;
  lastError: string | null;
  lastQrCode: string | null;
  updatedAt: Timestamp | string;
}

// User with platform statuses
export interface UserWithPlatforms extends User {
  platforms: {
    whatsapp: PlatformStatus;
    instagram: PlatformStatus;
  };
}

// Connection request
export interface ConnectUserRequest {
  userId: string;
  platform: Platform;
  agentId?: string;
}

// Connection response
export interface ConnectUserResponse {
  success: boolean;
  message: string;
  currentStatus?: UserStatus;
  qrCodeUrl?: string;
}

// Disconnect request
export interface DisconnectUserRequest {
  userId: string;
  platform: Platform;
  force?: boolean;
}

// User status response
export interface UserStatusResponse {
  success: boolean;
  clientReady: boolean;
  qrCodeUrl: string | null;
  status: UserStatus;
  errorMessage: string | null;
  platform: Platform;
  lastUpdated: string;
}

// User creation request
export interface CreateUserRequest {
  userId: string;
  initialAgentId?: string;
  metadata?: Record<string, any>;
}

// User list response
export interface UserListResponse {
  success: boolean;
  users: UserSummary[];
  total: number;
  page?: number;
  limit?: number;
}

// User summary for lists
export interface UserSummary {
  userId: string;
  status: UserStatus;
  activeAgentId: string | null;
  platforms: {
    whatsapp: {
      status: UserStatus;
      lastUpdated: string;
    };
    instagram: {
      status: UserStatus;
      lastUpdated: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

// Worker management
export interface WorkerInfo {
  userId: string;
  platform: Platform;
  pid: number;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  connected: boolean;
  startedAt: string;
  lastHeartbeat?: string;
  agentId?: string;
}

// Worker message types
export interface WorkerMessage {
  type: 'STATUS_UPDATE' | 'QR_CODE' | 'ERROR' | 'HEARTBEAT' | 'COMMAND_RESPONSE';
  payload: any;
  timestamp: string;
  userId: string;
  platform: Platform;
}

// Worker command types
export interface WorkerCommand {
  type: 'COMMAND';
  command: 'SHUTDOWN' | 'RESTART' | 'DESTROY_SESSION' | 'CHANGE_AGENT' | 'RELOAD_CONFIG';
  payload?: any;
  timestamp: string;
}

// Status update payload
export interface StatusUpdatePayload {
  status: UserStatus;
  qrCodeUrl?: string | null;
  error?: string | null;
  message?: string;
  metadata?: Record<string, any>;
}

// QR code data
export interface QRCodeData {
  qrCodeUrl: string;
  expiresAt: string;
  generatedAt: string;
  userId: string;
  platform: Platform;
}

// User session data
export interface UserSession {
  userId: string;
  platform: Platform;
  sessionId: string;
  status: UserStatus;
  connectedAt?: string;
  lastActivity?: string;
  agentId?: string;
  metadata?: Record<string, any>;
}

// Nuclear cleanup types
export interface NuclearCleanupRequest {
  userId: string;
  confirmationCode: string;
  force?: boolean;
}

export interface NuclearCleanupResponse {
  success: boolean;
  message: string;
  results: CleanupResults;
  expectedCode?: string;
  instructions?: string;
}

export interface CleanupResults {
  userId: string;
  timestamp: string;
  steps: CleanupStep[];
  success: boolean;
  errors: string[];
}

export interface CleanupStep {
  name: string;
  items: string[];
  errors: string[];
  success?: boolean;
  duration?: number;
}

// User filters and sorting
export interface UserFilters {
  status?: UserStatus;
  platform?: Platform;
  hasActiveAgent?: boolean;
  hasErrors?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  search?: string;
}

export interface UserSortOptions {
  field: 'userId' | 'status' | 'createdAt' | 'updatedAt';
  order: 'asc' | 'desc';
}

// User analytics
export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  connectedUsers: number;
  errorUsers: number;
  platformStats: {
    whatsapp: {
      connected: number;
      connecting: number;
      disconnected: number;
      error: number;
    };
    instagram: {
      connected: number;
      connecting: number;
      disconnected: number;
      error: number;
    };
  };
  recentActivity: {
    connections: number;
    disconnections: number;
    errors: number;
  };
}

// User activity log
export interface UserActivity {
  id: string;
  userId: string;
  platform: Platform;
  action: 'connect' | 'disconnect' | 'error' | 'qr_generated' | 'session_destroyed' | 'agent_changed';
  details: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

// Bulk operations
export interface BulkUserOperation {
  operation: 'connect' | 'disconnect' | 'delete' | 'change_agent';
  userIds: string[];
  platform?: Platform;
  agentId?: string;
  force?: boolean;
}

export interface BulkOperationResult {
  success: boolean;
  results: {
    userId: string;
    success: boolean;
    error?: string;
  }[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

// User configuration
export interface UserConfig {
  userId: string;
  settings: {
    autoReconnect: boolean;
    qrCodeExpiration: number; // minutes
    maxRetries: number;
    heartbeatInterval: number; // seconds
  };
  notifications: {
    onConnect: boolean;
    onDisconnect: boolean;
    onError: boolean;
  };
  platforms: {
    whatsapp: {
      enabled: boolean;
      defaultAgentId?: string;
    };
    instagram: {
      enabled: boolean;
      defaultAgentId?: string;
    };
  };
}

// WebSocket connection info
export interface WebSocketConnection {
  userId: string;
  connectionId: string;
  connectedAt: string;
  lastPing?: string;
  userAgent?: string;
  ipAddress?: string;
}

// Health check response
export interface UserHealthCheck {
  userId: string;
  platforms: {
    whatsapp: {
      healthy: boolean;
      status: UserStatus;
      lastCheck: string;
      issues?: string[];
    };
    instagram: {
      healthy: boolean;
      status: UserStatus;
      lastCheck: string;
      issues?: string[];
    };
  };
  worker: {
    running: boolean;
    pid?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  overall: {
    healthy: boolean;
    score: number; // 0-100
    issues: string[];
  };
} 