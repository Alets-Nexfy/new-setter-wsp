import { EventEmitter } from 'events';
import { LoggerService } from './LoggerService';
import { SupabaseService } from './SupabaseService';
import { CacheService } from './CacheService';
import { v4 as uuidv4 } from 'uuid';

export interface AgentTrigger {
  id: string;
  type: 'keyword' | 'message' | 'lead' | 'manual' | 'time' | 'event';
  enabled: boolean;
  conditions: {
    keywords?: string[];
    patterns?: string[];
    events?: string[];
    schedule?: string;
  };
  targetAgentId?: string; // Which agent to activate when trigger fires
  priority?: number;
}

export interface AgentNetworkNode {
  agentId: string;
  agentName: string;
  role: 'primary' | 'trigger' | 'fallback';
  triggers?: AgentTrigger[];
  isActive?: boolean;
}

export interface AgentNetwork {
  primaryAgentId: string;
  nodes: AgentNetworkNode[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTriggersRequest {
  userId: string;
  agentId: string;
  triggers?: AgentTrigger[];
  agentNetwork?: AgentNetworkNode[];
}

export class AgentTriggerService extends EventEmitter {
  private static instance: AgentTriggerService;
  private logger: LoggerService;
  private db: SupabaseService;
  private cache: CacheService;
  
  // Cache keys
  private readonly NETWORK_CACHE_PREFIX = 'agent_network:';
  private readonly ACTIVE_NETWORK_PREFIX = 'active_network:';
  private readonly CACHE_TTL = 300; // 5 minutes

  private constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
  }

  public static getInstance(): AgentTriggerService {
    if (!AgentTriggerService.instance) {
      AgentTriggerService.instance = new AgentTriggerService();
    }
    return AgentTriggerService.instance;
  }

  /**
   * Get all triggers for an agent
   */
  public async getAgentTriggers(userId: string, agentId: string): Promise<AgentTrigger[]> {
    try {
      this.logger.debug('Getting agent triggers', { userId, agentId });

      // First check if agent exists and belongs to user
      const userUuid = this.extractUuid(userId);
      const { data: agent, error: agentError } = await this.db
        .from('agents')
        .select('config')
        .eq('id', agentId)
        .eq('user_id', userUuid)
        .single();

      if (agentError || !agent) {
        throw new Error('Agent not found');
      }

      // Get triggers from agent config
      const triggers = agent.config?.automation?.triggers || [];

      // Also get triggers from agent_triggers table
      const { data: dbTriggers, error: triggersError } = await this.db
        .from('agent_triggers')
        .select('*')
        .eq('agent_id', agentId)
        .eq('is_active', true);

      if (!triggersError && dbTriggers) {
        // Merge triggers from both sources
        dbTriggers.forEach(dbTrigger => {
          triggers.push({
            id: dbTrigger.id,
            type: dbTrigger.trigger_type,
            enabled: dbTrigger.is_active,
            conditions: dbTrigger.trigger_config,
            targetAgentId: dbTrigger.trigger_config?.targetAgentId
          });
        });
      }

      return triggers;

    } catch (error) {
      this.logger.error('Error getting agent triggers', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Update triggers and agent network configuration
   */
  public async updateAgentTriggers(request: UpdateTriggersRequest): Promise<any> {
    try {
      const { userId, agentId, triggers, agentNetwork } = request;
      this.logger.info('Updating agent triggers and network', { 
        userId, 
        agentId,
        triggersCount: triggers?.length,
        networkSize: agentNetwork?.length 
      });

      const userUuid = this.extractUuid(userId);

      // Get current agent configuration
      const { data: agent, error: agentError } = await this.db
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .eq('user_id', userUuid)
        .single();

      if (agentError || !agent) {
        throw new Error('Agent not found');
      }

      // Update agent config with new triggers and network
      const updatedConfig = {
        ...agent.config,
        automation: {
          ...agent.config?.automation,
          triggers: triggers || [],
          agentNetwork: agentNetwork || []
        }
      };

      // Update agent in database
      const { error: updateError } = await this.db
        .from('agents')
        .update({
          config: updatedConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', agentId)
        .eq('user_id', userUuid);

      if (updateError) {
        throw updateError;
      }

      // Save individual triggers to agent_triggers table for faster querying
      if (triggers && triggers.length > 0) {
        // Delete existing triggers
        await this.db
          .from('agent_triggers')
          .delete()
          .eq('agent_id', agentId);

        // Insert new triggers
        const triggerRecords = triggers.map(trigger => ({
          id: trigger.id || uuidv4(),
          agent_id: agentId,
          trigger_type: trigger.type,
          trigger_config: {
            ...trigger.conditions,
            targetAgentId: trigger.targetAgentId,
            priority: trigger.priority
          },
          is_active: trigger.enabled
        }));

        const { error: insertError } = await this.db
          .from('agent_triggers')
          .insert(triggerRecords);

        if (insertError) {
          this.logger.warn('Failed to insert triggers to agent_triggers table', { error: insertError });
        }
      }

      // Update cache
      await this.updateNetworkCache(userId, agentId, agentNetwork);

      // Emit event for real-time updates
      this.emit('triggers-updated', {
        userId,
        agentId,
        triggers,
        agentNetwork
      });

      return {
        agentId,
        triggers: triggers || [],
        network: agentNetwork || [],
        updatedAt: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Error updating agent triggers', {
        userId: request.userId,
        agentId: request.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Activate an agent network (main agent + all trigger agents)
   */
  public async activateAgentNetwork(userId: string, agentId: string): Promise<any> {
    try {
      this.logger.info('Activating agent network', { userId, agentId });

      const userUuid = this.extractUuid(userId);

      // First deactivate any existing network
      await this.deactivateAllNetworks(userId);

      // Get agent configuration with network
      const { data: agent, error } = await this.db
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .eq('user_id', userUuid)
        .single();

      if (error || !agent) {
        throw new Error('Agent not found');
      }

      const network = agent.config?.automation?.agentNetwork || [];
      const activatedAgents = [agentId]; // Start with primary agent

      // Collect all agent IDs in the network
      network.forEach((node: AgentNetworkNode) => {
        if (node.agentId && node.agentId !== agentId) {
          activatedAgents.push(node.agentId);
        }
      });

      // Update user's active agent to the primary
      await this.db
        .from('users')
        .update({
          active_agent_id: agentId,
          updated_at: new Date().toISOString()
        })
        .eq('id', userUuid);

      // Store active network in Redis for fast access
      const networkData = {
        primaryAgentId: agentId,
        agents: activatedAgents,
        network,
        activatedAt: new Date().toISOString()
      };

      await this.cache.set(
        `${this.ACTIVE_NETWORK_PREFIX}${userId}`,
        JSON.stringify(networkData),
        this.CACHE_TTL
      );

      // Emit event for real-time updates
      this.emit('network-activated', {
        userId,
        primaryAgentId: agentId,
        activatedAgents,
        network
      });

      this.logger.info('Agent network activated successfully', {
        userId,
        primaryAgentId: agentId,
        totalAgents: activatedAgents.length
      });

      return {
        primaryAgentId: agentId,
        activatedAgents,
        network,
        activatedAt: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Error activating agent network', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Deactivate an agent network
   */
  public async deactivateAgentNetwork(userId: string, agentId: string): Promise<any> {
    try {
      this.logger.info('Deactivating agent network', { userId, agentId });

      const userUuid = this.extractUuid(userId);

      // Clear active agent
      await this.db
        .from('users')
        .update({
          active_agent_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userUuid);

      // Clear from Redis
      await this.cache.del(`${this.ACTIVE_NETWORK_PREFIX}${userId}`);

      // Emit event
      this.emit('network-deactivated', {
        userId,
        agentId
      });

      return {
        success: true,
        deactivatedAt: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Error deactivating agent network', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get the currently active network for a user
   */
  public async getActiveNetwork(userId: string): Promise<AgentNetwork | null> {
    try {
      // First check Redis cache
      const cached = await this.cache.get(`${this.ACTIVE_NETWORK_PREFIX}${userId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // If not in cache, check database
      const userUuid = this.extractUuid(userId);
      const { data: user, error } = await this.db
        .from('users')
        .select('active_agent_id')
        .eq('id', userUuid)
        .single();

      if (error || !user?.active_agent_id) {
        return null;
      }

      // Get the active agent's network configuration
      const { data: agent, error: agentError } = await this.db
        .from('agents')
        .select('*')
        .eq('id', user.active_agent_id)
        .eq('user_id', userUuid)
        .single();

      if (agentError || !agent) {
        return null;
      }

      const network = {
        primaryAgentId: agent.id,
        nodes: agent.config?.automation?.agentNetwork || [],
        createdAt: agent.created_at,
        updatedAt: agent.updated_at
      };

      // Cache it
      await this.cache.set(
        `${this.ACTIVE_NETWORK_PREFIX}${userId}`,
        JSON.stringify(network),
        this.CACHE_TTL
      );

      return network;

    } catch (error) {
      this.logger.error('Error getting active network', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Check if a specific agent is part of the active network
   */
  public async isAgentInActiveNetwork(userId: string, agentId: string): Promise<boolean> {
    try {
      const network = await this.getActiveNetwork(userId);
      if (!network) return false;

      if (network.primaryAgentId === agentId) return true;

      return network.nodes.some(node => node.agentId === agentId);

    } catch (error) {
      this.logger.error('Error checking if agent is in active network', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Process incoming message against triggers
   */
  public async processMessageTriggers(userId: string, message: string): Promise<string | null> {
    try {
      const network = await this.getActiveNetwork(userId);
      if (!network) return null;

      // Check all trigger nodes in the network
      for (const node of network.nodes) {
        if (node.triggers) {
          for (const trigger of node.triggers) {
            if (trigger.enabled && trigger.conditions?.keywords) {
              // Check if message matches any keyword
              const matched = trigger.conditions.keywords.some(keyword => 
                message.toLowerCase().includes(keyword.toLowerCase())
              );

              if (matched) {
                this.logger.info('Trigger matched', {
                  userId,
                  triggerType: trigger.type,
                  targetAgent: trigger.targetAgentId || node.agentId
                });

                // Return the agent ID that should handle this message
                return trigger.targetAgentId || node.agentId;
              }
            }
          }
        }
      }

      // No trigger matched, use primary agent
      return network.primaryAgentId;

    } catch (error) {
      this.logger.error('Error processing message triggers', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  // Helper methods
  private extractUuid(userId: string): string {
    return userId.startsWith('tribe-ia-nexus_') 
      ? userId.replace('tribe-ia-nexus_', '') 
      : userId;
  }

  private async deactivateAllNetworks(userId: string): Promise<void> {
    await this.cache.del(`${this.ACTIVE_NETWORK_PREFIX}${userId}`);
  }

  private async updateNetworkCache(userId: string, agentId: string, network?: any): Promise<void> {
    if (network) {
      await this.cache.set(
        `${this.NETWORK_CACHE_PREFIX}${agentId}`,
        JSON.stringify(network),
        this.CACHE_TTL
      );
    }
  }

  /**
   * Get multi-agent configuration for a user
   */
  public async getMultiAgentConfiguration(userId: string): Promise<any> {
    try {
      const userUuid = this.extractUuid(userId);
      
      // Get user's active agent
      const { data: user, error } = await this.db
        .from('users')
        .select('active_agent_id')
        .eq('id', userUuid)
        .single();

      if (error || !user?.active_agent_id) {
        return null;
      }

      // Get agent configuration
      const { data: agent, error: agentError } = await this.db
        .from('agents')
        .select('*')
        .eq('id', user.active_agent_id)
        .eq('user_id', userUuid)
        .single();

      if (agentError || !agent) {
        return null;
      }

      return {
        activeAgents: agent.config?.automation?.agentNetwork || [],
        defaultAgent: user.active_agent_id,
        triggerConfig: agent.config?.automation?.triggers || [],
        switchingBehavior: {
          preserveContext: true,
          announceSwitch: false,
          maxSwitchesPerHour: 10
        },
        maxActiveAgents: 3
      };
    } catch (error) {
      this.logger.error('Error getting multi-agent configuration', { userId, error });
      return null;
    }
  }

  /**
   * Update multi-agent configuration
   */
  public async updateMultiAgentConfig(userId: string, updates: any): Promise<boolean> {
    try {
      const userUuid = this.extractUuid(userId);
      
      this.logger.info('[AgentTriggerService] Starting multi-agent config update', {
        userId,
        userUuid,
        updates: JSON.stringify(updates)
      });

      // Get user's active agent
      const { data: user, error } = await this.db
        .from('users')
        .select('active_agent_id')
        .eq('id', userUuid)
        .single();

      if (error) {
        this.logger.error('[AgentTriggerService] Error fetching user:', {
          error: error.message,
          userUuid
        });
        return false;
      }

      if (!user?.active_agent_id) {
        this.logger.warn('[AgentTriggerService] User has no active agent', { userUuid });
        return false;
      }

      // Update agent configuration
      const { data: agent, error: agentError } = await this.db
        .from('agents')
        .select('config')
        .eq('id', user.active_agent_id)
        .eq('user_id', userUuid)
        .single();

      if (agentError) {
        this.logger.error('[AgentTriggerService] Error fetching agent:', {
          error: agentError.message,
          agentId: user.active_agent_id,
          userUuid
        });
        return false;
      }

      if (!agent) {
        this.logger.warn('[AgentTriggerService] Agent not found', {
          agentId: user.active_agent_id,
          userUuid
        });
        return false;
      }

      const updatedConfig = {
        ...agent.config,
        automation: {
          ...agent.config?.automation,
          agentNetwork: updates.activeAgents || [],
          triggers: updates.triggerConfig || []
        }
      };

      const { error: updateError } = await this.db
        .from('agents')
        .update({
          config: updatedConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.active_agent_id)
        .eq('user_id', userUuid);

      if (updateError) {
        this.logger.error('[AgentTriggerService] Error updating agent config:', {
          error: updateError.message,
          agentId: user.active_agent_id,
          userUuid
        });
        return false;
      }

      this.logger.info('[AgentTriggerService] Multi-agent config updated successfully', {
        agentId: user.active_agent_id,
        userUuid
      });

      return true;
    } catch (error) {
      this.logger.error('[AgentTriggerService] Unexpected error updating multi-agent config', { 
        userId, 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }

  /**
   * Create default multi-agent configuration
   */
  public async createDefaultMultiAgentConfig(userId: string): Promise<any> {
    try {
      const defaultConfig = {
        activeAgents: [],
        defaultAgent: null,
        triggerConfig: {
          initial: {},
          switch: {},
          fallback: []
        },
        switchingBehavior: {
          preserveContext: true,
          announceSwitch: false,
          maxSwitchesPerHour: 10
        }
      };

      const success = await this.updateMultiAgentConfig(userId, defaultConfig);
      
      if (success) {
        return defaultConfig;
      } else {
        throw new Error('Failed to create default configuration');
      }
    } catch (error) {
      this.logger.error('Error creating default multi-agent config', { userId, error });
      throw error;
    }
  }

  /**
   * Evaluate initial triggers for message processing
   */
  public async evaluateInitialTriggers(userId: string, message: string, chatId: string): Promise<any> {
    try {
      const network = await this.getActiveNetwork(userId);
      if (!network) {
        return { matched: false, agentId: null };
      }

      // Check triggers in the network
      for (const node of network.nodes) {
        if (node.triggers) {
          for (const trigger of node.triggers) {
            if (trigger.enabled && trigger.conditions?.keywords) {
              const matched = trigger.conditions.keywords.some(keyword => 
                message.toLowerCase().includes(keyword.toLowerCase())
              );

              if (matched) {
                return {
                  matched: true,
                  agentId: trigger.targetAgentId || node.agentId,
                  trigger: trigger,
                  node: node
                };
              }
            }
          }
        }
      }

      return { matched: false, agentId: network.primaryAgentId };
    } catch (error) {
      this.logger.error('Error evaluating initial triggers', { userId, message, chatId, error });
      return { matched: false, agentId: null };
    }
  }

  /**
   * Evaluate switch triggers for agent switching
   */
  public async evaluateSwitchTriggers(
    userId: string,
    message: string,
    currentAgentId: string,
    chatId: string
  ): Promise<any> {
    try {
      const network = await this.getActiveNetwork(userId);
      if (!network) {
        return { shouldSwitch: false, targetAgentId: null };
      }

      // Check if current agent has switch triggers
      const currentNode = network.nodes.find(n => n.agentId === currentAgentId);
      if (!currentNode?.triggers) {
        return { shouldSwitch: false, targetAgentId: currentAgentId };
      }

      // Evaluate switch triggers
      for (const trigger of currentNode.triggers) {
        if (trigger.enabled && trigger.type === 'message' && trigger.conditions?.keywords) {
          const matched = trigger.conditions.keywords.some(keyword => 
            message.toLowerCase().includes(keyword.toLowerCase())
          );

          if (matched) {
            return {
              shouldSwitch: true,
              targetAgentId: trigger.targetAgentId,
              trigger: trigger,
              reason: 'keyword_match'
            };
          }
        }
      }

      return { shouldSwitch: false, targetAgentId: currentAgentId };
    } catch (error) {
      this.logger.error('Error evaluating switch triggers', { userId, message, currentAgentId, chatId, error });
      return { shouldSwitch: false, targetAgentId: null };
    }
  }
}

export default AgentTriggerService;