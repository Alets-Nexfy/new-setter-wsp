import { Request, Response } from 'express';
import { AgentTriggerService } from '../../core/services/AgentTriggerService';
import { AgentSwitchingService } from '../../core/services/AgentSwitchingService';
import { UserTierService } from '../../core/services/UserTierService';
import { LoggerService } from '../../core/services/LoggerService';

export class MultiAgentController {
  private readonly agentTriggerService: AgentTriggerService;
  private readonly agentSwitchingService: AgentSwitchingService;
  private readonly userTierService: UserTierService;
  private readonly logger: LoggerService;

  constructor() {
    this.agentTriggerService = AgentTriggerService.getInstance();
    this.agentSwitchingService = AgentSwitchingService.getInstance();
    this.userTierService = UserTierService.getInstance();
    this.logger = LoggerService.getInstance();
  }

  /**
   * GET /api/multi-agent/:userId/config
   * Get multi-agent configuration for a user
   */
  async getConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      const config = await this.agentTriggerService.getMultiAgentConfiguration(userId);
      
      if (!config) {
        res.status(404).json({
          success: false,
          error: 'Multi-agent configuration not found'
        });
        return;
      }

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      this.logger.error('Error getting multi-agent configuration:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get configuration'
      });
    }
  }

  /**
   * POST /api/multi-agent/:userId/config
   * Create or update multi-agent configuration
   */
  async createConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { activeAgents, defaultAgent, triggerConfig, switchingBehavior } = req.body;

      // For testing, we'll allow multi-agent for all users
      // In production, you'd validate tier properly
      const maxAgents = 3; // Allow up to 3 agents for testing

      if (activeAgents && activeAgents.length > maxAgents) {
        res.status(400).json({
          success: false,
          error: `Maximum ${maxAgents} active agents allowed`
        });
        return;
      }

      const updates = {
        activeAgents: activeAgents || [],
        defaultAgent: defaultAgent || activeAgents?.[0],
        triggerConfig: triggerConfig || {
          initial: {},
          switch: {},
          fallback: []
        },
        switchingBehavior: {
          preserveContext: switchingBehavior?.preserveContext ?? true,
          announceSwitch: switchingBehavior?.announceSwitch ?? false,
          switchMessage: switchingBehavior?.switchMessage,
          maxSwitchesPerHour: switchingBehavior?.maxSwitchesPerHour ?? 10
        }
      };

      const success = await this.agentTriggerService.updateMultiAgentConfig(userId, updates);
      
      if (!success) {
        res.status(500).json({
          success: false,
          error: 'Failed to update configuration'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Multi-agent configuration updated successfully',
        data: updates
      });
    } catch (error) {
      this.logger.error('Error creating/updating multi-agent configuration:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update configuration'
      });
    }
  }

  /**
   * POST /api/multi-agent/:userId/config/initialize
   * Initialize default multi-agent configuration
   */
  async initializeDefault(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      const config = await this.agentTriggerService.createDefaultMultiAgentConfig(userId);
      
      res.json({
        success: true,
        message: 'Default multi-agent configuration created',
        data: config
      });
    } catch (error) {
      this.logger.error('Error initializing default multi-agent configuration:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initialize configuration'
      });
    }
  }

  /**
   * GET /api/multi-agent/:userId/chat/:chatId/state
   * Get current agent state for a specific chat
   */
  async getChatState(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      
      const state = await this.agentSwitchingService.getChatAgentState(userId, chatId);
      
      res.json({
        success: true,
        data: state
      });
    } catch (error) {
      this.logger.error('Error getting chat agent state:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get chat state'
      });
    }
  }

  /**
   * POST /api/multi-agent/:userId/chat/:chatId/switch
   * Manually switch agent for a chat
   */
  async switchAgent(req: Request, res: Response): Promise<void> {
    try {
      const { userId, chatId } = req.params;
      const { agentId, reason } = req.body;

      if (!agentId) {
        res.status(400).json({
          success: false,
          error: 'Agent ID is required'
        });
        return;
      }

      const result = await this.agentSwitchingService.switchAgent(
        userId,
        chatId,
        agentId,
        reason || 'manual_override'
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      this.logger.error('Error switching agent:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to switch agent'
      });
    }
  }

  /**
   * POST /api/multi-agent/:userId/triggers/test
   * Test trigger evaluation for a message
   */
  async testTriggers(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { message, chatId, currentAgentId } = req.body;

      if (!message) {
        res.status(400).json({
          success: false,
          error: 'Message is required'
        });
        return;
      }

      // Test initial triggers
      const initialResult = await this.agentTriggerService.evaluateInitialTriggers(
        userId,
        message,
        chatId || 'test-chat'
      );

      let switchResult = null;
      if (currentAgentId) {
        // Test switch triggers
        switchResult = await this.agentTriggerService.evaluateSwitchTriggers(
          userId,
          message,
          currentAgentId,
          chatId || 'test-chat'
        );
      }

      res.json({
        success: true,
        data: {
          initialTrigger: initialResult,
          switchTrigger: switchResult
        }
      });
    } catch (error) {
      this.logger.error('Error testing triggers:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test triggers'
      });
    }
  }

  /**
   * POST /api/multi-agent/:userId/upgrade-tier
   * Upgrade user tier for testing (bypasses auth for demo)
   */
  async upgradeTier(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { tier } = req.body;

      if (!tier || !['standard', 'professional', 'enterprise'].includes(tier)) {
        res.status(400).json({
          success: false,
          error: 'Valid tier is required (standard, professional, enterprise)'
        });
        return;
      }

      const success = await this.userTierService.upgradeTier(userId, tier);
      
      res.json({
        success: true,
        message: `User upgraded to ${tier} tier`,
        data: { userId, tier }
      });
    } catch (error) {
      this.logger.error('Error upgrading tier:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upgrade tier'
      });
    }
  }

  /**
   * GET /api/multi-agent/:userId/stats
   * Get multi-agent usage statistics
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      // This would be implemented with proper analytics
      // For now, return basic info
      const userTier = await this.userTierService.getUserTier(userId);
      const config = await this.agentTriggerService.getMultiAgentConfiguration(userId);
      
      res.json({
        success: true,
        data: {
          userTier: userTier.tier,
          maxActiveAgents: config?.maxActiveAgents || 1,
          currentActiveAgents: config?.activeAgents.length || 0,
          multiAgentEnabled: (config?.activeAgents.length || 0) > 1
        }
      });
    } catch (error) {
      this.logger.error('Error getting multi-agent stats:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stats'
      });
    }
  }

  /**
   * Private method to get multi-agent configuration
   */
  private async getMultiAgentConfiguration(userId: string) {
    // This method should be added to AgentTriggerService
    // For now, we'll call the private method indirectly
    try {
      const config = await (this.agentTriggerService as any).getMultiAgentConfig(userId);
      return config;
    } catch (error) {
      return null;
    }
  }
}