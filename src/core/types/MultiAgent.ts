export interface AgentTrigger {
  keyword: string;
  type: 'exact' | 'contains' | 'regex';
  priority: number; // 1-10, higher = more priority
  conditions?: {
    timeOfDay?: string; // 'morning' | 'afternoon' | 'evening'
    previousAgent?: string;
    chatContext?: string[];
  };
}

export interface MultiAgentConfiguration {
  userId: string;
  maxActiveAgents: number; // Based on tier: standard=1, professional=2, enterprise=3
  activeAgents: string[]; // Array of active agent IDs
  defaultAgent: string; // Fallback agent ID
  triggerConfig: {
    initial: { [agentId: string]: AgentTrigger[] };
    switch: { [agentId: string]: AgentTrigger[] };
    fallback: AgentTrigger[];
  };
  switchingBehavior: {
    preserveContext: boolean;
    announceSwitch: boolean;
    switchMessage?: string;
    maxSwitchesPerHour: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatAgentState {
  chatId: string;
  userId: string;
  currentAgentId: string;
  previousAgentId?: string;
  switchHistory: Array<{
    fromAgent: string;
    toAgent: string;
    reason: string;
    trigger?: string;
    timestamp: Date;
  }>;
  context: {
    conversationSummary?: string;
    customerInfo?: Record<string, any>;
    currentTopic?: string;
    urgencyLevel?: 'low' | 'medium' | 'high';
  };
  switchCount: {
    lastHour: number;
    today: number;
    total: number;
  };
  lastUpdated: Date;
}

export interface AgentSwitchResult {
  success: boolean;
  switched: boolean;
  fromAgent?: string;
  toAgent?: string;
  reason?: string;
  trigger?: string;
  contextPreserved: boolean;
  message?: string;
}

export interface TriggerMatchResult {
  matched: boolean;
  agentId?: string;
  trigger?: AgentTrigger;
  confidence: number; // 0-1
  reason: string;
}

export type AgentSwitchReason = 
  | 'initial_trigger'
  | 'switch_trigger' 
  | 'manual_override'
  | 'escalation'
  | 'fallback'
  | 'time_based'
  | 'context_change';