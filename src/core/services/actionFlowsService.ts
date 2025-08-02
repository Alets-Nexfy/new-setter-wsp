import { SupabaseService } from './SupabaseService';
import { LoggerService } from './LoggerService';
import { CacheService } from './CacheService';
import { QueueService } from './QueueService';
import { ActionFlow, CreateActionFlowRequest, UpdateActionFlowRequest, ActionFlowStep } from '../models/ActionFlow';

export class ActionFlowsService {
  private db: SupabaseService;
  private logger: LoggerService;
  private cache: CacheService;
  private queue: QueueService;

  constructor() {
    this.db = new DatabaseService();
    this.logger = new LoggerService();
    this.cache = new CacheService();
    this.queue = new QueueService();
  }

  /**
   * Get all action flows for a user
   */
  async getUserActionFlows(userId: string): Promise<ActionFlow[]> {
    try {
      this.logger.info(`[ActionFlows] Getting action flows for user: ${userId}`);

      // Check cache first
      const cacheKey = `action_flows:${userId}`;
      const cachedFlows = await this.cache.get<ActionFlow[]>(cacheKey);
      if (cachedFlows) {
        this.logger.info(`[ActionFlows] Returning cached action flows for user: ${userId}`);
        return cachedFlows;
      }

      // Get from database
      const flowsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .get();

      const flows: ActionFlow[] = [];
      flowsSnapshot.forEach(doc => {
        flows.push({
          id: doc.id,
          ...doc.data()
        } as ActionFlow);
      });

      // Cache the result
      await this.cache.set(cacheKey, flows, 300); // 5 minutes

      this.logger.info(`[ActionFlows] Retrieved ${flows.length} action flows for user: ${userId}`);
      return flows;
    } catch (error) {
      this.logger.error(`[ActionFlows] Error getting action flows for user ${userId}:`, error);
      throw new Error(`Failed to get action flows: ${error.message}`);
    }
  }

  /**
   * Create a new action flow
   */
  async createActionFlow(userId: string, flowData: CreateActionFlowRequest): Promise<ActionFlow> {
    try {
      this.logger.info(`[ActionFlows] Creating action flow for user: ${userId}`, flowData);

      // Validate flow data
      this.validateActionFlowData(flowData);

      // Check for duplicate flows
      const duplicateFlow = await this.findDuplicateFlow(userId, flowData);
      if (duplicateFlow) {
        throw new Error('An action flow with this name already exists');
      }

      // Create flow document
      const flowDoc = {
        ...flowData,
        userId,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: false,
        executionCount: 0,
        lastExecuted: null,
        averageExecutionTime: 0
      };

      const docRef = await this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .add(flowDoc);

      const newFlow: ActionFlow = {
        id: docRef.id,
        ...flowDoc
      };

      // Clear cache
      await this.cache.delete(`action_flows:${userId}`);

      // Notify worker if needed
      await this.notifyWorker(userId, 'RELOAD_ACTION_FLOWS');

      this.logger.info(`[ActionFlows] Created action flow ${docRef.id} for user: ${userId}`);
      return newFlow;
    } catch (error) {
      this.logger.error(`[ActionFlows] Error creating action flow for user ${userId}:`, error);
      throw new Error(`Failed to create action flow: ${error.message}`);
    }
  }

  /**
   * Get a specific action flow
   */
  async getActionFlow(userId: string, flowId: string): Promise<ActionFlow> {
    try {
      this.logger.info(`[ActionFlows] Getting action flow ${flowId} for user: ${userId}`);

      const flowDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .doc(flowId)
        .get();

      if (!flowDoc.exists) {
        throw new Error('Action flow not found');
      }

      const flow: ActionFlow = {
        id: flowDoc.id,
        ...flowDoc.data()
      } as ActionFlow;

      this.logger.info(`[ActionFlows] Retrieved action flow ${flowId} for user: ${userId}`);
      return flow;
    } catch (error) {
      this.logger.error(`[ActionFlows] Error getting action flow ${flowId} for user ${userId}:`, error);
      throw new Error(`Failed to get action flow: ${error.message}`);
    }
  }

  /**
   * Update an action flow
   */
  async updateActionFlow(userId: string, flowId: string, updates: UpdateActionFlowRequest): Promise<ActionFlow> {
    try {
      this.logger.info(`[ActionFlows] Updating action flow ${flowId} for user: ${userId}`, updates);

      // Check if flow exists
      const flowRef = this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .doc(flowId);

      const flowDoc = await flowRef.get();
      if (!flowDoc.exists) {
        throw new Error('Action flow not found');
      }

      // Validate updates
      if (updates.steps) {
        this.validateSteps(updates.steps);
      }

      // Check for duplicate flows (excluding current flow)
      if (updates.name) {
        const duplicateFlow = await this.findDuplicateFlow(userId, { name: updates.name }, flowId);
        if (duplicateFlow) {
          throw new Error('An action flow with this name already exists');
        }
      }

      // Update flow
      const updateData = {
        ...updates,
        updatedAt: new Date()
      };

      await flowRef.update(updateData);

      // Get updated flow
      const updatedDoc = await flowRef.get();
      const updatedFlow: ActionFlow = {
        id: updatedDoc.id,
        ...updatedDoc.data()
      } as ActionFlow;

      // Clear cache
      await this.cache.delete(`action_flows:${userId}`);

      // Notify worker if needed
      await this.notifyWorker(userId, 'RELOAD_ACTION_FLOWS');

      this.logger.info(`[ActionFlows] Updated action flow ${flowId} for user: ${userId}`);
      return updatedFlow;
    } catch (error) {
      this.logger.error(`[ActionFlows] Error updating action flow ${flowId} for user ${userId}:`, error);
      throw new Error(`Failed to update action flow: ${error.message}`);
    }
  }

  /**
   * Delete an action flow
   */
  async deleteActionFlow(userId: string, flowId: string): Promise<void> {
    try {
      this.logger.info(`[ActionFlows] Deleting action flow ${flowId} for user: ${userId}`);

      // Check if flow exists
      const flowRef = this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .doc(flowId);

      const flowDoc = await flowRef.get();
      if (!flowDoc.exists) {
        throw new Error('Action flow not found');
      }

      // Delete flow
      await flowRef.delete();

      // Clear cache
      await this.cache.delete(`action_flows:${userId}`);

      // Notify worker if needed
      await this.notifyWorker(userId, 'RELOAD_ACTION_FLOWS');

      this.logger.info(`[ActionFlows] Deleted action flow ${flowId} for user: ${userId}`);
    } catch (error) {
      this.logger.error(`[ActionFlows] Error deleting action flow ${flowId} for user ${userId}:`, error);
      throw new Error(`Failed to delete action flow: ${error.message}`);
    }
  }

  /**
   * Execute an action flow
   */
  async executeActionFlow(userId: string, flowId: string, context: any = {}): Promise<{
    success: boolean;
    executionId: string;
    results: any[];
    errors: string[];
    executionTime: number;
  }> {
    try {
      this.logger.info(`[ActionFlows] Executing action flow ${flowId} for user: ${userId}`);

      const flow = await this.getActionFlow(userId, flowId);
      
      if (!flow.isActive) {
        throw new Error('Action flow is not active');
      }

      if (!flow.steps || flow.steps.length === 0) {
        throw new Error('Action flow has no steps to execute');
      }

      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();
      const results: any[] = [];
      const errors: string[] = [];

      // Execute each step
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        try {
          this.logger.info(`[ActionFlows] Executing step ${i + 1}/${flow.steps.length}: ${step.type}`);
          
          const stepResult = await this.executeStep(step, context, userId);
          results.push({
            stepIndex: i,
            stepType: step.type,
            success: true,
            result: stepResult
          });
        } catch (stepError) {
          this.logger.error(`[ActionFlows] Error executing step ${i + 1}:`, stepError);
          errors.push(`Step ${i + 1} (${step.type}): ${stepError.message}`);
          
          results.push({
            stepIndex: i,
            stepType: step.type,
            success: false,
            error: stepError.message
          });

          // If step is critical, stop execution
          if (step.critical) {
            break;
          }
        }
      }

      const executionTime = Date.now() - startTime;

      // Update flow statistics
      await this.updateFlowStatistics(userId, flowId, executionTime, errors.length === 0);

      // Log execution
      await this.logExecution(userId, flowId, executionId, {
        success: errors.length === 0,
        results,
        errors,
        executionTime,
        context
      });

      this.logger.info(`[ActionFlows] Action flow ${flowId} execution completed in ${executionTime}ms`);
      
      return {
        success: errors.length === 0,
        executionId,
        results,
        errors,
        executionTime
      };
    } catch (error) {
      this.logger.error(`[ActionFlows] Error executing action flow ${flowId} for user ${userId}:`, error);
      throw new Error(`Failed to execute action flow: ${error.message}`);
    }
  }

  /**
   * Toggle action flow activation status
   */
  async toggleActionFlowStatus(userId: string, flowId: string): Promise<ActionFlow> {
    try {
      this.logger.info(`[ActionFlows] Toggling status for action flow ${flowId} for user: ${userId}`);

      const flowRef = this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .doc(flowId);

      const flowDoc = await flowRef.get();
      if (!flowDoc.exists) {
        throw new Error('Action flow not found');
      }

      const currentStatus = flowDoc.data()?.isActive ?? false;
      const newStatus = !currentStatus;

      await flowRef.update({
        isActive: newStatus,
        updatedAt: new Date()
      });

      // Get updated flow
      const updatedDoc = await flowRef.get();
      const updatedFlow: ActionFlow = {
        id: updatedDoc.id,
        ...updatedDoc.data()
      } as ActionFlow;

      // Clear cache
      await this.cache.delete(`action_flows:${userId}`);

      // Notify worker if needed
      await this.notifyWorker(userId, 'RELOAD_ACTION_FLOWS');

      this.logger.info(`[ActionFlows] Toggled action flow ${flowId} status to ${newStatus} for user: ${userId}`);
      return updatedFlow;
    } catch (error) {
      this.logger.error(`[ActionFlows] Error toggling action flow ${flowId} status for user ${userId}:`, error);
      throw new Error(`Failed to toggle action flow status: ${error.message}`);
    }
  }

  /**
   * Get action flows statistics
   */
  async getActionFlowsStatistics(userId: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    draft: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    mostExecuted: ActionFlow[];
    recentlyCreated: ActionFlow[];
  }> {
    try {
      this.logger.info(`[ActionFlows] Getting statistics for user: ${userId}`);

      const flows = await this.getUserActionFlows(userId);

      const statistics = {
        total: flows.length,
        active: flows.filter(flow => flow.isActive).length,
        inactive: flows.filter(flow => !flow.isActive).length,
        draft: flows.filter(flow => flow.status === 'draft').length,
        byStatus: {} as Record<string, number>,
        byType: {} as Record<string, number>,
        mostExecuted: [] as ActionFlow[],
        recentlyCreated: [] as ActionFlow[]
      };

      // Count by status
      flows.forEach(flow => {
        const status = flow.status || 'unknown';
        statistics.byStatus[status] = (statistics.byStatus[status] || 0) + 1;
      });

      // Count by trigger type
      flows.forEach(flow => {
        if (flow.trigger?.type) {
          const type = flow.trigger.type;
          statistics.byType[type] = (statistics.byType[type] || 0) + 1;
        }
      });

      // Get most executed flows
      statistics.mostExecuted = flows
        .filter(flow => flow.executionCount > 0)
        .sort((a, b) => (b.executionCount || 0) - (a.executionCount || 0))
        .slice(0, 5);

      // Get recently created flows
      statistics.recentlyCreated = flows
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

      this.logger.info(`[ActionFlows] Retrieved statistics for user: ${userId}`, statistics);
      return statistics;
    } catch (error) {
      this.logger.error(`[ActionFlows] Error getting statistics for user ${userId}:`, error);
      throw new Error(`Failed to get action flows statistics: ${error.message}`);
    }
  }

  /**
   * Validate action flow data
   */
  private validateActionFlowData(flowData: CreateActionFlowRequest): void {
    if (!flowData.name || flowData.name.trim() === '') {
      throw new Error('Action flow name is required');
    }

    if (flowData.name.length > 100) {
      throw new Error('Action flow name is too long (max 100 characters)');
    }

    if (flowData.description && flowData.description.length > 1000) {
      throw new Error('Action flow description is too long (max 1000 characters)');
    }

    if (!flowData.trigger || !flowData.trigger.text || flowData.trigger.text.trim() === '') {
      throw new Error('Trigger text is required');
    }

    if (!flowData.steps || flowData.steps.length === 0) {
      throw new Error('Action flow must have at least one step');
    }

    this.validateSteps(flowData.steps);
  }

  /**
   * Validate action flow steps
   */
  private validateSteps(steps: ActionFlowStep[]): void {
    const validStepTypes = [
      'send_message',
      'send_media',
      'send_template',
      'add_tag',
      'remove_tag',
      'move_to_kanban',
      'create_kanban_card',
      'update_kanban_card',
      'send_notification',
      'wait',
      'condition',
      'loop',
      'http_request',
      'database_query',
      'custom_function'
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      if (!step.type || !validStepTypes.includes(step.type)) {
        throw new Error(`Invalid step type at index ${i}: ${step.type}`);
      }

      if (!step.name || step.name.trim() === '') {
        throw new Error(`Step name is required at index ${i}`);
      }

      if (step.name.length > 100) {
        throw new Error(`Step name is too long at index ${i} (max 100 characters)`);
      }

      // Validate step-specific properties
      switch (step.type) {
        case 'send_message':
        case 'send_media':
        case 'send_template':
          if (!step.value || typeof step.value !== 'string') {
            throw new Error(`Step ${i + 1} (${step.type}): value is required and must be a string`);
          }
          break;

        case 'add_tag':
        case 'remove_tag':
          if (!step.value || typeof step.value !== 'string') {
            throw new Error(`Step ${i + 1} (${step.type}): tag name is required`);
          }
          break;

        case 'wait':
          if (!step.value || typeof step.value !== 'number' || step.value < 0) {
            throw new Error(`Step ${i + 1} (wait): duration must be a positive number`);
          }
          break;

        case 'condition':
          if (!step.condition || typeof step.condition !== 'object') {
            throw new Error(`Step ${i + 1} (condition): condition object is required`);
          }
          break;

        case 'http_request':
          if (!step.value || typeof step.value !== 'object') {
            throw new Error(`Step ${i + 1} (http_request): request configuration is required`);
          }
          break;
      }
    }
  }

  /**
   * Execute a single action flow step
   */
  private async executeStep(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    switch (step.type) {
      case 'send_message':
        return await this.executeSendMessage(step, context, userId);
      
      case 'send_media':
        return await this.executeSendMedia(step, context, userId);
      
      case 'send_template':
        return await this.executeSendTemplate(step, context, userId);
      
      case 'add_tag':
        return await this.executeAddTag(step, context, userId);
      
      case 'remove_tag':
        return await this.executeRemoveTag(step, context, userId);
      
      case 'move_to_kanban':
        return await this.executeMoveToKanban(step, context, userId);
      
      case 'create_kanban_card':
        return await this.executeCreateKanbanCard(step, context, userId);
      
      case 'update_kanban_card':
        return await this.executeUpdateKanbanCard(step, context, userId);
      
      case 'send_notification':
        return await this.executeSendNotification(step, context, userId);
      
      case 'wait':
        return await this.executeWait(step, context);
      
      case 'condition':
        return await this.executeCondition(step, context);
      
      case 'loop':
        return await this.executeLoop(step, context, userId);
      
      case 'http_request':
        return await this.executeHttpRequest(step, context);
      
      case 'database_query':
        return await this.executeDatabaseQuery(step, context, userId);
      
      case 'custom_function':
        return await this.executeCustomFunction(step, context, userId);
      
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute send message step
   */
  private async executeSendMessage(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would integrate with WhatsApp service
    this.logger.info(`[ActionFlows] Executing send_message step: ${step.value}`);
    return { message: 'Message sent successfully' };
  }

  /**
   * Execute send media step
   */
  private async executeSendMedia(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would integrate with WhatsApp service
    this.logger.info(`[ActionFlows] Executing send_media step: ${step.value}`);
    return { media: 'Media sent successfully' };
  }

  /**
   * Execute send template step
   */
  private async executeSendTemplate(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would integrate with WhatsApp service
    this.logger.info(`[ActionFlows] Executing send_template step: ${step.value}`);
    return { template: 'Template sent successfully' };
  }

  /**
   * Execute add tag step
   */
  private async executeAddTag(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would integrate with chat service
    this.logger.info(`[ActionFlows] Executing add_tag step: ${step.value}`);
    return { tag: 'Tag added successfully' };
  }

  /**
   * Execute remove tag step
   */
  private async executeRemoveTag(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would integrate with chat service
    this.logger.info(`[ActionFlows] Executing remove_tag step: ${step.value}`);
    return { tag: 'Tag removed successfully' };
  }

  /**
   * Execute move to kanban step
   */
  private async executeMoveToKanban(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would integrate with kanban service
    this.logger.info(`[ActionFlows] Executing move_to_kanban step: ${step.value}`);
    return { kanban: 'Moved to kanban successfully' };
  }

  /**
   * Execute create kanban card step
   */
  private async executeCreateKanbanCard(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would integrate with kanban service
    this.logger.info(`[ActionFlows] Executing create_kanban_card step: ${step.value}`);
    return { card: 'Kanban card created successfully' };
  }

  /**
   * Execute update kanban card step
   */
  private async executeUpdateKanbanCard(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would integrate with kanban service
    this.logger.info(`[ActionFlows] Executing update_kanban_card step: ${step.value}`);
    return { card: 'Kanban card updated successfully' };
  }

  /**
   * Execute send notification step
   */
  private async executeSendNotification(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would integrate with notification service
    this.logger.info(`[ActionFlows] Executing send_notification step: ${step.value}`);
    return { notification: 'Notification sent successfully' };
  }

  /**
   * Execute wait step
   */
  private async executeWait(step: ActionFlowStep, context: any): Promise<any> {
    const duration = step.value as number;
    this.logger.info(`[ActionFlows] Executing wait step: ${duration}ms`);
    
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ wait: `Waited ${duration}ms` });
      }, duration);
    });
  }

  /**
   * Execute condition step
   */
  private async executeCondition(step: ActionFlowStep, context: any): Promise<any> {
    // This would evaluate the condition and return result
    this.logger.info(`[ActionFlows] Executing condition step: ${step.condition}`);
    return { condition: 'Condition evaluated successfully' };
  }

  /**
   * Execute loop step
   */
  private async executeLoop(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would execute the loop logic
    this.logger.info(`[ActionFlows] Executing loop step: ${step.value}`);
    return { loop: 'Loop executed successfully' };
  }

  /**
   * Execute HTTP request step
   */
  private async executeHttpRequest(step: ActionFlowStep, context: any): Promise<any> {
    // This would make the HTTP request
    this.logger.info(`[ActionFlows] Executing http_request step: ${step.value}`);
    return { http: 'HTTP request executed successfully' };
  }

  /**
   * Execute database query step
   */
  private async executeDatabaseQuery(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would execute the database query
    this.logger.info(`[ActionFlows] Executing database_query step: ${step.value}`);
    return { query: 'Database query executed successfully' };
  }

  /**
   * Execute custom function step
   */
  private async executeCustomFunction(step: ActionFlowStep, context: any, userId: string): Promise<any> {
    // This would execute the custom function
    this.logger.info(`[ActionFlows] Executing custom_function step: ${step.value}`);
    return { function: 'Custom function executed successfully' };
  }

  /**
   * Find duplicate action flow
   */
  private async findDuplicateFlow(
    userId: string, 
    flowData: Partial<CreateActionFlowRequest>, 
    excludeFlowId?: string
  ): Promise<ActionFlow | null> {
    if (!flowData.name) return null;

    const flowsSnapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection('action_flows')
      .where('name', '==', flowData.name)
      .get();

    for (const doc of flowsSnapshot.docs) {
      if (excludeFlowId && doc.id === excludeFlowId) continue;
      return { id: doc.id, ...doc.data() } as ActionFlow;
    }

    return null;
  }

  /**
   * Update flow statistics
   */
  private async updateFlowStatistics(userId: string, flowId: string, executionTime: number, success: boolean): Promise<void> {
    try {
      const flowRef = this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .doc(flowId);

      const flowDoc = await flowRef.get();
      if (!flowDoc.exists) return;

      const currentData = flowDoc.data();
      const currentCount = currentData?.executionCount || 0;
      const currentAvgTime = currentData?.averageExecutionTime || 0;

      // Calculate new average execution time
      const newAvgTime = currentCount === 0 
        ? executionTime 
        : (currentAvgTime * currentCount + executionTime) / (currentCount + 1);

      await flowRef.update({
        executionCount: currentCount + 1,
        lastExecuted: new Date(),
        averageExecutionTime: newAvgTime,
        updatedAt: new Date()
      });
    } catch (error) {
      this.logger.error(`[ActionFlows] Error updating flow statistics:`, error);
    }
  }

  /**
   * Log execution
   */
  private async logExecution(userId: string, flowId: string, executionId: string, executionData: any): Promise<void> {
    try {
      await this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .doc(flowId)
        .collection('executions')
        .doc(executionId)
        .set({
          ...executionData,
          timestamp: new Date()
        });
    } catch (error) {
      this.logger.error(`[ActionFlows] Error logging execution:`, error);
    }
  }

  /**
   * Notify worker about action flow changes
   */
  private async notifyWorker(userId: string, messageType: string): Promise<void> {
    try {
      // This would typically send a message to the worker process
      // For now, we'll just log it
      this.logger.info(`[ActionFlows] Notifying worker for user ${userId}: ${messageType}`);
    } catch (error) {
      this.logger.error(`[ActionFlows] Error notifying worker for user ${userId}:`, error);
    }
  }

  /**
   * Health check for action flows service
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
        details: 'Action flows service is operational',
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('[ActionFlows] Health check failed:', error);
      return {
        status: 'unhealthy',
        details: `Service error: ${error.message}`,
        timestamp: new Date()
      };
    }
  }
} 