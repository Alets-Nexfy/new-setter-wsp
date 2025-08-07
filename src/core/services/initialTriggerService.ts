import { db } from '../config/firebase';
import { InitialTrigger, TriggerType, CreateInitialTriggerDto, UpdateInitialTriggerDto } from '../types/initialTrigger';
import { logger } from '../utils/logger';

export class InitialTriggerService {
  private readonly initialTriggersCollection = 'initialTriggers';

  /**
   * Create a new initial trigger
   */
  async createInitialTrigger(data: CreateInitialTriggerDto): Promise<InitialTrigger> {
    try {
      const initialTrigger: InitialTrigger = {
        id: '',
        userId: data.userId,
        name: data.name,
        type: data.type,
        platform: data.platform,
        conditions: data.conditions || [],
        actions: data.actions || [],
        message: data.message,
        isActive: data.isActive ?? true,
        priority: data.priority || 'normal',
        delay: data.delay || 0,
        maxExecutions: data.maxExecutions || 1,
        executionCount: 0,
        lastExecuted: null,
        metadata: data.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await db.collection(this.initialTriggersCollection).add(initialTrigger);
      initialTrigger.id = docRef.id;

      await docRef.update({ id: docRef.id });

      logger.info(`Initial trigger created: ${docRef.id} for user: ${data.userId}`);
      return initialTrigger;
    } catch (error) {
      logger.error('Error creating initial trigger:', error);
      throw new Error('Failed to create initial trigger');
    }
  }

  /**
   * Get initial trigger by ID
   */
  async getInitialTrigger(triggerId: string): Promise<InitialTrigger | null> {
    try {
      const doc = await db.collection(this.initialTriggersCollection).doc(triggerId).get();
      
      if (!doc.exists) {
        return null;
      }

      return doc.data() as InitialTrigger;
    } catch (error) {
      logger.error('Error getting initial trigger:', error);
      throw new Error('Failed to get initial trigger');
    }
  }

  /**
   * Get user's initial triggers
   */
  async getUserInitialTriggers(userId: string, options: {
    type?: TriggerType;
    platform?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ triggers: InitialTrigger[]; total: number }> {
    try {
      let query = db.collection(this.initialTriggersCollection)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc');

      if (options.isActive !== undefined) {
        query = query.where('isActive', '==', options.isActive);
      }

      if (options.type) {
        query = query.where('type', '==', options.type);
      }

      if (options.platform) {
        query = query.where('platform', '==', options.platform);
      }

      const snapshot = await query.get();
      const triggers: InitialTrigger[] = [];

      snapshot.forEach(doc => {
        triggers.push(doc.data() as InitialTrigger);
      });

      // Apply pagination
      const total = triggers.length;
      const start = options.offset || 0;
      const end = start + (options.limit || 50);
      const paginatedTriggers = triggers.slice(start, end);

      return {
        triggers: paginatedTriggers,
        total
      };
    } catch (error) {
      logger.error('Error getting user initial triggers:', error);
      throw new Error('Failed to get user initial triggers');
    }
  }

  /**
   * Update initial trigger
   */
  async updateInitialTrigger(triggerId: string, data: UpdateInitialTriggerDto): Promise<InitialTrigger> {
    try {
      const updateData: Partial<InitialTrigger> = {
        ...data,
        updatedAt: new Date()
      };

      await db.collection(this.initialTriggersCollection).doc(triggerId).update(updateData);

      const updated = await db.collection(this.initialTriggersCollection).doc(triggerId).get();
      return updated.data() as InitialTrigger;
    } catch (error) {
      logger.error('Error updating initial trigger:', error);
      throw new Error('Failed to update initial trigger');
    }
  }

  /**
   * Delete initial trigger
   */
  async deleteInitialTrigger(triggerId: string): Promise<void> {
    try {
      await db.collection(this.initialTriggersCollection).doc(triggerId).delete();
      logger.info(`Initial trigger deleted: ${triggerId}`);
    } catch (error) {
      logger.error('Error deleting initial trigger:', error);
      throw new Error('Failed to delete initial trigger');
    }
  }

  /**
   * Toggle initial trigger active status
   */
  async toggleInitialTrigger(triggerId: string): Promise<InitialTrigger> {
    try {
      const trigger = await this.getInitialTrigger(triggerId);
      
      if (!trigger) {
        throw new Error('Initial trigger not found');
      }

      return await this.updateInitialTrigger(triggerId, {
        isActive: !trigger.isActive
      });
    } catch (error) {
      logger.error('Error toggling initial trigger:', error);
      throw new Error('Failed to toggle initial trigger');
    }
  }

  /**
   * Execute initial trigger
   */
  async executeInitialTrigger(triggerId: string, context: {
    contactId: string;
    platform: string;
    message?: string;
    metadata?: Record<string, any>;
  }): Promise<boolean> {
    try {
      const trigger = await this.getInitialTrigger(triggerId);
      
      if (!trigger) {
        throw new Error('Initial trigger not found');
      }

      if (!trigger.isActive) {
        logger.info(`Initial trigger ${triggerId} is not active`);
        return false;
      }

      if (trigger.maxExecutions > 0 && trigger.executionCount >= trigger.maxExecutions) {
        logger.info(`Initial trigger ${triggerId} has reached maximum executions`);
        return false;
      }

      // Check conditions
      const conditionsMet = await this.checkConditions(trigger.conditions, context);
      if (!conditionsMet) {
        logger.info(`Initial trigger ${triggerId} conditions not met`);
        return false;
      }

      // Execute actions
      await this.executeActions(trigger.actions, context);

      // Update execution count
      // Update execution count directly (executionCount not in DTO)
      await db.collection('initialTriggers').doc(triggerId).update({
        executionCount: trigger.executionCount + 1,
        lastExecuted: new Date(),
        updatedAt: new Date()
      });

      logger.info(`Initial trigger ${triggerId} executed successfully`);
      return true;
    } catch (error) {
      logger.error('Error executing initial trigger:', error);
      throw new Error('Failed to execute initial trigger');
    }
  }

  /**
   * Check trigger conditions
   */
  private async checkConditions(conditions: any[], context: any): Promise<boolean> {
    try {
      for (const condition of conditions) {
        switch (condition.type) {
          case 'contact_new':
            // Check if contact is new
            if (!context.isNewContact) {
              return false;
            }
            break;
          case 'platform_match':
            // Check if platform matches
            if (condition.platform !== context.platform) {
              return false;
            }
            break;
          case 'time_based':
            // Check time-based conditions
            const now = new Date();
            const hour = now.getHours();
            if (condition.startHour && hour < condition.startHour) {
              return false;
            }
            if (condition.endHour && hour > condition.endHour) {
              return false;
            }
            break;
          case 'message_contains':
            // Check if message contains specific text
            if (!context.message || !context.message.toLowerCase().includes(condition.text.toLowerCase())) {
              return false;
            }
            break;
          default:
            logger.warn(`Unknown condition type: ${condition.type}`);
        }
      }
      return true;
    } catch (error) {
      logger.error('Error checking conditions:', error);
      return false;
    }
  }

  /**
   * Execute trigger actions
   */
  private async executeActions(actions: any[], context: any): Promise<void> {
    try {
      for (const action of actions) {
        switch (action.type) {
          case 'send_message':
            // Send message to contact
            await this.sendMessage(context.contactId, action.message || context.message);
            break;
          case 'add_tag':
            // Add tag to contact
            await this.addTagToContact(context.contactId, action.tag);
            break;
          case 'update_contact':
            // Update contact information
            await this.updateContact(context.contactId, action.fields);
            break;
          case 'trigger_agent':
            // Trigger an AI agent
            await this.triggerAgent(context.contactId, action.agentId);
            break;
          case 'webhook':
            // Send webhook
            await this.sendWebhook(action.url, action.payload);
            break;
          default:
            logger.warn(`Unknown action type: ${action.type}`);
        }
      }
    } catch (error) {
      logger.error('Error executing actions:', error);
      throw error;
    }
  }

  /**
   * Send message to contact
   */
  private async sendMessage(contactId: string, message: string): Promise<void> {
    // Implementation would integrate with messaging platform
    logger.info(`Sending message to contact ${contactId}: ${message}`);
  }

  /**
   * Add tag to contact
   */
  private async addTagToContact(contactId: string, tag: string): Promise<void> {
    // Implementation would update contact in database
    logger.info(`Adding tag ${tag} to contact ${contactId}`);
  }

  /**
   * Update contact information
   */
  private async updateContact(contactId: string, fields: Record<string, any>): Promise<void> {
    // Implementation would update contact in database
    logger.info(`Updating contact ${contactId} with fields:`, fields);
  }

  /**
   * Trigger AI agent
   */
  private async triggerAgent(contactId: string, agentId: string): Promise<void> {
    // Implementation would trigger AI agent
    logger.info(`Triggering agent ${agentId} for contact ${contactId}`);
  }

  /**
   * Send webhook
   */
  private async sendWebhook(url: string, payload: any): Promise<void> {
    // Implementation would send HTTP request
    logger.info(`Sending webhook to ${url}:`, payload);
  }

  /**
   * Get initial trigger statistics
   */
  async getInitialTriggerStats(userId: string): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
    byPlatform: Record<string, number>;
    totalExecutions: number;
    mostExecuted: InitialTrigger[];
  }> {
    try {
      const snapshot = await db.collection(this.initialTriggersCollection)
        .where('userId', '==', userId)
        .get();

      const stats = {
        total: 0,
        active: 0,
        byType: {} as Record<string, number>,
        byPlatform: {} as Record<string, number>,
        totalExecutions: 0,
        mostExecuted: [] as InitialTrigger[]
      };

      const triggers: InitialTrigger[] = [];

      snapshot.forEach(doc => {
        const data = doc.data() as InitialTrigger;
        triggers.push(data);
        
        stats.total++;
        stats.totalExecutions += data.executionCount;

        if (data.isActive) {
          stats.active++;
        }

        stats.byType[data.type] = (stats.byType[data.type] || 0) + 1;
        stats.byPlatform[data.platform] = (stats.byPlatform[data.platform] || 0) + 1;
      });

      // Get most executed triggers
      stats.mostExecuted = triggers
        .sort((a, b) => b.executionCount - a.executionCount)
        .slice(0, 5);

      return stats;
    } catch (error) {
      logger.error('Error getting initial trigger stats:', error);
      throw new Error('Failed to get initial trigger stats');
    }
  }

  /**
   * Duplicate initial trigger
   */
  async duplicateInitialTrigger(triggerId: string, newName: string): Promise<InitialTrigger> {
    try {
      const original = await this.getInitialTrigger(triggerId);
      
      if (!original) {
        throw new Error('Initial trigger not found');
      }

      const duplicated: CreateInitialTriggerDto = {
        userId: original.userId,
        name: newName,
        type: original.type,
        platform: original.platform,
        conditions: [...original.conditions],
        actions: [...original.actions],
        message: original.message,
        isActive: false, // Start as inactive
        priority: original.priority,
        delay: original.delay,
        maxExecutions: original.maxExecutions,
        metadata: { ...original.metadata, duplicatedFrom: triggerId }
      };

      return await this.createInitialTrigger(duplicated);
    } catch (error) {
      logger.error('Error duplicating initial trigger:', error);
      throw new Error('Failed to duplicate initial trigger');
    }
  }
} 