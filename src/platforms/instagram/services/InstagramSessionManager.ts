import { Logger } from '../../../core/services/LoggerService';
import { CacheService } from '../../../core/services/CacheService';
import { DatabaseService } from '../../../core/services/DatabaseService';
import { QueueService } from '../../../core/services/QueueService';
import { 
  InstagramSession, 
  InstagramLoginCredentials, 
  InstagramSessionConfig,
  InstagramApiResponse 
} from '../../../shared/types/instagram';
import { INSTAGRAM_CONSTANTS } from '../../../shared/constants/instagram';

export class InstagramSessionManager {
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly cache: CacheService,
    private readonly database: DatabaseService,
    private readonly queue: QueueService
  ) {
    this.startCleanupInterval();
  }

  /**
   * Create a new Instagram session
   */
  async createSession(
    userId: string,
    username: string,
    userInfo: any,
    config?: InstagramSessionConfig
  ): Promise<InstagramSession> {
    try {
      const sessionId = `instagram_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session: InstagramSession = {
        id: sessionId,
        userId,
        username,
        sessionId,
        isActive: true,
        lastActivity: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          followersCount: userInfo.followersCount || 0,
          followingCount: userInfo.followingCount || 0,
          postsCount: userInfo.postsCount || 0,
          isBusinessAccount: userInfo.isBusinessAccount || false,
          isVerified: userInfo.isVerified || false,
          profilePicture: userInfo.profilePicture,
          bio: userInfo.bio,
          website: userInfo.website,
        },
        settings: {
          ...INSTAGRAM_CONSTANTS.DEFAULT_SETTINGS,
          ...config,
        },
      };

      // Save to database
      await this.database.collection('instagram_sessions').doc(sessionId).set(session);
      
      // Cache session
      await this.cache.set(
        `${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`,
        session,
        INSTAGRAM_CONSTANTS.SESSION_TIMEOUT
      );

      this.logger.info(`Created Instagram session: ${sessionId} for user: ${username}`);
      return session;
    } catch (error) {
      this.logger.error('Error creating Instagram session:', error);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<InstagramSession | null> {
    try {
      // Try cache first
      const cachedSession = await this.cache.get(`${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`);
      if (cachedSession) {
        return cachedSession as InstagramSession;
      }

      // Try database
      const doc = await this.database.collection('instagram_sessions').doc(sessionId).get();
      if (doc.exists) {
        const session = doc.data() as InstagramSession;
        
        // Cache the session
        await this.cache.set(
          `${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`,
          session,
          INSTAGRAM_CONSTANTS.SESSION_TIMEOUT
        );
        
        return session;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error getting session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: string): Promise<InstagramSession[]> {
    try {
      const snapshot = await this.database
        .collection('instagram_sessions')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .get();

      return snapshot.docs.map(doc => doc.data() as InstagramSession);
    } catch (error) {
      this.logger.error(`Error getting sessions for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Update session
   */
  async updateSession(sessionId: string, updates: Partial<InstagramSession>): Promise<InstagramApiResponse<InstagramSession>> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
          timestamp: new Date(),
        };
      }

      const updatedSession: InstagramSession = {
        ...session,
        ...updates,
        updatedAt: new Date(),
      };

      // Update database
      await this.database.collection('instagram_sessions').doc(sessionId).update(updatedSession);
      
      // Update cache
      await this.cache.set(
        `${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`,
        updatedSession,
        INSTAGRAM_CONSTANTS.SESSION_TIMEOUT
      );

      this.logger.info(`Updated Instagram session: ${sessionId}`);

      return {
        success: true,
        data: updatedSession,
        message: 'Session updated successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error updating session ${sessionId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Update failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (session) {
        session.lastActivity = new Date();
        session.updatedAt = new Date();
        
        await this.database.collection('instagram_sessions').doc(sessionId).update({
          lastActivity: session.lastActivity,
          updatedAt: session.updatedAt,
        });
        
        await this.cache.set(
          `${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`,
          session,
          INSTAGRAM_CONSTANTS.SESSION_TIMEOUT
        );
      }
    } catch (error) {
      this.logger.error(`Error updating session activity ${sessionId}:`, error);
    }
  }

  /**
   * Deactivate session
   */
  async deactivateSession(sessionId: string): Promise<InstagramApiResponse<void>> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
          timestamp: new Date(),
        };
      }

      // Update session status
      await this.updateSession(sessionId, { isActive: false });
      
      // Remove from cache
      await this.cache.delete(`${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`);

      this.logger.info(`Deactivated Instagram session: ${sessionId}`);

      return {
        success: true,
        message: 'Session deactivated successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error deactivating session ${sessionId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deactivation failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<InstagramApiResponse<void>> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
          timestamp: new Date(),
        };
      }

      // Delete from database
      await this.database.collection('instagram_sessions').doc(sessionId).delete();
      
      // Remove from cache
      await this.cache.delete(`${INSTAGRAM_CONSTANTS.CACHE_KEYS.SESSION_PREFIX}${sessionId}`);

      this.logger.info(`Deleted Instagram session: ${sessionId}`);

      return {
        success: true,
        message: 'Session deleted successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error deleting session ${sessionId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deletion failed',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get active sessions count for user
   */
  async getUserActiveSessionsCount(userId: string): Promise<number> {
    try {
      const snapshot = await this.database
        .collection('instagram_sessions')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .get();

      return snapshot.size;
    } catch (error) {
      this.logger.error(`Error getting active sessions count for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Check if user can create new session
   */
  async canCreateSession(userId: string): Promise<boolean> {
    try {
      const activeCount = await this.getUserActiveSessionsCount(userId);
      return activeCount < INSTAGRAM_CONSTANTS.MAX_SESSIONS_PER_USER;
    } catch (error) {
      this.logger.error(`Error checking if user can create session ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get expired sessions
   */
  async getExpiredSessions(): Promise<InstagramSession[]> {
    try {
      const cutoffTime = new Date(Date.now() - INSTAGRAM_CONSTANTS.SESSION_TIMEOUT);
      
      const snapshot = await this.database
        .collection('instagram_sessions')
        .where('isActive', '==', true)
        .where('lastActivity', '<', cutoffTime)
        .get();

      return snapshot.docs.map(doc => doc.data() as InstagramSession);
    } catch (error) {
      this.logger.error('Error getting expired sessions:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const expiredSessions = await this.getExpiredSessions();
      
      for (const session of expiredSessions) {
        await this.deactivateSession(session.sessionId);
        this.logger.info(`Cleaned up expired session: ${session.sessionId}`);
      }

      if (expiredSessions.length > 0) {
        this.logger.info(`Cleaned up ${expiredSessions.length} expired Instagram sessions`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up expired sessions:', error);
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredSessions();
    }, INSTAGRAM_CONSTANTS.SESSION_CLEANUP_INTERVAL);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    byUser: Record<string, number>;
  }> {
    try {
      const snapshot = await this.database.collection('instagram_sessions').get();
      const sessions = snapshot.docs.map(doc => doc.data() as InstagramSession);
      
      const stats = {
        total: sessions.length,
        active: sessions.filter(s => s.isActive).length,
        expired: 0,
        byUser: {} as Record<string, number>,
      };

      // Count by user
      sessions.forEach(session => {
        stats.byUser[session.userId] = (stats.byUser[session.userId] || 0) + 1;
      });

      // Count expired
      const cutoffTime = new Date(Date.now() - INSTAGRAM_CONSTANTS.SESSION_TIMEOUT);
      stats.expired = sessions.filter(s => 
        s.isActive && s.lastActivity < cutoffTime
      ).length;

      return stats;
    } catch (error) {
      this.logger.error('Error getting session stats:', error);
      return {
        total: 0,
        active: 0,
        expired: 0,
        byUser: {},
      };
    }
  }

  /**
   * Validate session
   */
  async validateSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return false;

      // Check if session is active
      if (!session.isActive) return false;

      // Check if session is expired
      const cutoffTime = new Date(Date.now() - INSTAGRAM_CONSTANTS.SESSION_TIMEOUT);
      if (session.lastActivity < cutoffTime) {
        await this.deactivateSession(sessionId);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error validating session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      this.stopCleanupInterval();
      this.logger.info('Instagram session manager cleaned up');
    } catch (error) {
      this.logger.error('Error during session manager cleanup:', error);
    }
  }
} 