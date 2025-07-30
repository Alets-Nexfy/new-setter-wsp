export interface IPCMessage {
  type: 'qr' | 'ready' | 'message' | 'auth_failure' | 'error' | 'status' | 'response' | 'command' | 'initialized';
  userId: string;
  data: any;
  timestamp: Date;
  messageId?: string;
}

export interface WorkerCommand {
  command: 'sendMessage' | 'pauseBot' | 'resumeBot' | 'setAgent' | 'getStatus' | 'disconnect';
  params?: any;
  messageId?: string;
}

export interface MessageData {
  from: string;
  to: string;
  body: string;
  type: 'chat' | 'group';
  timestamp: Date;
  messageId: string;
  hasMedia: boolean;
  mediaType?: string;
  isFromMe: boolean;
  quotedMessage?: any;
  contact?: {
    id: string;
    name?: string;
    pushname?: string;
    profilePicUrl?: string;
  };
  chat?: {
    id: string;
    name?: string;
    isGroup: boolean;
    participants?: string[];
  };
}

export interface WorkerConfig {
  userId: string;
  sessionId: string;
  phoneNumber?: string;
  agentId?: string;
  maxRestarts: number;
  restartDelay: number;
  timeout: number;
  puppeteerConfig: {
    headless: boolean;
    args: string[];
    executablePath?: string;
  };
}

export interface WorkerStatus {
  userId: string;
  processId: number | null;
  status: 'starting' | 'running' | 'paused' | 'error' | 'stopped';
  qrCode?: string;
  qrImage?: string;
  lastActivity: Date;
  restartCount: number;
  isAuthenticated: boolean;
  phoneNumber?: string;
  agentId?: string;
  errorMessage?: string;
  uptime: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface QRCodeData {
  qr: string;
  qrImage: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuthenticationData {
  userId: string;
  phoneNumber: string;
  isAuthenticated: boolean;
  authenticatedAt: Date;
  sessionData?: any;
}

export interface WorkerMetrics {
  userId: string;
  messagesProcessed: number;
  messagesSent: number;
  messagesReceived: number;
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  lastActivity: Date;
  errors: number;
  restarts: number;
}

export interface MessageProcessingResult {
  success: boolean;
  messageId?: string;
  error?: string;
  processingTime: number;
  aiUsed: boolean;
  humanPresenceDetected: boolean;
  actionsTaken: string[];
}

export interface AutomationRule {
  id: string;
  userId: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: {
    messageContains?: string[];
    senderIs?: string[];
    timeRange?: {
      start: string;
      end: string;
    };
    chatType?: 'individual' | 'group' | 'both';
  };
  actions: {
    type: 'reply' | 'forward' | 'tag' | 'delay' | 'webhook';
    config: any;
  }[];
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatActivationTrigger {
  id: string;
  userId: string;
  chatId: string;
  triggerMessage: string;
  activatedAt: Date;
  expiresAt: Date;
  isActive: boolean;
  activationCount: number;
}

export interface HumanPresenceData {
  userId: string;
  chatId: string;
  isPresent: boolean;
  lastActivity: Date;
  detectionMethod: 'typing' | 'online' | 'recent_message' | 'manual';
  confidence: number;
}

export interface AIResponseConfig {
  userId: string;
  agentId: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  contextWindow: number;
  enabledFeatures: string[];
}

export interface MessageContext {
  userId: string;
  chatId: string;
  messageHistory: MessageData[];
  chatMetadata: {
    name?: string;
    isGroup: boolean;
    participants?: string[];
    description?: string;
  };
  userProfile: {
    name?: string;
    phone?: string;
    tags?: string[];
    notes?: string;
    lastInteraction?: Date;
  };
  automationRules: AutomationRule[];
  activeAgent?: {
    id: string;
    name: string;
    personality: string;
    instructions: string;
  };
}