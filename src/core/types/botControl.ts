export enum BotStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error'
}

export interface BotControl {
  id: string;
  userId: string;
  platform: 'whatsapp' | 'instagram' | 'telegram' | 'facebook';
  status: BotStatus;
  isPaused: boolean;
  pauseReason: string | null;
  pauseStartTime: Date | null;
  pauseEndTime: Date | null;
  lastActivity: Date;
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBotControlDto {
  userId: string;
  platform: 'whatsapp' | 'instagram' | 'telegram' | 'facebook';
  settings?: Record<string, any>;
}

export interface UpdateBotControlDto {
  status?: BotStatus;
  isPaused?: boolean;
  pauseReason?: string;
  settings?: Record<string, any>;
}

export interface BotControlStats {
  active: number;
  paused: number;
  stopped: number;
  total: number;
  byPlatform: Record<string, number>;
}

export interface BotControlFilters {
  status?: BotStatus;
  platform?: string;
  isPaused?: boolean;
  startDate?: Date;
  endDate?: Date;
} 