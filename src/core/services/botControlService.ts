import { db } from '../config/firebase';
import { BotStatus, BotControl, CreateBotControlDto, UpdateBotControlDto } from '../types/botControl';
import { logger } from '../utils/logger';

export class BotControlService {
  private readonly botControlsCollection = 'botControls';
  private readonly usersCollection = 'users';

  /**
   * Create bot control for a user
   */
  async createBotControl(data: CreateBotControlDto): Promise<BotControl> {
    try {
      const botControl: BotControl = {
        id: '',
        userId: data.userId,
        platform: data.platform,
        status: BotStatus.ACTIVE,
        isPaused: false,
        pauseReason: null,
        pauseStartTime: null,
        pauseEndTime: null,
        lastActivity: new Date(),
        settings: data.settings || {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await db.collection(this.botControlsCollection).add(botControl);
      botControl.id = docRef.id;

      await docRef.update({ id: docRef.id });

      logger.info(`Bot control created: ${docRef.id} for user: ${data.userId}`);
      return botControl;
    } catch (error) {
      logger.error('Error creating bot control:', error);
      throw new Error('Failed to create bot control');
    }
  }

  /**
   * Get bot control for a user and platform
   */
  async getBotControl(userId: string, platform: string): Promise<BotControl | null> {
    try {
      const snapshot = await db.collection(this.botControlsCollection)
        .where('userId', '==', userId)
        .where('platform', '==', platform)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      return snapshot.docs[0].data() as BotControl;
    } catch (error) {
      logger.error('Error getting bot control:', error);
      throw new Error('Failed to get bot control');
    }
  }

  /**
   * Get all bot controls for a user
   */
  async getUserBotControls(userId: string): Promise<BotControl[]> {
    try {
      const snapshot = await db.collection(this.botControlsCollection)
        .where('userId', '==', userId)
        .get();

      const botControls: BotControl[] = [];
      snapshot.forEach(doc => {
        botControls.push(doc.data() as BotControl);
      });

      return botControls;
    } catch (error) {
      logger.error('Error getting user bot controls:', error);
      throw new Error('Failed to get user bot controls');
    }
  }

  /**
   * Update bot control
   */
  async updateBotControl(botControlId: string, data: UpdateBotControlDto): Promise<BotControl> {
    try {
      const updateData: Partial<BotControl> = {
        ...data,
        updatedAt: new Date()
      };

      if (data.isPaused !== undefined) {
        if (data.isPaused) {
          updateData.pauseStartTime = new Date();
          updateData.pauseEndTime = null;
        } else {
          updateData.pauseEndTime = new Date();
          updateData.pauseStartTime = null;
          updateData.pauseReason = null;
        }
      }

      await db.collection(this.botControlsCollection).doc(botControlId).update(updateData);

      const updated = await db.collection(this.botControlsCollection).doc(botControlId).get();
      return updated.data() as BotControl;
    } catch (error) {
      logger.error('Error updating bot control:', error);
      throw new Error('Failed to update bot control');
    }
  }

  /**
   * Pause bot
   */
  async pauseBot(userId: string, platform: string, reason?: string): Promise<void> {
    try {
      const botControl = await this.getBotControl(userId, platform);
      
      if (!botControl) {
        throw new Error('Bot control not found');
      }

      await this.updateBotControl(botControl.id, {
        isPaused: true,
        pauseReason: reason || 'Manual pause',
        status: BotStatus.PAUSED
      });

      logger.info(`Bot paused for user: ${userId}, platform: ${platform}`);
    } catch (error) {
      logger.error('Error pausing bot:', error);
      throw new Error('Failed to pause bot');
    }
  }

  /**
   * Resume bot
   */
  async resumeBot(userId: string, platform: string): Promise<void> {
    try {
      const botControl = await this.getBotControl(userId, platform);
      
      if (!botControl) {
        throw new Error('Bot control not found');
      }

      await this.updateBotControl(botControl.id, {
        isPaused: false,
        pauseReason: null,
        status: BotStatus.ACTIVE
      });

      logger.info(`Bot resumed for user: ${userId}, platform: ${platform}`);
    } catch (error) {
      logger.error('Error resuming bot:', error);
      throw new Error('Failed to resume bot');
    }
  }

  /**
   * Stop bot
   */
  async stopBot(userId: string, platform: string): Promise<void> {
    try {
      const botControl = await this.getBotControl(userId, platform);
      
      if (!botControl) {
        throw new Error('Bot control not found');
      }

      await this.updateBotControl(botControl.id, {
        isPaused: true,
        pauseReason: 'Bot stopped',
        status: BotStatus.STOPPED
      });

      logger.info(`Bot stopped for user: ${userId}, platform: ${platform}`);
    } catch (error) {
      logger.error('Error stopping bot:', error);
      throw new Error('Failed to stop bot');
    }
  }

  /**
   * Update bot activity
   */
  async updateBotActivity(userId: string, platform: string): Promise<void> {
    try {
      const botControl = await this.getBotControl(userId, platform);
      
      if (!botControl) {
        return;
      }

      await this.updateBotControl(botControl.id, {
        lastActivity: new Date()
      });
    } catch (error) {
      logger.error('Error updating bot activity:', error);
      // Don't throw error for activity updates
    }
  }

  /**
   * Get bot status for all users
   */
  async getAllBotStatuses(): Promise<{
    active: number;
    paused: number;
    stopped: number;
    total: number;
    byPlatform: Record<string, number>;
  }> {
    try {
      const snapshot = await db.collection(this.botControlsCollection).get();
      
      const stats = {
        active: 0,
        paused: 0,
        stopped: 0,
        total: 0,
        byPlatform: {} as Record<string, number>
      };

      snapshot.forEach(doc => {
        const data = doc.data() as BotControl;
        stats.total++;

        switch (data.status) {
          case BotStatus.ACTIVE:
            stats.active++;
            break;
          case BotStatus.PAUSED:
            stats.paused++;
            break;
          case BotStatus.STOPPED:
            stats.stopped++;
            break;
        }

        stats.byPlatform[data.platform] = (stats.byPlatform[data.platform] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('Error getting all bot statuses:', error);
      throw new Error('Failed to get bot statuses');
    }
  }

  /**
   * Get inactive bots (no activity for specified time)
   */
  async getInactiveBots(hours: number = 24): Promise<BotControl[]> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);

      const snapshot = await db.collection(this.botControlsCollection)
        .where('lastActivity', '<', cutoffTime)
        .where('status', '==', BotStatus.ACTIVE)
        .get();

      const inactiveBots: BotControl[] = [];
      snapshot.forEach(doc => {
        inactiveBots.push(doc.data() as BotControl);
      });

      return inactiveBots;
    } catch (error) {
      logger.error('Error getting inactive bots:', error);
      throw new Error('Failed to get inactive bots');
    }
  }

  /**
   * Delete bot control
   */
  async deleteBotControl(botControlId: string): Promise<void> {
    try {
      await db.collection(this.botControlsCollection).doc(botControlId).delete();
      logger.info(`Bot control deleted: ${botControlId}`);
    } catch (error) {
      logger.error('Error deleting bot control:', error);
      throw new Error('Failed to delete bot control');
    }
  }

  /**
   * Clean up old bot controls
   */
  async cleanupOldBotControls(days: number = 30): Promise<number> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setDate(cutoffTime.getDate() - days);

      const snapshot = await db.collection(this.botControlsCollection)
        .where('updatedAt', '<', cutoffTime)
        .where('status', '==', BotStatus.STOPPED)
        .get();

      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      logger.info(`Cleaned up ${snapshot.size} old bot controls`);
      return snapshot.size;
    } catch (error) {
      logger.error('Error cleaning up old bot controls:', error);
      throw new Error('Failed to cleanup old bot controls');
    }
  }
} 