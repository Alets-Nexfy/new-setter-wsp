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

      // Get agent configuration
      const { data: agent, error } = await this.db
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .eq('user_id', userUuid)
        .single();

      if (error || !agent) {
        throw new Error('Agent not found');
      }

      // Check if this agent has its own network configuration
      let network = agent.config?.automation?.agentNetwork || [];
      let primaryAgentId = agentId;
      let activatedAgents = [];

      // If this agent has a network, use it
      if (network.length > 0) {
        this.logger.info('Agent has its own network configuration', { 
          agentId, 
          networkSize: network.length 
        });
        activatedAgents = [agentId]; // Start with primary agent
        
        // Add all agents in the network
        network.forEach((node: any) => {
          this.logger.debug('Processing network node', { 
            node, 
            agentId,
            nodeType: typeof node
          });
          
          // Handle both string IDs and objects with agentId
          const nodeAgentId = typeof node === 'string' ? node : node.agentId;
          
          if (nodeAgentId && nodeAgentId !== agentId) {
            activatedAgents.push(nodeAgentId);
          } else if (nodeAgentId === agentId) {
            // The agent itself might be listed in its own network, skip it
            this.logger.debug('Skipping agent itself in network', { agentId });
          }
        });
      } else {
        // Agent doesn't have its own network, check if it belongs to another agent's network
        this.logger.info('Agent has no network, checking if it belongs to another network', { agentId });
        
        const { data: allAgents } = await this.db
          .from('agents')
          .select('*')
          .eq('user_id', userUuid);
          
        if (allAgents) {
          for (const otherAgent of allAgents) {
            const otherNetwork = otherAgent.config?.automation?.agentNetwork || [];
            
            // Check if current agent is in this network
            const isInNetwork = otherNetwork.some((node: any) => {
              const nodeAgentId = typeof node === 'string' ? node : node.agentId;
              return nodeAgentId === agentId;
            });
            
            if (isInNetwork) {
              this.logger.info('Found agent in another network', { 
                agentId,
                networkOwner: otherAgent.id,
                networkSize: otherNetwork.length
              });
              
              // Use the network owner as primary
              primaryAgentId = otherAgent.id;
              network = otherNetwork;
              
              // Activate the network owner and all agents in the network
              activatedAgents = [primaryAgentId];
              network.forEach((node: any) => {
                const nodeAgentId = typeof node === 'string' ? node : node.agentId;
                if (nodeAgentId && nodeAgentId !== primaryAgentId) {
                  activatedAgents.push(nodeAgentId);
                }
              });
              break;
            }
          }
        }
        
        // If still no network found, just activate the single agent
        if (activatedAgents.length === 0) {
          this.logger.info('No network found, activating single agent', { agentId });
          activatedAgents = [agentId];
        }
      }

      // Update user's active agent to the primary
      await this.db
        .from('users')
        .update({
          active_agent_id: primaryAgentId,
          updated_at: new Date().toISOString()
        })
        .eq('id', userUuid);

      // Mark all agents in the network as active
      if (activatedAgents.length > 0) {
        this.logger.info('Activating agents in database', { 
          agentIds: activatedAgents 
        });
        
        // First, deactivate all user's agents
        await this.db
          .from('agents')
          .update({ 
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userUuid);
        
        // Then activate only the network agents
        const { error: activateError } = await this.db
          .from('agents')
          .update({ 
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .in('id', activatedAgents)
          .eq('user_id', userUuid);
          
        if (activateError) {
          this.logger.error('Error activating agents in database', { 
            error: activateError,
            agentIds: activatedAgents 
          });
        }
      }

      // Store active network in Redis for fast access
      const networkData = {
        primaryAgentId: primaryAgentId,
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
        primaryAgentId: primaryAgentId,
        activatedAgents,
        network
      });

      this.logger.info('Agent network activated successfully', {
        userId,
        primaryAgentId: primaryAgentId,
        totalAgents: activatedAgents.length,
        activatedAgents
      });

      return {
        primaryAgentId: primaryAgentId,
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

      // Get agent configuration from the active agent
      const { data: agent, error: agentError } = await this.db
        .from('agents')
        .select('*')
        .eq('id', user.active_agent_id)
        .eq('user_id', userUuid)
        .single();

      if (agentError || !agent) {
        return null;
      }

      // First, check if this agent IS the primary/default of its own network
      const agentNetwork = agent.config?.automation?.agentNetwork || [];
      
      this.logger.info('Checking agent network configuration', {
        agentId: user.active_agent_id,
        hasNetwork: agentNetwork.length > 0,
        networkSize: agentNetwork.length,
        networkNodes: agentNetwork
      });
      
      // The network is valid if:
      // 1. It has agents AND
      // 2. This agent owns the network (it was configured from this agent)
      const isThisPrimaryOfOwnNetwork = agentNetwork.length > 0;
      
      this.logger.info('Network ownership check', {
        agentId: user.active_agent_id,
        isThisPrimaryOfOwnNetwork,
        networkSize: agentNetwork.length
      });
      
      if (isThisPrimaryOfOwnNetwork) {
        // This agent is the primary of its own network
        this.logger.debug('Agent is primary of its own network', {
          agentId: user.active_agent_id,
          networkSize: agentNetwork.length
        });
        
        // Handle both array of strings and array of objects
        let activeAgents;
        if (Array.isArray(agentNetwork)) {
          // If it's an array of strings, use them directly
          if (typeof agentNetwork[0] === 'string') {
            activeAgents = agentNetwork;
          } else {
            // If it's an array of objects, extract agentId
            activeAgents = agentNetwork.map((n: any) => n.agentId).filter(Boolean);
          }
        } else {
          activeAgents = [];
        }
        
        this.logger.info('Returning agent network configuration', {
          agentId: user.active_agent_id,
          activeAgents,
          networkType: typeof agentNetwork[0]
        });
        
        return {
          activeAgents,
          defaultAgent: user.active_agent_id,
          triggerConfig: agent.config?.automation?.triggers || {},
          switchingBehavior: {
            preserveContext: true,
            announceSwitch: false,
            maxSwitchesPerHour: 10
          },
          maxActiveAgents: 3
        };
      }
      
      // If not primary of own network, look for a network that includes this agent
      const { data: allAgents } = await this.db
        .from('agents')
        .select('*')
        .eq('user_id', userUuid);
        
      if (allAgents) {
        for (const otherAgent of allAgents) {
          if (otherAgent.id === user.active_agent_id) continue;
          
          const otherNetwork = otherAgent.config?.automation?.agentNetwork || [];
          
          // Check if current agent is in this network
          const isInThisNetwork = otherNetwork.some((node: any) => 
            node.agentId === user.active_agent_id
          );
          
          if (isInThisNetwork) {
            this.logger.debug('Agent found in another network', {
              currentAgent: user.active_agent_id,
              networkOwner: otherAgent.id,
              networkSize: otherNetwork.length
            });
            
            // Handle both array of strings and array of objects
            let activeAgents;
            if (Array.isArray(otherNetwork)) {
              // If it's an array of strings, use them directly
              if (typeof otherNetwork[0] === 'string') {
                activeAgents = otherNetwork;
              } else {
                // If it's an array of objects, extract agentId
                activeAgents = otherNetwork.map((n: any) => n.agentId).filter(Boolean);
              }
            } else {
              activeAgents = [];
            }
            
            return {
              activeAgents,
              defaultAgent: otherAgent.id,
              triggerConfig: otherAgent.config?.automation?.triggers || {},
              switchingBehavior: {
                preserveContext: true,
                announceSwitch: false,
                maxSwitchesPerHour: 10
              },
              maxActiveAgents: 3
            };
          }
        }
      }
      
      // No network found - return null to indicate no configuration
      this.logger.debug('No network configuration found for agent', {
        agentId: user.active_agent_id
      });
      
      return null;
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

      // Use the defaultAgent from updates, not the active agent
      const targetAgentId = updates.defaultAgent;
      
      if (!targetAgentId) {
        this.logger.error('[AgentTriggerService] No defaultAgent specified in updates', {
          userUuid
        });
        return false;
      }

      this.logger.info('[AgentTriggerService] Saving config to agent', {
        targetAgentId,
        userUuid
      });

      // Update agent configuration for the defaultAgent
      const { data: agent, error: agentError } = await this.db
        .from('agents')
        .select('config')
        .eq('id', targetAgentId)
        .eq('user_id', userUuid)
        .single();

      if (agentError) {
        this.logger.error('[AgentTriggerService] Error fetching agent:', {
          error: agentError.message,
          agentId: targetAgentId,
          userUuid
        });
        return false;
      }

      if (!agent) {
        this.logger.warn('[AgentTriggerService] Agent not found', {
          agentId: targetAgentId,
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
        .eq('id', targetAgentId)
        .eq('user_id', userUuid);

      if (updateError) {
        this.logger.error('[AgentTriggerService] Error updating agent config:', {
          error: updateError.message,
          agentId: targetAgentId,
          userUuid
        });
        return false;
      }

      this.logger.info('[AgentTriggerService] Multi-agent config updated successfully', {
        agentId: targetAgentId,
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