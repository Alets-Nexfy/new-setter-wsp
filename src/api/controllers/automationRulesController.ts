import { Request, Response } from 'express';
import { AutomationRulesService } from '../../core/services/automationRulesService';
import { LoggerService } from '../../core/services/LoggerService';
import { CreateAutomationRuleRequest, UpdateAutomationRuleRequest } from '../../core/models/AutomationRule';

export class AutomationRulesController {
  private automationRulesService: AutomationRulesService;
  private logger: LoggerService;

  constructor() {
    this.automationRulesService = new AutomationRulesService();
    this.logger = new LoggerService();
  }

  /**
   * Get all automation rules for a user
   * GET /users/:userId/rules
   */
  async getUserRules(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      this.logger.info(`[AutomationRulesController] Getting rules for user: ${userId}`);

      const rules = await this.automationRulesService.getUserRules(userId);

      res.json({
        success: true,
        data: rules,
        message: `Retrieved ${rules.length} automation rules`
      });
    } catch (error) {
      this.logger.error(`[AutomationRulesController] Error getting user rules:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get automation rules'
      });
    }
  }

  /**
   * Create a new automation rule
   * POST /users/:userId/rules
   */
  async createRule(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const ruleData: CreateAutomationRuleRequest = req.body;

      this.logger.info(`[AutomationRulesController] Creating rule for user: ${userId}`, ruleData);

      const newRule = await this.automationRulesService.createRule(userId, ruleData);

      res.status(201).json({
        success: true,
        data: newRule,
        message: 'Automation rule created successfully'
      });
    } catch (error) {
      this.logger.error(`[AutomationRulesController] Error creating rule:`, error);
      
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
          message: error.message || 'Failed to create automation rule'
        });
      }
    }
  }

  /**
   * Get a specific automation rule
   * GET /users/:userId/rules/:ruleId
   */
  async getRule(req: Request, res: Response): Promise<void> {
    try {
      const { userId, ruleId } = req.params;
      this.logger.info(`[AutomationRulesController] Getting rule ${ruleId} for user: ${userId}`);

      const rule = await this.automationRulesService.getRule(userId, ruleId);

      res.json({
        success: true,
        data: rule,
        message: 'Automation rule retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[AutomationRulesController] Error getting rule:`, error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to get automation rule'
        });
      }
    }
  }

  /**
   * Update an automation rule
   * PUT /users/:userId/rules/:ruleId
   */
  async updateRule(req: Request, res: Response): Promise<void> {
    try {
      const { userId, ruleId } = req.params;
      const updates: UpdateAutomationRuleRequest = req.body;

      this.logger.info(`[AutomationRulesController] Updating rule ${ruleId} for user: ${userId}`, updates);

      const updatedRule = await this.automationRulesService.updateRule(userId, ruleId, updates);

      res.json({
        success: true,
        data: updatedRule,
        message: 'Automation rule updated successfully'
      });
    } catch (error) {
      this.logger.error(`[AutomationRulesController] Error updating rule:`, error);
      
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
          message: error.message || 'Failed to update automation rule'
        });
      }
    }
  }

  /**
   * Delete an automation rule
   * DELETE /users/:userId/rules/:ruleId
   */
  async deleteRule(req: Request, res: Response): Promise<void> {
    try {
      const { userId, ruleId } = req.params;
      this.logger.info(`[AutomationRulesController] Deleting rule ${ruleId} for user: ${userId}`);

      await this.automationRulesService.deleteRule(userId, ruleId);

      res.json({
        success: true,
        message: 'Automation rule deleted successfully'
      });
    } catch (error) {
      this.logger.error(`[AutomationRulesController] Error deleting rule:`, error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to delete automation rule'
        });
      }
    }
  }

  /**
   * Toggle rule activation status
   * PATCH /users/:userId/rules/:ruleId/toggle
   */
  async toggleRuleStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId, ruleId } = req.params;
      this.logger.info(`[AutomationRulesController] Toggling status for rule ${ruleId} for user: ${userId}`);

      const updatedRule = await this.automationRulesService.toggleRuleStatus(userId, ruleId);

      res.json({
        success: true,
        data: updatedRule,
        message: `Rule ${updatedRule.isActive ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      this.logger.error(`[AutomationRulesController] Error toggling rule status:`, error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: error.message || 'Failed to toggle rule status'
        });
      }
    }
  }

  /**
   * Get automation rules statistics
   * GET /users/:userId/rules/statistics
   */
  async getRulesStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      this.logger.info(`[AutomationRulesController] Getting statistics for user: ${userId}`);

      const statistics = await this.automationRulesService.getRulesStatistics(userId);

      res.json({
        success: true,
        data: statistics,
        message: 'Automation rules statistics retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[AutomationRulesController] Error getting statistics:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get automation rules statistics'
      });
    }
  }

  /**
   * Bulk operations on automation rules
   * POST /users/:userId/rules/bulk
   */
  async bulkOperations(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { operation, ruleIds, data } = req.body;

      this.logger.info(`[AutomationRulesController] Bulk operation ${operation} for user: ${userId}`, { ruleIds, data });

      let results: any[] = [];

      switch (operation) {
        case 'activate':
          results = await Promise.all(
            ruleIds.map(async (ruleId: string) => {
              try {
                const rule = await this.automationRulesService.updateRule(userId, ruleId, { isActive: true });
                return { ruleId, success: true, data: rule };
              } catch (error) {
                return { ruleId, success: false, error: error.message };
              }
            })
          );
          break;

        case 'deactivate':
          results = await Promise.all(
            ruleIds.map(async (ruleId: string) => {
              try {
                const rule = await this.automationRulesService.updateRule(userId, ruleId, { isActive: false });
                return { ruleId, success: true, data: rule };
              } catch (error) {
                return { ruleId, success: false, error: error.message };
              }
            })
          );
          break;

        case 'delete':
          results = await Promise.all(
            ruleIds.map(async (ruleId: string) => {
              try {
                await this.automationRulesService.deleteRule(userId, ruleId);
                return { ruleId, success: true };
              } catch (error) {
                return { ruleId, success: false, error: error.message };
              }
            })
          );
          break;

        default:
          res.status(400).json({
            success: false,
            message: `Invalid operation: ${operation}. Supported operations: activate, deactivate, delete`
          });
          return;
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.json({
        success: true,
        data: {
          operation,
          total: ruleIds.length,
          successful,
          failed,
          results
        },
        message: `Bulk operation completed. ${successful} successful, ${failed} failed`
      });
    } catch (error) {
      this.logger.error(`[AutomationRulesController] Error in bulk operation:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to perform bulk operation'
      });
    }
  }

  /**
   * Health check for automation rules
   * GET /users/:userId/rules/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.automationRulesService.healthCheck();

      if (health.status === 'healthy') {
        res.json({
          success: true,
          data: health,
          message: 'Automation rules service is healthy'
        });
      } else {
        res.status(503).json({
          success: false,
          data: health,
          message: 'Automation rules service is unhealthy'
        });
      }
    } catch (error) {
      this.logger.error(`[AutomationRulesController] Health check failed:`, error);
      res.status(503).json({
        success: false,
        message: 'Automation rules service health check failed'
      });
    }
  }
} 