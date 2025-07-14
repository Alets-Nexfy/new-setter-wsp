export enum FunctionStatus {
  DRAFT = 'draft',
  DEPLOYING = 'deploying',
  DEPLOYED = 'deployed',
  FAILED = 'failed',
  UNDEPLOYING = 'undeploying'
}

export interface FirebaseFunction {
  id: string;
  name: string;
  description: string;
  code: string;
  runtime: 'nodejs16' | 'nodejs18' | 'nodejs20' | 'python311' | 'python312';
  region: string;
  memory: string;
  timeout: number;
  triggers: any[];
  environment: Record<string, any>;
  isActive: boolean;
  version: number;
  lastDeployed: Date | null;
  deploymentStatus: FunctionStatus;
  errorCount: number;
  executionCount: number;
  avgExecutionTime: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFirebaseFunctionDto {
  name: string;
  description?: string;
  code: string;
  runtime?: 'nodejs16' | 'nodejs18' | 'nodejs20' | 'python311' | 'python312';
  region?: string;
  memory?: string;
  timeout?: number;
  triggers?: any[];
  environment?: Record<string, any>;
  isActive?: boolean;
}

export interface UpdateFirebaseFunctionDto {
  name?: string;
  description?: string;
  code?: string;
  runtime?: 'nodejs16' | 'nodejs18' | 'nodejs20' | 'python311' | 'python312';
  region?: string;
  memory?: string;
  timeout?: number;
  triggers?: any[];
  environment?: Record<string, any>;
  isActive?: boolean;
}

export interface FunctionTrigger {
  type: 'http' | 'pubsub' | 'firestore' | 'storage' | 'auth';
  config: Record<string, any>;
}

export interface FunctionLog {
  timestamp: Date;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG';
  message: string;
  executionTime?: number;
  memoryUsed?: string;
  error?: string;
}

export interface FunctionStats {
  totalExecutions: number;
  avgExecutionTime: number;
  errorRate: number;
  memoryUsage: string;
  lastExecution: Date | null;
}

export interface AllFunctionStats {
  totalFunctions: number;
  activeFunctions: number;
  deployedFunctions: number;
  totalExecutions: number;
  avgErrorRate: number;
  byRegion: Record<string, number>;
  byStatus: Record<string, number>;
} 