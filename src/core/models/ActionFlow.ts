export interface ActionFlowTrigger {
  text: string;
  type: 'contains' | 'exact' | 'starts_with';
  description?: string;
}

export interface ActionFlowStep {
  id: string;
  name: string;
  type: 'send_message' | 'send_media' | 'send_template' | 'add_tag' | 'remove_tag' | 
        'move_to_kanban' | 'create_kanban_card' | 'update_kanban_card' | 'send_notification' |
        'wait' | 'condition' | 'loop' | 'http_request' | 'database_query' | 'custom_function';
  value?: any;
  condition?: any;
  critical?: boolean;
  description?: string;
  order: number;
  enabled: boolean;
}

export interface ActionFlow {
  id: string;
  userId: string;
  name: string;
  description?: string;
  trigger: ActionFlowTrigger;
  steps: ActionFlowStep[];
  status: 'draft' | 'active' | 'paused' | 'archived';
  isActive: boolean;
  priority?: number;
  conditions?: {
    timeRange?: {
      start: string;
      end: string;
    };
    dayOfWeek?: number[];
    userTags?: string[];
    chatTags?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  lastExecuted?: Date;
  executionCount: number;
  averageExecutionTime: number;
  successRate?: number;
  lastError?: string;
}

export interface CreateActionFlowRequest {
  name: string;
  description?: string;
  trigger: ActionFlowTrigger;
  steps: ActionFlowStep[];
  priority?: number;
  conditions?: {
    timeRange?: {
      start: string;
      end: string;
    };
    dayOfWeek?: number[];
    userTags?: string[];
    chatTags?: string[];
  };
}

export interface UpdateActionFlowRequest {
  name?: string;
  description?: string;
  trigger?: ActionFlowTrigger;
  steps?: ActionFlowStep[];
  status?: 'draft' | 'active' | 'paused' | 'archived';
  isActive?: boolean;
  priority?: number;
  conditions?: {
    timeRange?: {
      start: string;
      end: string;
    };
    dayOfWeek?: number[];
    userTags?: string[];
    chatTags?: string[];
  };
}

export interface ActionFlowExecution {
  id: string;
  flowId: string;
  userId: string;
  success: boolean;
  results: any[];
  errors: string[];
  executionTime: number;
  context: any;
  timestamp: Date;
}

export interface ActionFlowStatistics {
  total: number;
  active: number;
  inactive: number;
  draft: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  mostExecuted: ActionFlow[];
  recentlyCreated: ActionFlow[];
  averageExecutionTime: number;
  totalExecutions: number;
  successRate: number;
}

export interface ActionFlowFilters {
  status?: string;
  isActive?: boolean;
  triggerType?: string;
  hasConditions?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string;
}

export interface ActionFlowSortOptions {
  field: 'name' | 'createdAt' | 'updatedAt' | 'lastExecuted' | 'executionCount' | 'priority' | 'averageExecutionTime';
  direction: 'asc' | 'desc';
}

export interface ActionFlowExecutionResult {
  success: boolean;
  executionId: string;
  results: any[];
  errors: string[];
  executionTime: number;
  flowId: string;
  userId: string;
  timestamp: Date;
} 