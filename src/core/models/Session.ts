import { BaseEntity, BaseModel } from './BaseModel';
import { Platform, ConnectionStatus } from '@/shared/types';

export interface SessionModel extends BaseModel {
  userId: string;
  platform: Platform;
  sessionId: string;
  status: ConnectionStatus;
  qrCode?: string;
  phoneNumber?: string;
  username?: string;
  lastActivity: Date;
  metadata?: SessionMetadata;
}

export interface SessionMetadata {
  deviceInfo?: {
    platform: string;
    browser: string;
    version: string;
  };
  connectionInfo?: {
    ip: string;
    userAgent: string;
    location?: string;
  };
  settings?: {
    autoReply: boolean;
    aiEnabled: boolean;
    webhooksEnabled: boolean;
  };
  workerCreated?: boolean;
  botPaused?: boolean;
}

export class Session extends BaseEntity implements SessionModel {
  public userId: string;
  public platform: Platform;
  public sessionId: string;
  public status: ConnectionStatus;
  public qrCode?: string;
  public phoneNumber?: string;
  public username?: string;
  public lastActivity: Date;
  public metadata?: SessionMetadata;

  constructor(data: Partial<SessionModel>) {
    super(data);
    this.userId = data.userId || '';
    this.platform = data.platform || 'whatsapp';
    this.sessionId = data.sessionId || '';
    this.status = data.status || 'disconnected';
    this.qrCode = data.qrCode;
    this.phoneNumber = data.phoneNumber;
    this.username = data.username;
    this.lastActivity = data.lastActivity || new Date();
    this.metadata = data.metadata;
  }

  public toFirestore(): Record<string, any> {
    return {
      ...super.toFirestore(),
      userId: this.userId,
      platform: this.platform,
      sessionId: this.sessionId,
      status: this.status,
      qrCode: this.qrCode,
      phoneNumber: this.phoneNumber,
      username: this.username,
      lastActivity: this.lastActivity,
      metadata: this.metadata,
    };
  }

  public static fromFirestore(data: any): Session {
    return new Session({
      id: data.id,
      userId: data.userId,
      platform: data.platform,
      sessionId: data.sessionId,
      status: data.status,
      qrCode: data.qrCode,
      phoneNumber: data.phoneNumber,
      username: data.username,
      lastActivity: data.lastActivity?.toDate?.() || data.lastActivity,
      metadata: data.metadata,
      createdAt: data.createdAt?.toDate?.() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
    });
  }

  public updateStatus(status: ConnectionStatus): void {
    this.status = status;
    this.update();
  }

  public updateQRCode(qrCode: string): void {
    this.qrCode = qrCode;
    this.update();
  }

  public updateConnectionInfo(phoneNumber?: string, username?: string): void {
    if (phoneNumber) this.phoneNumber = phoneNumber;
    if (username) this.username = username;
    this.update();
  }

  public updateLastActivity(): void {
    this.lastActivity = new Date();
    this.update();
  }

  public isConnected(): boolean {
    return this.status === 'connected';
  }

  public isConnecting(): boolean {
    return this.status === 'connecting';
  }

  public hasError(): boolean {
    return this.status === 'error';
  }

  public isExpired(timeoutMinutes: number = 30): boolean {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    return Date.now() - this.lastActivity.getTime() > timeoutMs;
  }

  public toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      userId: this.userId,
      platform: this.platform,
      sessionId: this.sessionId,
      status: this.status,
      qrCode: this.qrCode,
      phoneNumber: this.phoneNumber,
      username: this.username,
      lastActivity: this.lastActivity.toISOString(),
      metadata: this.metadata,
    };
  }
} 