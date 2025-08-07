import { SupabaseService } from './SupabaseService';
import { BotStatus, BotControl, CreateBotControlDto, UpdateBotControlDto } from '../types/botControl';
import { LoggerService } from './LoggerService';
import { WorkerManagerService } from './WorkerManagerService';

export class BotControlService {
  private db: SupabaseService;
  private logger: LoggerService;
  private workerManager: WorkerManagerService;
  private readonly tableName = 'bot_controls';

  constructor() {
    this.db = SupabaseService.getInstance();
    this.logger = LoggerService.getInstance();
    this.workerManager = WorkerManagerService.getInstance();
  }

  /**
   * Create bot control for a user
   */
  async createBotControl(data: CreateBotControlDto): Promise<BotControl> {
    try {
      const botControlData = {
        user_id: data.userId,
        platform: data.platform,
        status: BotStatus.ACTIVE,
        is_paused: false,
        pause_reason: null,
        pause_start_time: null,
        pause_end_time: null,
        last_activity: new Date().toISOString(),
        settings: data.settings || {},
      };

      const { data: result, error } = await this.db
        .from(this.tableName)
        .insert(botControlData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      const botControl = this.mapFromDatabase(result);
      this.logger.info(`Bot control created: ${botControl.id} for user: ${data.userId}`);
      return botControl;
    } catch (error) {
      this.logger.error('Error creating bot control:', error);
      throw new Error('Failed to create bot control');
    }
  }

  /**
   * Get bot control for a user and platform
   */
  async getBotControl(userId: string, platform: string): Promise<BotControl | null> {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('platform', platform)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return null;
        }
        throw error;
      }

      return this.mapFromDatabase(data);
    } catch (error) {
      this.logger.error('Error getting bot control:', error);
      throw new Error('Failed to get bot control');
    }
  }

  /**
   * Get all bot controls for a user
   */
  async getUserBotControls(userId: string): Promise<BotControl[]> {
    try {
      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      return data.map(item => this.mapFromDatabase(item));
    } catch (error) {
      this.logger.error('Error getting user bot controls:', error);
      throw new Error('Failed to get user bot controls');
    }
  }

  /**
   * Update bot control
   */
  async updateBotControl(botControlId: string, data: UpdateBotControlDto): Promise<BotControl> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (data.status !== undefined) {
        updateData.status = data.status;
      }

      if (data.isPaused !== undefined) {
        updateData.is_paused = data.isPaused;
        if (data.isPaused) {
          updateData.pause_start_time = new Date().toISOString();
          updateData.pause_end_time = null;
        } else {
          updateData.pause_end_time = new Date().toISOString();
          updateData.pause_start_time = null;
          updateData.pause_reason = null;
        }
      }

      if (data.pauseReason !== undefined) {
        updateData.pause_reason = data.pauseReason;
      }

      if (data.settings !== undefined) {
        updateData.settings = data.settings;
      }

      const { data: result, error } = await this.db
        .from(this.tableName)
        .update(updateData)
        .eq('id', botControlId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return this.mapFromDatabase(result);
    } catch (error) {
      this.logger.error('Error updating bot control:', error);
      throw new Error('Failed to update bot control');
    }
  }

  /**
   * Pause bot - Now integrates with WhatsApp Connection Pool
   */
  async pauseBot(userId: string, platform: 'whatsapp' | 'instagram' | 'telegram' | 'facebook', reason?: string): Promise<void> {
    try {
      let botControl = await this.getBotControl(userId, platform);
      
      // Create bot control if it doesn't exist
      if (!botControl) {
        botControl = await this.createBotControl({ userId, platform });
      }

      // Update bot control status
      await this.updateBotControl(botControl.id, {
        isPaused: true,
        pauseReason: reason || 'Manual pause',
        status: BotStatus.PAUSED
      });

      // Actually pause the bot in the connection pool
      if (platform === 'whatsapp') {
        await this.workerManager.pauseUserBot(userId);
      }

      this.logger.info(`Bot paused for user: ${userId}, platform: ${platform}`);
    } catch (error) {
      this.logger.error('Error pausing bot:', error);
      throw new Error('Failed to pause bot');
    }
  }

  /**
   * Resume bot - Now integrates with WhatsApp Connection Pool
   */
  async resumeBot(userId: string, platform: 'whatsapp' | 'instagram' | 'telegram' | 'facebook'): Promise<void> {
    try {
      let botControl = await this.getBotControl(userId, platform);
      
      // Create bot control if it doesn't exist
      if (!botControl) {
        botControl = await this.createBotControl({ userId, platform });
      }

      // Update bot control status
      await this.updateBotControl(botControl.id, {
        isPaused: false,
        pauseReason: null,
        status: BotStatus.ACTIVE
      });

      // Actually resume the bot in the connection pool
      if (platform === 'whatsapp') {
        await this.workerManager.resumeUserBot(userId);
      }

      this.logger.info(`Bot resumed for user: ${userId}, platform: ${platform}`);
    } catch (error) {
      this.logger.error('Error resuming bot:', error);
      throw new Error('Failed to resume bot');
    }
  }

  /**
   * Stop bot - Now integrates with WhatsApp Connection Pool
   */
  async stopBot(userId: string, platform: 'whatsapp' | 'instagram' | 'telegram' | 'facebook'): Promise<void> {
    try {
      let botControl = await this.getBotControl(userId, platform);
      
      // Create bot control if it doesn't exist
      if (!botControl) {
        botControl = await this.createBotControl({ userId, platform });
      }

      // Update bot control status
      await this.updateBotControl(botControl.id, {
        isPaused: true,
        pauseReason: 'Bot stopped',
        status: BotStatus.STOPPED
      });

      // Actually stop the bot in the connection pool
      if (platform === 'whatsapp') {
        await this.workerManager.stopWorker(userId, 'whatsapp');
      }

      this.logger.info(`Bot stopped for user: ${userId}, platform: ${platform}`);
    } catch (error) {
      this.logger.error('Error stopping bot:', error);
      throw new Error('Failed to stop bot');
    }
  }

  /**
   * Update bot activity
   */
  async updateBotActivity(userId: string, platform: string): Promise<void> {
    try {
      const { error } = await this.db
        .from(this.tableName)
        .update({ last_activity: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('platform', platform);

      if (error && error.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is okay for activity updates
        throw error;
      }
    } catch (error) {
      this.logger.error('Error updating bot activity:', error);
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
      const { data, error } = await this.db
        .from(this.tableName)
        .select('status, platform');

      if (error) {
        throw error;
      }

      const stats = {
        active: 0,
        paused: 0,
        stopped: 0,
        total: 0,
        byPlatform: {} as Record<string, number>
      };

      data.forEach(row => {
        stats.total++;

        switch (row.status) {
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

        stats.byPlatform[row.platform] = (stats.byPlatform[row.platform] || 0) + 1;
      });

      return stats;
    } catch (error) {
      this.logger.error('Error getting all bot statuses:', error);
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

      const { data, error } = await this.db
        .from(this.tableName)
        .select('*')
        .lt('last_activity', cutoffTime.toISOString())
        .eq('status', BotStatus.ACTIVE);

      if (error) {
        throw error;
      }

      return data.map(item => this.mapFromDatabase(item));
    } catch (error) {
      this.logger.error('Error getting inactive bots:', error);
      throw new Error('Failed to get inactive bots');
    }
  }

  /**
   * Delete bot control
   */
  async deleteBotControl(botControlId: string): Promise<void> {
    try {
      const { error } = await this.db
        .from(this.tableName)
        .delete()
        .eq('id', botControlId);

      if (error) {
        throw error;
      }

      this.logger.info(`Bot control deleted: ${botControlId}`);
    } catch (error) {
      this.logger.error('Error deleting bot control:', error);
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

      const { data, error } = await this.db
        .from(this.tableName)
        .delete()
        .lt('updated_at', cutoffTime.toISOString())
        .eq('status', BotStatus.STOPPED)
        .select('id');

      if (error) {
        throw error;
      }

      const count = data?.length || 0;
      this.logger.info(`Cleaned up ${count} old bot controls`);
      return count;
    } catch (error) {
      this.logger.error('Error cleaning up old bot controls:', error);
      throw new Error('Failed to cleanup old bot controls');
    }
  }

  /**
   * Check if bot is paused for a user
   */
  async isBotPaused(userId: string, platform: string = 'whatsapp'): Promise<boolean> {
    try {
      const botControl = await this.getBotControl(userId, platform);
      return botControl?.isPaused || false;
    } catch (error) {
      this.logger.error('Error checking bot pause status:', error);
      return false;
    }
  }

  /**
   * Map database row to BotControl interface
   */
  private mapFromDatabase(data: any): BotControl {
    return {
      id: data.id,
      userId: data.user_id,
      platform: data.platform,
      status: data.status,
      isPaused: data.is_paused,
      pauseReason: data.pause_reason,
      pauseStartTime: data.pause_start_time ? new Date(data.pause_start_time) : null,
      pauseEndTime: data.pause_end_time ? new Date(data.pause_end_time) : null,
      lastActivity: new Date(data.last_activity),
      settings: data.settings || {},
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }
} 