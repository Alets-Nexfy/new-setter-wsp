export enum TriggerType {
  WELCOME = 'welcome',
  FIRST_MESSAGE = 'first_message',
  ONBOARDING = 'onboarding',
  GREETING = 'greeting',
  CUSTOM = 'custom'
}

export interface InitialTrigger {
  id: string;
  userId: string;
  name: string;
  type: TriggerType;
  platform: 'whatsapp' | 'instagram' | 'telegram' | 'facebook';
  conditions: TriggerCondition[];
  actions: TriggerAction[];
  message: string;
  isActive: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  delay: number; // seconds
  maxExecutions: number;
  executionCount: number;
  lastExecuted: Date | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInitialTriggerDto {
  userId: string;
  name: string;
  type: TriggerType;
  platform: 'whatsapp' | 'instagram' | 'telegram' | 'facebook';
  conditions?: TriggerCondition[];
  actions?: TriggerAction[];
  message: string;
  isActive?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  delay?: number;
  maxExecutions?: number;
  metadata?: Record<string, any>;
}

export interface UpdateInitialTriggerDto {
  name?: string;
  type?: TriggerType;
  platform?: 'whatsapp' | 'instagram' | 'telegram' | 'facebook';
  conditions?: TriggerCondition[];
  actions?: TriggerAction[];
  message?: string;
  isActive?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  delay?: number;
  maxExecutions?: number;
  metadata?: Record<string, any>;
}

export interface TriggerCondition {
  type: 'contact_new' | 'platform_match' | 'time_based' | 'message_contains';
  config: Record<string, any>;
}

export interface TriggerAction {
  type: 'send_message' | 'add_tag' | 'update_contact' | 'trigger_agent' | 'webhook';
  config: Record<string, any>;
}

export interface InitialTriggerStats {
  total: number;
  active: number;
  byType: Record<string, number>;
  byPlatform: Record<string, number>;
  totalExecutions: number;
  mostExecuted: InitialTrigger[];
}

export interface InitialTriggerFilters {
  type?: TriggerType;
  platform?: string;
  isActive?: boolean;
  priority?: string;
  startDate?: Date;
  endDate?: Date;
} 