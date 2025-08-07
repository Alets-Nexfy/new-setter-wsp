import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { CacheService } from '@/core/services/CacheService';
import { WhatsAppService } from './WhatsAppService';
import { Session } from '@/core/models/Session';
import { Platform, ConnectionStatus } from '@/shared/types';
import { v4 as uuidv4 } from 'uuid';

export interface CreateSessionOptions {
  userId: string;
  platform: Platform;
  metadata?: {
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
  };
}

export interface SessionInfo {
  id: string;
  sessionId: string;
  userId: string;
  platform: Platform;
  status: ConnectionStatus;
  qrCode?: string;
  phoneNumber?: string;
  username?: string;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class WhatsAppSessionManager {
  private static instance: WhatsAppSessionManager;
  private logger: LoggerService;
  private db: SupabaseService;
  private cache: CacheService;
  private activeSessions: Map<string, WhatsAppService> = new Map();

  private constructor() {
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
  }

  public static getInstance(): WhatsAppSessionManager {
    if (!WhatsAppSessionManager.instance) {
      WhatsAppSessionManager.instance = new WhatsAppSessionManager();
    }
    return WhatsAppSessionManager.instance;
  }

  public async createSession(options: CreateSessionOptions): Promise<SessionInfo> {
    try {
      const sessionId = uuidv4();
      const sessionData = {
        id: sessionId,
        userId: options.userId,
        platform: options.platform,
        sessionId,
        status: 'disconnected' as ConnectionStatus,
        lastActivity: new Date(),
        metadata: options.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to database
      await this.db.from('sessions').insert(sessionData);

      // Cache session info
      await this.cache.setJSON(`session:${sessionId}`, sessionData, 3600); // 1 hour

      this.logger.info('Session created', {
        sessionId,
        userId: options.userId,
        platform: options.platform,
      });

      return sessionData;

    } catch (error) {
      this.logger.error('Failed to create session', {
        userId: options.userId,
        platform: options.platform,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async getSession(sessionId: string): Promise<SessionInfo | null> {
    try {
      // Try cache first
      const cached = await this.cache.getJSON<SessionInfo>(`session:${sessionId}`);
      if (cached) {
        return cached;
      }

      // Get from database
      const { data, error } = await this.db.from('sessions').select('*').eq('id', sessionId).single();
      if (error || !data) {
        return null;
      }

      const sessionData = data as SessionInfo;
      
      // Cache the result
      await this.cache.setJSON(`session:${sessionId}`, sessionData, 3600);

      return sessionData;

    } catch (error) {
      this.logger.error('Failed to get session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  public async getUserSessions(userId: string): Promise<SessionInfo[]> {
    try {
      const { data, error } = await this.db.from('sessions')
        .select('*')
        .eq('userId', userId)
        .eq('platform', 'whatsapp')
        .order('createdAt', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as SessionInfo[];

    } catch (error) {
      this.logger.error('Failed to get user sessions', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  public async connectSession(sessionId: string): Promise<WhatsAppService> {
    try {
      // Get session info first to get userId
      const sessionInfo = await this.getSession(sessionId);
      if (!sessionInfo) {
        throw new Error('Session not found');
      }

      // Check if already connected
      if (this.activeSessions.has(sessionId)) {
        const service = this.activeSessions.get(sessionId)!;
        if (await service.isConnected(sessionInfo.userId)) {
          return service;
        }
      }

      // Create WhatsApp service
      const whatsappService = WhatsAppService.getInstance();
      
      // Initialize the service
      await whatsappService.initialize();

      // Store in active sessions
      this.activeSessions.set(sessionId, whatsappService);

      this.logger.info('Session connected', {
        sessionId,
        userId: sessionInfo.userId,
      });

      return whatsappService;

    } catch (error) {
      this.logger.error('Failed to connect session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async disconnectSession(sessionId: string): Promise<void> {
    try {
      const service = this.activeSessions.get(sessionId);
      if (service) {
        // Get session info to get userId
        const sessionInfo = await this.getSession(sessionId);
        if (sessionInfo) {
          await service.disconnect(sessionInfo.userId);
        }
        this.activeSessions.delete(sessionId);
      }

      // Update session status in database
      await this.db.from('sessions')
        .update({
          status: 'disconnected',
          updatedAt: new Date().toISOString(),
        })
        .eq('id', sessionId);

      // Remove from cache
      await this.cache.del(`session:${sessionId}`);

      this.logger.info('Session disconnected', {
        sessionId,
      });

    } catch (error) {
      this.logger.error('Failed to disconnect session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async deleteSession(sessionId: string): Promise<void> {
    try {
      // Disconnect if active
      await this.disconnectSession(sessionId);

      // Delete from database
      await this.db.from('sessions').delete().eq('id', sessionId);

      this.logger.info('Session deleted', {
        sessionId,
      });

    } catch (error) {
      this.logger.error('Failed to delete session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await this.db.from('sessions')
        .update({
          lastActivity: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .eq('id', sessionId);

      // Update cache
      const sessionInfo = await this.getSession(sessionId);
      if (sessionInfo) {
        sessionInfo.lastActivity = new Date();
        sessionInfo.updatedAt = new Date();
        await this.cache.setJSON(`session:${sessionId}`, sessionInfo, 3600);
      }

    } catch (error) {
      this.logger.error('Failed to update session activity', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  public async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      const { data, error } = await this.db.from('sessions')
        .select('*')
        .eq('platform', 'whatsapp')
        .eq('status', 'connected');

      if (error) {
        throw error;
      }

      return (data || []) as SessionInfo[];

    } catch (error) {
      this.logger.error('Failed to get active sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  public async cleanupExpiredSessions(timeoutMinutes: number = 30): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);
      
      const { data: expiredSessions, error } = await this.db.from('sessions')
        .select('*')
        .eq('platform', 'whatsapp')
        .lt('lastActivity', cutoffTime.toISOString());

      if (error) {
        throw error;
      }

      let cleanedCount = 0;
      for (const session of expiredSessions || []) {
        try {
          await this.disconnectSession(session.id);
          cleanedCount++;
        } catch (error) {
          this.logger.error('Failed to cleanup session', {
            sessionId: session.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.logger.info('Session cleanup completed', {
        cleanedCount,
        timeoutMinutes,
      });

      return cleanedCount;

    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  public getActiveService(sessionId: string): WhatsAppService | undefined {
    return this.activeSessions.get(sessionId);
  }

  public async isSessionActive(sessionId: string): Promise<boolean> {
    const service = this.activeSessions.get(sessionId);
    if (!service) {
      return false;
    }
    
    // Get session info to get userId
    const sessionInfo = await this.getSession(sessionId);
    if (!sessionInfo) {
      return false;
    }
    
    return await service.isConnected(sessionInfo.userId);
  }

  public async getSessionStats(): Promise<{
    total: number;
    active: number;
    connected: number;
    connecting: number;
    disconnected: number;
    error: number;
  }> {
    try {
      const { data: sessions, error } = await this.db.from('sessions')
        .select('*')
        .eq('platform', 'whatsapp');

      if (error) {
        throw error;
      }

      const stats = {
        total: 0,
        active: 0,
        connected: 0,
        connecting: 0,
        disconnected: 0,
        error: 0,
      };

      for (const session of (sessions || [])) {
        stats.total++;
        
        switch (session.status) {
          case 'connected':
            stats.connected++;
            if (await this.isSessionActive(session.id)) {
              stats.active++;
            }
            break;
          case 'connecting':
            stats.connecting++;
            break;
          case 'disconnected':
            stats.disconnected++;
            break;
          case 'error':
            stats.error++;
            break;
        }
      }

      return stats;

    } catch (error) {
      this.logger.error('Failed to get session stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        total: 0,
        active: 0,
        connected: 0,
        connecting: 0,
        disconnected: 0,
        error: 0,
      };
    }
  }

  // Cleanup all sessions
  public async cleanupAll(): Promise<void> {
    try {
      const disconnectPromises = Array.from(this.activeSessions.keys()).map(
        sessionId => this.disconnectSession(sessionId)
      );
      
      await Promise.all(disconnectPromises);
      this.activeSessions.clear();

      this.logger.info('All sessions cleaned up');

    } catch (error) {
      this.logger.error('Failed to cleanup all sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
} 