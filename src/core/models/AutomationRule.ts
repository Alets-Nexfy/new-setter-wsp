export interface Trigger {
  text: string;
  type: 'contains' | 'exact' | 'starts_with';
  description?: string;
}

export interface Response {
  text: string;
  type: 'text' | 'media' | 'template';
  mediaUrl?: string;
  templateName?: string;
  variables?: Record<string, string>;
}

export interface AutomationRule {
  id: string;
  userId: string;
  name?: string;
  description?: string;
  trigger: Trigger;
  response: Response;
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
  lastTriggered?: Date;
  triggerCount?: number;
}

export interface CreateAutomationRuleRequest {
  name?: string;
  description?: string;
  trigger: Trigger;
  response: Response;
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

export interface UpdateAutomationRuleRequest {
  name?: string;
  description?: string;
  trigger?: Trigger;
  response?: Response;
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

export interface AutomationRuleStatistics {
  total: number;
  active: number;
  inactive: number;
  byType: Record<string, number>;
  byTriggerType: Record<string, number>;
  byResponseType: Record<string, number>;
  mostTriggered: AutomationRule[];
  recentlyCreated: AutomationRule[];
}

export interface AutomationRuleFilters {
  isActive?: boolean;
  triggerType?: string;
  responseType?: string;
  hasConditions?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string;
}

export interface AutomationRuleSortOptions {
  field: 'name' | 'createdAt' | 'updatedAt' | 'lastTriggered' | 'triggerCount' | 'priority';
  direction: 'asc' | 'desc';
} 