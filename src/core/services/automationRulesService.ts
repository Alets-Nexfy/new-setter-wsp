import { DatabaseService } from './DatabaseService';
import { LoggerService } from './LoggerService';
import { CacheService } from './CacheService';
import { AutomationRule, CreateAutomationRuleRequest, UpdateAutomationRuleRequest } from '../models/AutomationRule';

export class AutomationRulesService {
  private db: DatabaseService;
  private logger: LoggerService;
  private cache: CacheService;

  constructor() {
    this.db = new DatabaseService();
    this.logger = new LoggerService();
    this.cache = new CacheService();
  }

  /**
   * Get all automation rules for a user
   */
  async getUserRules(userId: string): Promise<AutomationRule[]> {
    try {
      this.logger.info(`[AutomationRules] Getting rules for user: ${userId}`);

      // Check cache first
      const cacheKey = `rules:${userId}`;
      const cachedRules = await this.cache.get<AutomationRule[]>(cacheKey);
      if (cachedRules) {
        this.logger.info(`[AutomationRules] Returning cached rules for user: ${userId}`);
        return cachedRules;
      }

      // Get from database
      const rulesSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('rules')
        .get();

      const rules: AutomationRule[] = [];
      rulesSnapshot.forEach(doc => {
        rules.push({
          id: doc.id,
          ...doc.data()
        } as AutomationRule);
      });

      // Cache the result
      await this.cache.set(cacheKey, rules, 300); // 5 minutes

      this.logger.info(`[AutomationRules] Retrieved ${rules.length} rules for user: ${userId}`);
      return rules;
    } catch (error) {
      this.logger.error(`[AutomationRules] Error getting rules for user ${userId}:`, error);
      throw new Error(`Failed to get automation rules: ${error.message}`);
    }
  }

  /**
   * Create a new automation rule
   */
  async createRule(userId: string, ruleData: CreateAutomationRuleRequest): Promise<AutomationRule> {
    try {
      this.logger.info(`[AutomationRules] Creating rule for user: ${userId}`, ruleData);

      // Validate rule data
      this.validateRuleData(ruleData);

      // Check for duplicate rules
      const duplicateRule = await this.findDuplicateRule(userId, ruleData);
      if (duplicateRule) {
        throw new Error('A rule with this trigger already exists');
      }

      // Create rule document
      const ruleDoc = {
        ...ruleData,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      const docRef = await this.db
        .collection('users')
        .doc(userId)
        .collection('rules')
        .add(ruleDoc);

      const newRule: AutomationRule = {
        id: docRef.id,
        ...ruleDoc
      };

      // Clear cache
      await this.cache.delete(`rules:${userId}`);

      // Notify worker if needed
      await this.notifyWorker(userId, 'RELOAD_RULES');

      this.logger.info(`[AutomationRules] Created rule ${docRef.id} for user: ${userId}`);
      return newRule;
    } catch (error) {
      this.logger.error(`[AutomationRules] Error creating rule for user ${userId}:`, error);
      throw new Error(`Failed to create automation rule: ${error.message}`);
    }
  }

  /**
   * Update an existing automation rule
   */
  async updateRule(userId: string, ruleId: string, updates: UpdateAutomationRuleRequest): Promise<AutomationRule> {
    try {
      this.logger.info(`[AutomationRules] Updating rule ${ruleId} for user: ${userId}`, updates);

      // Check if rule exists
      const ruleRef = this.db
        .collection('users')
        .doc(userId)
        .collection('rules')
        .doc(ruleId);

      const ruleDoc = await ruleRef.get();
      if (!ruleDoc.exists) {
        throw new Error('Automation rule not found');
      }

      // Validate updates
      if (updates.trigger) {
        this.validateTrigger(updates.trigger);
      }

      // Check for duplicate rules (excluding current rule)
      if (updates.trigger) {
        const duplicateRule = await this.findDuplicateRule(userId, { trigger: updates.trigger }, ruleId);
        if (duplicateRule) {
          throw new Error('A rule with this trigger already exists');
        }
      }

      // Update rule
      const updateData = {
        ...updates,
        updatedAt: new Date()
      };

      await ruleRef.update(updateData);

      // Get updated rule
      const updatedDoc = await ruleRef.get();
      const updatedRule: AutomationRule = {
        id: updatedDoc.id,
        ...updatedDoc.data()
      } as AutomationRule;

      // Clear cache
      await this.cache.delete(`rules:${userId}`);

      // Notify worker if needed
      await this.notifyWorker(userId, 'RELOAD_RULES');

      this.logger.info(`[AutomationRules] Updated rule ${ruleId} for user: ${userId}`);
      return updatedRule;
    } catch (error) {
      this.logger.error(`[AutomationRules] Error updating rule ${ruleId} for user ${userId}:`, error);
      throw new Error(`Failed to update automation rule: ${error.message}`);
    }
  }

  /**
   * Delete an automation rule
   */
  async deleteRule(userId: string, ruleId: string): Promise<void> {
    try {
      this.logger.info(`[AutomationRules] Deleting rule ${ruleId} for user: ${userId}`);

      // Check if rule exists
      const ruleRef = this.db
        .collection('users')
        .doc(userId)
        .collection('rules')
        .doc(ruleId);

      const ruleDoc = await ruleRef.get();
      if (!ruleDoc.exists) {
        throw new Error('Automation rule not found');
      }

      // Delete rule
      await ruleRef.delete();

      // Clear cache
      await this.cache.delete(`rules:${userId}`);

      // Notify worker if needed
      await this.notifyWorker(userId, 'RELOAD_RULES');

      this.logger.info(`[AutomationRules] Deleted rule ${ruleId} for user: ${userId}`);
    } catch (error) {
      this.logger.error(`[AutomationRules] Error deleting rule ${ruleId} for user ${userId}:`, error);
      throw new Error(`Failed to delete automation rule: ${error.message}`);
    }
  }

  /**
   * Get a specific automation rule
   */
  async getRule(userId: string, ruleId: string): Promise<AutomationRule> {
    try {
      this.logger.info(`[AutomationRules] Getting rule ${ruleId} for user: ${userId}`);

      const ruleDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('rules')
        .doc(ruleId)
        .get();

      if (!ruleDoc.exists) {
        throw new Error('Automation rule not found');
      }

      const rule: AutomationRule = {
        id: ruleDoc.id,
        ...ruleDoc.data()
      } as AutomationRule;

      this.logger.info(`[AutomationRules] Retrieved rule ${ruleId} for user: ${userId}`);
      return rule;
    } catch (error) {
      this.logger.error(`[AutomationRules] Error getting rule ${ruleId} for user ${userId}:`, error);
      throw new Error(`Failed to get automation rule: ${error.message}`);
    }
  }

  /**
   * Toggle rule activation status
   */
  async toggleRuleStatus(userId: string, ruleId: string): Promise<AutomationRule> {
    try {
      this.logger.info(`[AutomationRules] Toggling status for rule ${ruleId} for user: ${userId}`);

      const ruleRef = this.db
        .collection('users')
        .doc(userId)
        .collection('rules')
        .doc(ruleId);

      const ruleDoc = await ruleRef.get();
      if (!ruleDoc.exists) {
        throw new Error('Automation rule not found');
      }

      const currentStatus = ruleDoc.data()?.isActive ?? true;
      const newStatus = !currentStatus;

      await ruleRef.update({
        isActive: newStatus,
        updatedAt: new Date()
      });

      // Get updated rule
      const updatedDoc = await ruleRef.get();
      const updatedRule: AutomationRule = {
        id: updatedDoc.id,
        ...updatedDoc.data()
      } as AutomationRule;

      // Clear cache
      await this.cache.delete(`rules:${userId}`);

      // Notify worker if needed
      await this.notifyWorker(userId, 'RELOAD_RULES');

      this.logger.info(`[AutomationRules] Toggled rule ${ruleId} status to ${newStatus} for user: ${userId}`);
      return updatedRule;
    } catch (error) {
      this.logger.error(`[AutomationRules] Error toggling rule ${ruleId} status for user ${userId}:`, error);
      throw new Error(`Failed to toggle automation rule status: ${error.message}`);
    }
  }

  /**
   * Get rules statistics for a user
   */
  async getRulesStatistics(userId: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    byType: Record<string, number>;
  }> {
    try {
      this.logger.info(`[AutomationRules] Getting statistics for user: ${userId}`);

      const rules = await this.getUserRules(userId);

      const statistics = {
        total: rules.length,
        active: rules.filter(rule => rule.isActive).length,
        inactive: rules.filter(rule => !rule.isActive).length,
        byType: {} as Record<string, number>
      };

      // Count by trigger type
      rules.forEach(rule => {
        const type = rule.trigger.type || 'unknown';
        statistics.byType[type] = (statistics.byType[type] || 0) + 1;
      });

      this.logger.info(`[AutomationRules] Retrieved statistics for user: ${userId}`, statistics);
      return statistics;
    } catch (error) {
      this.logger.error(`[AutomationRules] Error getting statistics for user ${userId}:`, error);
      throw new Error(`Failed to get automation rules statistics: ${error.message}`);
    }
  }

  /**
   * Validate rule data
   */
  private validateRuleData(ruleData: CreateAutomationRuleRequest): void {
    if (!ruleData.trigger || !ruleData.trigger.text || ruleData.trigger.text.trim() === '') {
      throw new Error('Trigger text is required');
    }

    if (!ruleData.response || !ruleData.response.text || ruleData.response.text.trim() === '') {
      throw new Error('Response text is required');
    }

    this.validateTrigger(ruleData.trigger);
  }

  /**
   * Validate trigger configuration
   */
  private validateTrigger(trigger: any): void {
    const validTypes = ['contains', 'exact', 'starts_with'];
    if (!validTypes.includes(trigger.type)) {
      throw new Error(`Invalid trigger type. Must be one of: ${validTypes.join(', ')}`);
    }

    if (trigger.text && trigger.text.length > 500) {
      throw new Error('Trigger text is too long (max 500 characters)');
    }
  }

  /**
   * Find duplicate rule
   */
  private async findDuplicateRule(
    userId: string, 
    ruleData: Partial<CreateAutomationRuleRequest>, 
    excludeRuleId?: string
  ): Promise<AutomationRule | null> {
    if (!ruleData.trigger?.text) return null;

    const rulesSnapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection('rules')
      .where('trigger.text', '==', ruleData.trigger.text)
      .where('trigger.type', '==', ruleData.trigger.type)
      .get();

    for (const doc of rulesSnapshot.docs) {
      if (excludeRuleId && doc.id === excludeRuleId) continue;
      return { id: doc.id, ...doc.data() } as AutomationRule;
    }

    return null;
  }

  /**
   * Notify worker about rule changes
   */
  private async notifyWorker(userId: string, messageType: string): Promise<void> {
    try {
      // This would typically send a message to the worker process
      // For now, we'll just log it
      this.logger.info(`[AutomationRules] Notifying worker for user ${userId}: ${messageType}`);
    } catch (error) {
      this.logger.error(`[AutomationRules] Error notifying worker for user ${userId}:`, error);
    }
  }

  /**
   * Health check for automation rules service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: string;
    timestamp: Date;
  }> {
    try {
      // Test database connection
      await this.db.collection('users').limit(1).get();

      return {
        status: 'healthy',
        details: 'Automation rules service is operational',
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('[AutomationRules] Health check failed:', error);
      return {
        status: 'unhealthy',
        details: `Service error: ${error.message}`,
        timestamp: new Date()
      };
    }
  }
} 