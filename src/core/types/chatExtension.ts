export enum ExtensionType {
  QUICK_REPLY = 'quick_reply',
  TEMPLATE = 'template',
  AUTO_RESPONSE = 'auto_response',
  GREETING = 'greeting',
  FAREWELL = 'farewell',
  CUSTOM = 'custom'
}

export interface ChatExtension {
  id: string;
  userId: string;
  name: string;
  type: ExtensionType;
  content: string;
  description: string;
  isActive: boolean;
  tags: string[];
  metadata: Record<string, any>;
  usageCount: number;
  lastUsed: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateChatExtensionDto {
  userId: string;
  name: string;
  type: ExtensionType;
  content: string;
  description?: string;
  isActive?: boolean;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateChatExtensionDto {
  name?: string;
  content?: string;
  description?: string;
  isActive?: boolean;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ChatExtensionStats {
  total: number;
  active: number;
  byType: Record<string, number>;
  byTag: Record<string, number>;
  totalUsage: number;
  mostUsed: ChatExtension[];
}

export interface ChatExtensionFilters {
  type?: ExtensionType;
  isActive?: boolean;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
} 