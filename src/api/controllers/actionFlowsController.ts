import { Request, Response } from 'express';
import { ActionFlowsService } from '../../core/services/actionFlowsService';
import { LoggerService } from '../../core/services/LoggerService';
import { CreateActionFlowRequest, UpdateActionFlowRequest } from '../../core/models/ActionFlow';

export class ActionFlowsController {
  private actionFlowsService: ActionFlowsService;
  private logger: LoggerService;

  constructor() {
    this.actionFlowsService = new ActionFlowsService();
    this.logger = new LoggerService();
  }

  /**
   * Get all action flows for a user
   * GET /users/:userId/action-flows
   */
  async getUserActionFlows(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      this.logger.info(`[ActionFlowsController] Getting action flows for user: ${userId}`);

      const flows = await this.actionFlowsService.getUserActionFlows(userId);

      res.json({
        success: true,
        data: flows,
        message: `Retrieved ${flows.length} action flows`
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error getting user action flows:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get action flows'
      });
    }
  }

  /**
   * Create a new action flow
   * POST /users/:userId/action-flows
   */
  async createActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const flowData: CreateActionFlowRequest = req.body;

      this.logger.info(`[ActionFlowsController] Creating action flow for user: ${userId}`, flowData);

      const newFlow = await this.actionFlowsService.createActionFlow(userId, flowData);

      res.status(201).json({
        success: true,
        data: newFlow,
        message: 'Action flow created successfully'
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error creating action flow:`, error);
      
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('required') || error.message.includes('Invalid')) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to create action flow'
        });
      }
    }
  }

  /**
   * Get a specific action flow
   * GET /users/:userId/action-flows/:flowId
   */
  async getActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      this.logger.info(`[ActionFlowsController] Getting action flow ${flowId} for user: ${userId}`);

      const flow = await this.actionFlowsService.getActionFlow(userId, flowId);

      res.json({
        success: true,
        data: flow,
        message: 'Action flow retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error getting action flow:`, error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to get action flow'
        });
      }
    }
  }

  /**
   * Update an action flow
   * PUT /users/:userId/action-flows/:flowId
   */
  async updateActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      const updates: UpdateActionFlowRequest = req.body;

      this.logger.info(`[ActionFlowsController] Updating action flow ${flowId} for user: ${userId}`, updates);

      const updatedFlow = await this.actionFlowsService.updateActionFlow(userId, flowId, updates);

      res.json({
        success: true,
        data: updatedFlow,
        message: 'Action flow updated successfully'
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error updating action flow:`, error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('Invalid')) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to update action flow'
        });
      }
    }
  }

  /**
   * Delete an action flow
   * DELETE /users/:userId/action-flows/:flowId
   */
  async deleteActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      this.logger.info(`[ActionFlowsController] Deleting action flow ${flowId} for user: ${userId}`);

      await this.actionFlowsService.deleteActionFlow(userId, flowId);

      res.json({
        success: true,
        message: 'Action flow deleted successfully'
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error deleting action flow:`, error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to delete action flow'
        });
      }
    }
  }

  /**
   * Execute an action flow
   * POST /users/:userId/action-flows/:flowId/execute
   */
  async executeActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      const context = req.body.context || {};

      this.logger.info(`[ActionFlowsController] Executing action flow ${flowId} for user: ${userId}`, context);

      const result = await this.actionFlowsService.executeActionFlow(userId, flowId, context);

      res.json({
        success: true,
        data: result,
        message: `Action flow executed ${result.success ? 'successfully' : 'with errors'}`
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error executing action flow:`, error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('not active')) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to execute action flow'
        });
      }
    }
  }

  /**
   * Toggle action flow activation status
   * PATCH /users/:userId/action-flows/:flowId/toggle
   */
  async toggleActionFlowStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      this.logger.info(`[ActionFlowsController] Toggling status for action flow ${flowId} for user: ${userId}`);

      const updatedFlow = await this.actionFlowsService.toggleActionFlowStatus(userId, flowId);

      res.json({
        success: true,
        data: updatedFlow,
        message: `Action flow ${updatedFlow.isActive ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error toggling action flow status:`, error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to toggle action flow status'
        });
      }
    }
  }

  /**
   * Get action flows statistics
   * GET /users/:userId/action-flows/statistics
   */
  async getActionFlowsStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      this.logger.info(`[ActionFlowsController] Getting statistics for user: ${userId}`);

      const statistics = await this.actionFlowsService.getActionFlowsStatistics(userId);

      res.json({
        success: true,
        data: statistics,
        message: 'Action flows statistics retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error getting statistics:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get action flows statistics'
      });
    }
  }

  /**
   * Bulk operations on action flows
   * POST /users/:userId/action-flows/bulk
   */
  async bulkOperations(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { operation, flowIds, data } = req.body;

      this.logger.info(`[ActionFlowsController] Bulk operation ${operation} for user: ${userId}`, { flowIds, data });

      let results: any[] = [];

      switch (operation) {
        case 'activate':
          results = await Promise.all(
            flowIds.map(async (flowId: string) => {
              try {
                const flow = await this.actionFlowsService.updateActionFlow(userId, flowId, { isActive: true });
                return { flowId, success: true, data: flow };
              } catch (error) {
                return { flowId, success: false, error: error.message };
              }
            })
          );
          break;

        case 'deactivate':
          results = await Promise.all(
            flowIds.map(async (flowId: string) => {
              try {
                const flow = await this.actionFlowsService.updateActionFlow(userId, flowId, { isActive: false });
                return { flowId, success: true, data: flow };
              } catch (error) {
                return { flowId, success: false, error: error.message };
              }
            })
          );
          break;

        case 'delete':
          results = await Promise.all(
            flowIds.map(async (flowId: string) => {
              try {
                await this.actionFlowsService.deleteActionFlow(userId, flowId);
                return { flowId, success: true };
              } catch (error) {
                return { flowId, success: false, error: error.message };
              }
            })
          );
          break;

        case 'execute':
          results = await Promise.all(
            flowIds.map(async (flowId: string) => {
              try {
                const result = await this.actionFlowsService.executeActionFlow(userId, flowId, data?.context || {});
                return { flowId, success: true, data: result };
              } catch (error) {
                return { flowId, success: false, error: error.message };
              }
            })
          );
          break;

        default:
          res.status(400).json({
            success: false,
            message: `Invalid operation: ${operation}. Supported operations: activate, deactivate, delete, execute`
          });
          return;
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.json({
        success: true,
        data: {
          operation,
          total: flowIds.length,
          successful,
          failed,
          results
        },
        message: `Bulk operation completed. ${successful} successful, ${failed} failed`
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error in bulk operation:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to perform bulk operation'
      });
    }
  }

  /**
   * Get action flow execution history
   * GET /users/:userId/action-flows/:flowId/executions
   */
  async getActionFlowExecutions(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      this.logger.info(`[ActionFlowsController] Getting executions for action flow ${flowId} for user: ${userId}`);

      // This would typically fetch from the executions collection
      // For now, we'll return a placeholder
      const executions = [];

      res.json({
        success: true,
        data: executions,
        message: 'Action flow executions retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error getting executions:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get action flow executions'
      });
    }
  }

  /**
   * Duplicate an action flow
   * POST /users/:userId/action-flows/:flowId/duplicate
   */
  async duplicateActionFlow(req: Request, res: Response): Promise<void> {
    try {
      const { userId, flowId } = req.params;
      const { name, description } = req.body;

      this.logger.info(`[ActionFlowsController] Duplicating action flow ${flowId} for user: ${userId}`);

      // Get the original flow
      const originalFlow = await this.actionFlowsService.getActionFlow(userId, flowId);

      // Create new flow data
      const newFlowData = {
        name: name || `${originalFlow.name} (Copy)`,
        description: description || originalFlow.description,
        trigger: originalFlow.trigger,
        steps: originalFlow.steps,
        priority: originalFlow.priority,
        conditions: originalFlow.conditions
      };

      // Create the new flow
      const newFlow = await this.actionFlowsService.createActionFlow(userId, newFlowData);

      res.status(201).json({
        success: true,
        data: newFlow,
        message: 'Action flow duplicated successfully'
      });
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Error duplicating action flow:`, error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to duplicate action flow'
        });
      }
    }
  }

  /**
   * Health check for action flows
   * GET /users/:userId/action-flows/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.actionFlowsService.healthCheck();

      if (health.status === 'healthy') {
        res.json({
          success: true,
          data: health,
          message: 'Action flows service is healthy'
        });
      } else {
        res.status(503).json({
          success: false,
          data: health,
          message: 'Action flows service is unhealthy'
        });
      }
    } catch (error) {
      this.logger.error(`[ActionFlowsController] Health check failed:`, error);
      res.status(503).json({
        success: false,
        message: 'Action flows service health check failed'
      });
    }
  }
} 