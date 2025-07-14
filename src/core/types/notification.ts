export enum NotificationType {
  SYSTEM = 'system',
  MESSAGE = 'message',
  AGENT = 'agent',
  TRIGGER = 'trigger',
  CAMPAIGN = 'campaign',
  ERROR = 'error',
  WARNING = 'warning',
  SUCCESS = 'success',
  INFO = 'info'
}

export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read'
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, any>;
  status: NotificationStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: Date;
  updatedAt: Date;
  readAt: Date | null;
  expiresAt: Date | null;
}

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  expiresAt?: Date;
}

export interface UpdateNotificationDto {
  status?: NotificationStatus;
  readAt?: Date;
  data?: Record<string, any>;
}

export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
}

export interface NotificationFilters {
  status?: NotificationStatus;
  type?: NotificationType;
  priority?: string;
  startDate?: Date;
  endDate?: Date;
} 