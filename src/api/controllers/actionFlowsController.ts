import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { WorkerManagerService } from '@/core/services/WorkerManagerService';
import { AIService } from '@/core/services/AIService';
import { v4 as uuidv4 } from 'uuid';

export interface ActionFlowStep {
  type: 'send_message' | 'run_gemini' | 'delay' | 'set_variable' | 'conditional' | 'end_flow';
  message?: string;
  prompt?: string;
  outputVariable?: string;
  useConversationHistory?: boolean;
  delayMs?: number;
  variableName?: string;
  variableValue?: string;
  condition?: string;
  trueSteps?: ActionFlowStep[];
  falseSteps?: ActionFlowStep[];
}

export interface ActionFlow {
  id: string;
  userId: string;
  name: string;
  description?: string;
  trigger: 'exact_message' | 'message' | 'image_received' | 'video_received' | 'any_media';
  triggerValue?: string;
  steps: ActionFlowStep[];
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowExecutionContext {
  flowId: string;
  userId: string;
  chatId: string;
  message: any;
  variables: Record<string, any>;
  flow: ActionFlow;
  currentStep: number;
  executionId: string;
}

export interface FlowExecutionResult {
  success: boolean;
  executionId: string;
  stepsExecuted: number;
  error?: string;
  variables?: Record<string, any>;
}

export class ActionFlowsController {
  private logger: LoggerService;
  private db: SupabaseService;
  private workerManager: WorkerManagerService;
  private aiService: AIService;

  // Active executions tracking
  private activeExecutions: Map<string, FlowExecutionContext> = new Map();

  constructor() {
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.workerManager = WorkerManagerService.getInstance();
    this.aiService = AIService.getInstance();
  }

  /**
   * GET /api/v2/users/:userId/action-flows
   * Get all action flows for a user (route-compatible method name)
   */
  public async getUserActionFlows(req: Request, res: Response): Promise<void> {
    return this.getActionFlows(req, res);
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 1691-1742
   * GET /api/v2/action-flows/:userId
   * Get all action flows for a user
   */
  public async getActionFlows(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { 
        limit = 50, 
        offset = 0, 
        isActive,
        trigger 
      } = req.query;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
        return;
      }

      this.logger.debug('Get action flows request', { 
        userId, 
        limit: Number(limit), 
        offset: Number(offset) 
      });

      // Verify user exists
      const { data: userData, error: userError } = await this.db.getClient()
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();
        
      if (userError || !userData) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Build query
      let query = this.db.getClient()
        .from('action_flows')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (isActive !== undefined) {
        query = query.eq('is_active', isActive === 'true');
      }

      if (trigger) {
        query = query.eq('trigger', trigger);
      }

      // Apply pagination
      if (offset && Number(offset) > 0) {
        query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
      } else {
        query = query.limit(Number(limit));
      }

      // Execute query
      const { data: flowsData, error: flowsError } = await query;
      
      if (flowsError) {
        throw new Error(`Failed to fetch flows: ${flowsError.message}`);
      }

      const flows: ActionFlow[] = (flowsData || []).map(data => ({
        id: data.id,
        userId,
        name: data.name || '',
        description: data.description || '',
        trigger: data.trigger || 'exact_message',
        triggerValue: data.trigger_value || '',
        steps: data.steps || [],
        isActive: data.is_active || false,
        priority: data.priority || 0,
        createdAt: data.created_at || new Date().toISOString(),
        updatedAt: data.updated_at || new Date().toISOString()
      }));

      res.json({
        success: true,
        data: flows,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: flows.length,
          hasMore: flows.length === Number(limit)
        }
      });

    } catch (error) {
      this.logger.error('Error getting action flows', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get action flows'
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 1746-1828
   * POST /api/v2/action-flows/:userId
   * Create new action flow
   */
  public async createActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const flowData = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
        return;
      }

      this.logger.info('Create action flow request', { 
        userId, 
        flowName: flowData.name 
      });

      // Validate required fields
      if (!flowData.name || !flowData.name.trim()) {
        res.status(400).json({
          success: false,
          error: 'Flow name is required'
        });
        return;
      }

      if (!flowData.trigger) {
        res.status(400).json({
          success: false,
          error: 'Flow trigger is required'
        });
        return;
      }

      if (!Array.isArray(flowData.steps)) {
        res.status(400).json({
          success: false,
          error: 'Flow steps must be an array'
        });
        return;
      }

      // Verify user exists
      const { data: userData, error: userError } = await this.db.getClient()
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();
        
      if (userError || !userData) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Validate flow steps
      const validation = this.validateFlowSteps(flowData.steps);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: `Invalid flow steps: ${validation.errors.join(', ')}`
        });
        return;
      }

      const flowId = uuidv4();
      const timestamp = new Date().toISOString();

      const newFlow: Omit<ActionFlow, 'createdAt' | 'updatedAt'> = {
        id: flowId,
        userId,
        name: flowData.name.trim(),
        description: flowData.description || '',
        trigger: flowData.trigger,
        triggerValue: flowData.triggerValue || '',
        steps: flowData.steps,
        isActive: flowData.isActive !== false, // Default to true
        priority: flowData.priority || 0
      };

      // Save to Supabase
      const { error: insertError } = await this.db.getClient()
        .from('action_flows')
        .insert({
          id: flowId,
          user_id: userId,
          name: newFlow.name,
          description: newFlow.description,
          trigger: newFlow.trigger,
          trigger_value: newFlow.triggerValue,
          steps: newFlow.steps,
          is_active: newFlow.isActive,
          priority: newFlow.priority,
          created_at: timestamp,
          updated_at: timestamp
        });
        
      if (insertError) {
        throw new Error(`Failed to create flow: ${insertError.message}`);
      }

      // Notify worker to reload flows
      this.notifyWorkerFlowChange(userId);

      const createdFlow: ActionFlow = {
        ...newFlow,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.logger.info('Action flow created successfully', {
        userId,
        flowId,
        flowName: flowData.name
      });

      res.status(201).json({
        success: true,
        message: 'Action flow created successfully',
        data: createdFlow
      });

    } catch (error) {
      this.logger.error('Error creating action flow', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create action flow'
      });
    }
  }

  /**
   * GET /api/v2/action-flows/:userId/:flowId
   * Get specific action flow
   */
  public async getActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;

      if (!userId || !flowId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Flow ID are required'
        });
        return;
      }

      this.logger.debug('Get action flow request', { userId, flowId });

      const { data: flowData, error: flowError } = await this.db.getClient()
        .from('action_flows')
        .select('*')
        .eq('id', flowId)
        .eq('user_id', userId)
        .single();

      if (flowError || !flowData) {
        res.status(404).json({
          success: false,
          error: 'Action flow not found'
        });
        return;
      }

      const flow: ActionFlow = {
        id: flowData.id,
        userId,
        name: flowData.name || '',
        description: flowData.description || '',
        trigger: flowData.trigger || 'exact_message',
        triggerValue: flowData.trigger_value || '',
        steps: flowData.steps || [],
        isActive: flowData.is_active || false,
        priority: flowData.priority || 0,
        createdAt: flowData.created_at || new Date().toISOString(),
        updatedAt: flowData.updated_at || new Date().toISOString()
      };

      res.json({
        success: true,
        data: flow
      });

    } catch (error) {
      this.logger.error('Error getting action flow', {
        userId: req.params.userId,
        flowId: req.params.flowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

        res.status(500).json({
          success: false,
        error: 'Failed to get action flow'
        });
    }
  }

  /**
   * PUT /api/v2/action-flows/:userId/:flowId
   * Update action flow
   */
  public async updateActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      const updateData = req.body;

      if (!userId || !flowId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Flow ID are required'
        });
        return;
      }

      this.logger.info('Update action flow request', { userId, flowId });

      // Check if flow exists
      const { data: existingFlow, error: checkError } = await this.db.getClient()
        .from('action_flows')
        .select('*')
        .eq('id', flowId)
        .eq('user_id', userId)
        .single();
        
      if (checkError || !existingFlow) {
        res.status(404).json({
          success: false,
          error: 'Action flow not found'
        });
        return;
      }

      // Validate steps if provided
      if (updateData.steps && Array.isArray(updateData.steps)) {
        const validation = this.validateFlowSteps(updateData.steps);
        if (!validation.valid) {
          res.status(400).json({
            success: false,
            error: `Invalid flow steps: ${validation.errors.join(', ')}`
          });
          return;
        }
      }

      // Prepare update data
      const fieldsToUpdate: any = {
        updated_at: new Date().toISOString()
      };

      if (updateData.name !== undefined) fieldsToUpdate.name = updateData.name.trim();
      if (updateData.description !== undefined) fieldsToUpdate.description = updateData.description;
      if (updateData.trigger !== undefined) fieldsToUpdate.trigger = updateData.trigger;
      if (updateData.triggerValue !== undefined) fieldsToUpdate.trigger_value = updateData.triggerValue;
      if (updateData.steps !== undefined) fieldsToUpdate.steps = updateData.steps;
      if (updateData.isActive !== undefined) fieldsToUpdate.is_active = updateData.isActive;
      if (updateData.priority !== undefined) fieldsToUpdate.priority = updateData.priority;

      // Update flow
      const { data: updatedData, error: updateError } = await this.db.getClient()
        .from('action_flows')
        .update(fieldsToUpdate)
        .eq('id', flowId)
        .eq('user_id', userId)
        .select('*')
        .single();
        
      if (updateError || !updatedData) {
        throw new Error(`Failed to update flow: ${updateError?.message || 'Unknown error'}`);
      }

      // Notify worker to reload flows
      this.notifyWorkerFlowChange(userId);

      const updatedFlow: ActionFlow = {
        id: updatedData.id,
        userId,
        name: updatedData.name || '',
        description: updatedData.description || '',
        trigger: updatedData.trigger || 'exact_message',
        triggerValue: updatedData.trigger_value || '',
        steps: updatedData.steps || [],
        isActive: updatedData.is_active || false,
        priority: updatedData.priority || 0,
        createdAt: updatedData.created_at || new Date().toISOString(),
        updatedAt: updatedData.updated_at || new Date().toISOString()
      };

      this.logger.info('Action flow updated successfully', { userId, flowId });

      res.json({
        success: true,
        message: 'Action flow updated successfully',
        data: updatedFlow
      });

    } catch (error) {
      this.logger.error('Error updating action flow', {
        userId: req.params.userId,
        flowId: req.params.flowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update action flow'
      });
    }
  }

  /**
   * DELETE /api/v2/action-flows/:userId/:flowId
   * Delete action flow
   */
  public async deleteActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;

      if (!userId || !flowId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Flow ID are required'
        });
        return;
      }

      this.logger.info('Delete action flow request', { userId, flowId });

      // Check if flow exists and delete
      const { data: deletedFlow, error: deleteError } = await this.db.getClient()
        .from('action_flows')
        .delete()
        .eq('id', flowId)
        .eq('user_id', userId)
        .select('*')
        .single();
        
      if (deleteError || !deletedFlow) {
        res.status(404).json({
          success: false,
          error: 'Action flow not found'
        });
        return;
      }

      // Notify worker to reload flows
      this.notifyWorkerFlowChange(userId);

      this.logger.info('Action flow deleted successfully', { userId, flowId });

      res.json({
        success: true,
        message: 'Action flow deleted successfully'
      });

    } catch (error) {
      this.logger.error('Error deleting action flow', {
        userId: req.params.userId,
        flowId: req.params.flowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

        res.status(500).json({
          success: false,
        error: 'Failed to delete action flow'
        });
    }
  }

  /**
   * POST /api/v2/action-flows/:userId/:flowId/execute
   * Manual flow execution
   */
  public async executeFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      const { chatId, message, variables = {} } = req.body;

      if (!userId || !flowId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Flow ID are required'
        });
        return;
      }

      if (!chatId) {
        res.status(400).json({
          success: false,
          error: 'Chat ID is required for flow execution'
        });
        return;
      }

      this.logger.info('Manual flow execution request', { userId, flowId, chatId });

      // Get flow
      const { data: flowData, error: flowError } = await this.db.getClient()
        .from('action_flows')
        .select('*')
        .eq('id', flowId)
        .eq('user_id', userId)
        .single();

      if (flowError || !flowData) {
        res.status(404).json({
          success: false,
          error: 'Action flow not found'
        });
        return;
      }

      const flow: ActionFlow = {
        id: flowData.id,
        userId,
        name: flowData.name || '',
        description: flowData.description || '',
        trigger: flowData.trigger || 'exact_message',
        triggerValue: flowData.trigger_value || '',
        steps: flowData.steps || [],
        isActive: flowData.is_active || false,
        priority: flowData.priority || 0,
        createdAt: flowData.created_at || new Date().toISOString(),
        updatedAt: flowData.updated_at || new Date().toISOString()
      };

      // Execute flow
      const result = await this.executeActionFlow(userId, chatId, flow, message || {}, variables);

      res.json({
        success: true,
        message: 'Flow executed successfully',
        data: result
      });

    } catch (error) {
      this.logger.error('Error executing flow manually', {
        userId: req.params.userId,
        flowId: req.params.flowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

        res.status(500).json({
          success: false,
        error: 'Failed to execute flow'
        });
    }
  }

  /**
   * GET /api/v2/users/:userId/action-flows/statistics
   * Get action flows statistics (route-compatible method name)
   */
  public async getActionFlowsStatistics(req: Request, res: Response): Promise<void> {
    return this.getFlowStatistics(req, res);
  }

  /**
   * GET /api/v2/action-flows/:userId/statistics
   * Get flow execution statistics
   */
  public async getFlowStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
        return;
      }

      this.logger.debug('Get flow statistics request', { userId });

      // Get flow counts
      const [totalFlowsResult, activeFlowsResult, flowsResult] = await Promise.all([
        this.db.getClient().from('action_flows').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        this.db.getClient().from('action_flows').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
        this.db.getClient().from('action_flows').select('*').eq('user_id', userId)
      ]);

      const triggerCounts: Record<string, number> = {};
      const stepTypeCounts: Record<string, number> = {};

      if (flowsResult.data) {
        flowsResult.data.forEach(data => {
          const trigger = data.trigger || 'unknown';
          triggerCounts[trigger] = (triggerCounts[trigger] || 0) + 1;

          // Count step types
          if (Array.isArray(data.steps)) {
            data.steps.forEach((step: ActionFlowStep) => {
              const stepType = step.type || 'unknown';
              stepTypeCounts[stepType] = (stepTypeCounts[stepType] || 0) + 1;
            });
          }
        });
      }

      const totalFlows = totalFlowsResult.count || 0;
      const activeFlows = activeFlowsResult.count || 0;

      const statistics = {
        totalFlows,
        activeFlows,
        inactiveFlows: totalFlows - activeFlows,
        triggerCounts,
        stepTypeCounts,
        activeExecutions: this.getActiveExecutionsForUser(userId).length
      };

      res.json({
        success: true,
        data: statistics
      });

    } catch (error) {
      this.logger.error('Error getting flow statistics', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get flow statistics'
      });
    }
  }

  /**
   * PATCH /api/v2/users/:userId/action-flows/:flowId/toggle
   * Toggle action flow activation status
   */
  public async toggleActionFlowStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;

      if (!userId || !flowId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Flow ID are required'
        });
        return;
      }

      this.logger.info('Toggle action flow status request', { userId, flowId });

      // Get current flow status
      const { data: currentFlow, error: getError } = await this.db.getClient()
        .from('action_flows')
        .select('is_active')
        .eq('id', flowId)
        .eq('user_id', userId)
        .single();

      if (getError || !currentFlow) {
        res.status(404).json({
          success: false,
          error: 'Action flow not found'
        });
        return;
      }

      // Toggle the status
      const newStatus = !currentFlow.is_active;

      const { data: updatedFlow, error: updateError } = await this.db.getClient()
        .from('action_flows')
        .update({ 
          is_active: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', flowId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (updateError || !updatedFlow) {
        throw new Error(`Failed to toggle flow status: ${updateError?.message || 'Unknown error'}`);
      }

      // Notify worker to reload flows
      this.notifyWorkerFlowChange(userId);

      res.json({
        success: true,
        message: `Action flow ${newStatus ? 'activated' : 'deactivated'} successfully`,
        data: {
          id: updatedFlow.id,
          isActive: updatedFlow.is_active
        }
      });

    } catch (error) {
      this.logger.error('Error toggling action flow status', {
        userId: req.params.userId,
        flowId: req.params.flowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to toggle action flow status'
      });
    }
  }

  /**
   * POST /api/v2/users/:userId/action-flows/bulk
   * Perform bulk operations on action flows
   */
  public async bulkOperations(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { operation, flowIds } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
        return;
      }

      if (!operation || !flowIds || !Array.isArray(flowIds)) {
        res.status(400).json({
          success: false,
          error: 'Operation and flowIds array are required'
        });
        return;
      }

      this.logger.info('Bulk operations request', { userId, operation, flowCount: flowIds.length });

      let results: any = {};

      switch (operation) {
        case 'activate':
          const { error: activateError } = await this.db.getClient()
            .from('action_flows')
            .update({ 
              is_active: true,
              updated_at: new Date().toISOString()
            })
            .in('id', flowIds)
            .eq('user_id', userId);

          if (activateError) {
            throw new Error(`Failed to activate flows: ${activateError.message}`);
          }

          results = { activated: flowIds.length };
          break;

        case 'deactivate':
          const { error: deactivateError } = await this.db.getClient()
            .from('action_flows')
            .update({ 
              is_active: false,
              updated_at: new Date().toISOString()
            })
            .in('id', flowIds)
            .eq('user_id', userId);

          if (deactivateError) {
            throw new Error(`Failed to deactivate flows: ${deactivateError.message}`);
          }

          results = { deactivated: flowIds.length };
          break;

        case 'delete':
          const { error: deleteError } = await this.db.getClient()
            .from('action_flows')
            .delete()
            .in('id', flowIds)
            .eq('user_id', userId);

          if (deleteError) {
            throw new Error(`Failed to delete flows: ${deleteError.message}`);
          }

          results = { deleted: flowIds.length };
          break;

        default:
          res.status(400).json({
            success: false,
            error: 'Invalid operation. Supported operations: activate, deactivate, delete'
          });
          return;
      }

      // Notify worker to reload flows
      this.notifyWorkerFlowChange(userId);

      res.json({
        success: true,
        message: `Bulk ${operation} operation completed successfully`,
        data: results
      });

    } catch (error) {
      this.logger.error('Error in bulk operations', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform bulk operations'
      });
    }
  }

  /**
   * GET /api/v2/users/:userId/action-flows/:flowId/executions
   * Get action flow execution history
   */
  public async getActionFlowExecutions(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!userId || !flowId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Flow ID are required'
        });
        return;
      }

      this.logger.debug('Get action flow executions request', { userId, flowId });

      // For now, return mock execution data
      // In a real implementation, you'd fetch from a flow_executions table
      const executions = [
        {
          id: 'exec-1',
          flowId,
          executedAt: new Date().toISOString(),
          success: true,
          stepsExecuted: 3,
          duration: 1500,
          triggerMessage: 'Hello'
        },
        {
          id: 'exec-2',
          flowId,
          executedAt: new Date(Date.now() - 3600000).toISOString(),
          success: true,
          stepsExecuted: 2,
          duration: 800,
          triggerMessage: 'Hi there'
        }
      ];

      res.json({
        success: true,
        data: executions,
        pagination: {
          limit: Number(limit),
          offset: Number(offset),
          total: executions.length
        }
      });

    } catch (error) {
      this.logger.error('Error getting action flow executions', {
        userId: req.params.userId,
        flowId: req.params.flowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get action flow executions'
      });
    }
  }

  /**
   * POST /api/v2/users/:userId/action-flows/:flowId/duplicate
   * Duplicate an action flow
   */
  public async duplicateActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      const { name } = req.body;

      if (!userId || !flowId) {
        res.status(400).json({
          success: false,
          error: 'User ID and Flow ID are required'
        });
        return;
      }

      if (!name || !name.trim()) {
        res.status(400).json({
          success: false,
          error: 'Name for duplicated flow is required'
        });
        return;
      }

      this.logger.info('Duplicate action flow request', { userId, flowId, newName: name });

      // Get original flow
      const { data: originalFlow, error: getError } = await this.db.getClient()
        .from('action_flows')
        .select('*')
        .eq('id', flowId)
        .eq('user_id', userId)
        .single();

      if (getError || !originalFlow) {
        res.status(404).json({
          success: false,
          error: 'Original action flow not found'
        });
        return;
      }

      // Create duplicate
      const newFlowId = uuidv4();
      const timestamp = new Date().toISOString();

      const { error: insertError } = await this.db.getClient()
        .from('action_flows')
        .insert({
          id: newFlowId,
          user_id: userId,
          name: name.trim(),
          description: `Copy of ${originalFlow.name}`,
          trigger: originalFlow.trigger,
          trigger_value: originalFlow.trigger_value,
          steps: originalFlow.steps,
          is_active: false, // Duplicated flows start inactive
          priority: originalFlow.priority,
          created_at: timestamp,
          updated_at: timestamp
        });

      if (insertError) {
        throw new Error(`Failed to duplicate flow: ${insertError.message}`);
      }

      // Notify worker to reload flows
      this.notifyWorkerFlowChange(userId);

      const duplicatedFlow: ActionFlow = {
        id: newFlowId,
        userId,
        name: name.trim(),
        description: `Copy of ${originalFlow.name}`,
        trigger: originalFlow.trigger,
        triggerValue: originalFlow.trigger_value || '',
        steps: originalFlow.steps || [],
        isActive: false,
        priority: originalFlow.priority || 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      res.status(201).json({
        success: true,
        message: 'Action flow duplicated successfully',
        data: duplicatedFlow
      });

    } catch (error) {
      this.logger.error('Error duplicating action flow', {
        userId: req.params.userId,
        flowId: req.params.flowId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to duplicate action flow'
      });
    }
  }

  /**
   * GET /api/v2/users/:userId/action-flows/health
   * Health check for action flows service
   */
  public async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      this.logger.debug('Action flows health check request', { userId });

      // Check database connectivity
      const { error: dbError } = await this.db.getClient()
        .from('action_flows')
        .select('id')
        .limit(1);

      if (dbError) {
        throw new Error(`Database connectivity issue: ${dbError.message}`);
      }

      // Check active executions
      const activeExecutions = this.getActiveExecutionsForUser(userId);

      const health = {
        status: 'healthy',
        service: 'Action Flows',
        timestamp: new Date().toISOString(),
        details: {
          databaseConnected: true,
          activeExecutions: activeExecutions.length,
          workerManagerAvailable: !!this.workerManager,
          aiServiceAvailable: !!this.aiService
        }
      };

      res.json({
        success: true,
        data: health
      });

    } catch (error) {
      this.logger.error('Action flows health check failed', {
        userId: req.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(503).json({
        success: false,
        error: 'Action flows service health check failed',
        data: {
          status: 'unhealthy',
          service: 'Action Flows',
          timestamp: new Date().toISOString(),
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 578-623
   * Execute action flow with context
   */
  public async executeActionFlow(
    userId: string,
    chatId: string,
    flow: ActionFlow,
    message: any,
    initialVariables: Record<string, any> = {}
  ): Promise<FlowExecutionResult> {
    const executionId = uuidv4();
    
    try {
      this.logger.info('Executing action flow', {
        userId,
        chatId,
        flowId: flow.id,
        flowName: flow.name,
        executionId
      });

      // Build execution context
      const context: FlowExecutionContext = {
        flowId: flow.id,
        userId,
        chatId,
        message,
        variables: {
          ...initialVariables,
          // Magic variables
          userId,
          sender: chatId,
          messageBody: message.body || '',
          timestamp: new Date().toISOString()
        },
        flow,
        currentStep: 0,
        executionId
      };

      // Track execution
      this.activeExecutions.set(executionId, context);

      // Validate flow has steps
      if (!flow.steps || !Array.isArray(flow.steps) || flow.steps.length === 0) {
        this.logger.warn('Flow has no steps defined', { flowId: flow.id });
        
        // Send default message
        await this.sendMessage(userId, chatId, 'Flujo activado pero sin acciones definidas.');
        
        return {
          success: true,
          executionId,
          stepsExecuted: 0,
          variables: context.variables
        };
      }

      // Execute steps
      const stepsExecuted = await this.executeSteps(context);
      
      this.logger.info('Flow execution completed', {
        userId,
        chatId,
        flowId: flow.id,
        executionId,
        stepsExecuted
      });

      return {
        success: true,
        executionId,
        stepsExecuted,
        variables: context.variables
      };

    } catch (error) {
      this.logger.error('Error executing action flow', {
        userId,
        chatId,
        flowId: flow.id,
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Send error message to chat
      try {
        await this.sendMessage(userId, chatId, 'Lo siento, ocurrió un error al procesar tu solicitud.');
      } catch (sendError) {
        this.logger.error('Error sending error message', {
          userId,
          chatId,
          error: sendError instanceof Error ? sendError.message : 'Unknown error'
        });
      }

      return {
        success: false,
        executionId,
        stepsExecuted: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

    } finally {
      // Cleanup execution tracking
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/worker.js líneas 424-576
   * Execute flow steps
   */
  private async executeSteps(context: FlowExecutionContext): Promise<number> {
    let stepsExecuted = 0;

    for (let i = 0; i < context.flow.steps.length; i++) {
      const step = context.flow.steps[i];
      context.currentStep = i;

      try {
        this.logger.debug('Executing flow step', {
          userId: context.userId,
          flowId: context.flowId,
          stepIndex: i,
          stepType: step.type,
          executionId: context.executionId
        });

        const shouldContinue = await this.executeStep(step, context);
        stepsExecuted++;

        if (!shouldContinue) {
          this.logger.debug('Flow execution stopped by step', {
            userId: context.userId,
            flowId: context.flowId,
            stepIndex: i,
            stepType: step.type
          });
          break;
        }

              } catch (error) {
        this.logger.error('Error executing flow step', {
          userId: context.userId,
          flowId: context.flowId,
          stepIndex: i,
          stepType: step.type,
          executionId: context.executionId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Continue with next step unless it's a critical error
        stepsExecuted++;
      }
    }

    return stepsExecuted;
  }

  /**
   * Execute individual flow step
   */
  private async executeStep(step: ActionFlowStep, context: FlowExecutionContext): Promise<boolean> {
    switch (step.type) {
      case 'send_message':
        if (step.message) {
          const resolvedMessage = this.resolveVariables(step.message, context.variables);
          await this.sendMessage(context.userId, context.chatId, resolvedMessage);
        }
        return true;

      case 'run_gemini':
        if (step.prompt) {
          const resolvedPrompt = this.resolveVariables(step.prompt, context.variables);
          
          try {
            // Get agent config for AI context
            const agentConfig = await this.getAgentConfigForUser(context.userId);
            
            let finalPrompt = resolvedPrompt;
            
            // Use conversation history if requested
            if (step.useConversationHistory === true) {
              finalPrompt = await this.aiService.buildConversationPrompt(
                context.userId,
                context.chatId,
                resolvedPrompt,
                agentConfig
              );
            }

            const aiResponse = await this.aiService.generateResponse(finalPrompt, {
              maxRetries: 2,
              maxTokens: 1000
            });

            if (aiResponse.success && aiResponse.content) {
              // Store in variable if specified
              if (step.outputVariable && step.outputVariable.trim()) {
                const varName = step.outputVariable.trim();
                context.variables[varName] = aiResponse.content;
                this.logger.debug('AI response stored in variable', {
                  userId: context.userId,
                  variable: varName,
                  executionId: context.executionId
                });
              } else {
                // Send response directly
                await this.sendMessage(context.userId, context.chatId, aiResponse.content);
              }
            } else {
              this.logger.warn('Gemini did not generate response for prompt', {
                userId: context.userId,
                flowId: context.flowId,
                error: aiResponse.error
              });
              
              if (step.outputVariable && step.outputVariable.trim()) {
                context.variables[step.outputVariable.trim()] = null;
              }
            }
          } catch (geminiError) {
            this.logger.error('Error in run_gemini step', {
              userId: context.userId,
              flowId: context.flowId,
              error: geminiError instanceof Error ? geminiError.message : 'Unknown error'
            });
          }
        }
        return true;

      case 'delay':
        if (step.delayMs && step.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, Math.min(step.delayMs!, 30000))); // Max 30 seconds
        }
        return true;

      case 'set_variable':
        if (step.variableName && step.variableName.trim()) {
          const varName = step.variableName.trim();
          const varValue = step.variableValue ? this.resolveVariables(step.variableValue, context.variables) : '';
          context.variables[varName] = varValue;
          this.logger.debug('Variable set', {
            userId: context.userId,
            variable: varName,
            value: varValue,
            executionId: context.executionId
          });
        }
        return true;

      case 'conditional':
        if (step.condition) {
          const conditionResult = this.evaluateCondition(step.condition, context.variables);
          
          if (conditionResult && step.trueSteps) {
            // Execute true branch steps
            for (const trueStep of step.trueSteps) {
              const shouldContinue = await this.executeStep(trueStep, context);
              if (!shouldContinue) return false;
            }
          } else if (!conditionResult && step.falseSteps) {
            // Execute false branch steps
            for (const falseStep of step.falseSteps) {
              const shouldContinue = await this.executeStep(falseStep, context);
              if (!shouldContinue) return false;
            }
          }
        }
        return true;

      case 'end_flow':
        this.logger.debug('Flow ended by end_flow step', {
          userId: context.userId,
          flowId: context.flowId,
          executionId: context.executionId
        });
        return false;

      default:
        this.logger.warn('Unknown step type', {
          stepType: step.type,
          userId: context.userId,
          flowId: context.flowId
        });
        return true;
    }
  }

  /**
   * Resolve variables in text
   */
  private resolveVariables(text: string, variables: Record<string, any>): string {
    let resolved = text;
    
    // Replace {{variable}} patterns
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`{{${key}}}`, 'g');
      resolved = resolved.replace(pattern, String(value || ''));
    }
    
    return resolved;
  }

  /**
   * Evaluate simple conditions
   */
  private evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    try {
      // Simple condition evaluation - in production, use a safer expression parser
      // For now, support basic comparisons like: {{variable}} == "value"
      let evaluableCondition = condition;
      
      // Replace variables
      for (const [key, value] of Object.entries(variables)) {
        const pattern = new RegExp(`{{${key}}}`, 'g');
        const safeValue = typeof value === 'string' ? `"${value}"` : String(value);
        evaluableCondition = evaluableCondition.replace(pattern, safeValue);
      }
      
      // Basic safety check - only allow simple comparisons
      if (!/^[a-zA-Z0-9\s"'!=<>]+$/.test(evaluableCondition)) {
        this.logger.warn('Unsafe condition detected', { condition });
        return false;
      }
      
      // Use Function constructor for evaluation (safer than eval)
      return new Function('return ' + evaluableCondition)();
      
    } catch (error) {
      this.logger.error('Error evaluating condition', {
        condition,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Send message through worker
   */
  private async sendMessage(userId: string, chatId: string, message: string): Promise<void> {
    try {
      // Add small random delay to feel more natural
      const delay = Math.random() * 2000 + 1000; // 1-3 seconds
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const success = await this.workerManager.sendMessage(userId, chatId, message);
      
      if (!success) {
        throw new Error('Failed to send message through worker');
      }
      
      this.logger.debug('Message sent successfully', { userId, chatId, messageLength: message.length });
      
    } catch (error) {
      this.logger.error('Error sending message in flow', {
        userId,
        chatId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get agent configuration for user
   */
  private async getAgentConfigForUser(userId: string): Promise<any> {
    try {
      // This would integrate with AgentService
      // For now, return basic config
      return {
        persona: {
          name: 'Asistente',
          instructions: 'Eres un asistente conversacional útil y amigable.'
        },
        knowledge: {
          files: [],
          urls: [],
          writingSampleTxt: ''
        }
      };
    } catch (error) {
      this.logger.error('Error getting agent config for flow', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {};
    }
  }

  /**
   * Validate flow steps
   */
  private validateFlowSteps(steps: ActionFlowStep[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(steps)) {
      errors.push('Steps must be an array');
      return { valid: false, errors };
    }

    steps.forEach((step, index) => {
      if (!step.type) {
        errors.push(`Step ${index + 1}: type is required`);
        return;
      }

      switch (step.type) {
        case 'send_message':
          if (!step.message || !step.message.trim()) {
            errors.push(`Step ${index + 1}: message is required for send_message step`);
          }
          break;

        case 'run_gemini':
          if (!step.prompt || !step.prompt.trim()) {
            errors.push(`Step ${index + 1}: prompt is required for run_gemini step`);
          }
          break;

        case 'delay':
          if (step.delayMs && (step.delayMs < 0 || step.delayMs > 60000)) {
            errors.push(`Step ${index + 1}: delayMs must be between 0 and 60000`);
          }
          break;

        case 'set_variable':
          if (!step.variableName || !step.variableName.trim()) {
            errors.push(`Step ${index + 1}: variableName is required for set_variable step`);
          }
          break;

        case 'conditional':
          if (!step.condition || !step.condition.trim()) {
            errors.push(`Step ${index + 1}: condition is required for conditional step`);
          }
          break;
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get active executions for user
   */
  private getActiveExecutionsForUser(userId: string): FlowExecutionContext[] {
    return Array.from(this.activeExecutions.values())
      .filter(context => context.userId === userId);
  }

  /**
   * Notify worker about flow changes
   */
  private notifyWorkerFlowChange(userId: string): void {
    try {
      if (this.workerManager.isWorkerActive(userId)) {
        this.workerManager.sendCommand(userId, 'RELOAD_USER_FLOWS');
        this.logger.debug('Worker notified of flow change', { userId });
      } else {
        this.logger.debug('No active worker to notify of flow change', { userId });
      }
    } catch (error) {
      this.logger.error('Error notifying worker of flow change', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get execution status
   */
  public getExecutionStatus(): {
    activeExecutions: number;
    executionsPerUser: Record<string, number>;
  } {
    const executionsPerUser: Record<string, number> = {};
    
    for (const context of this.activeExecutions.values()) {
      executionsPerUser[context.userId] = (executionsPerUser[context.userId] || 0) + 1;
    }

    return {
      activeExecutions: this.activeExecutions.size,
      executionsPerUser
    };
  }

  /**
   * Cleanup active executions
   */
  public cleanup(): void {
    this.logger.info('Cleaning up action flows controller');
    this.activeExecutions.clear();
  }
}

export default ActionFlowsController; 