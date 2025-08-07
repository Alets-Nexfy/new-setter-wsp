import { EventEmitter } from 'events';
import { LoggerService } from './LoggerService';
import { SupabaseService as DatabaseService } from './SupabaseService';
import { WorkerManagerService } from './WorkerManagerService';
import { AgentTriggerService } from './AgentTriggerService';
import { v4 as uuidv4 } from 'uuid';

export interface AgentPersona {
  name: string;
  role: string;
  language: string;
  tone: string;
  style: string;
  instructions: string;
  guidelines: string[];
  systemMessage?: string;
  guardrails?: string;
  defaultResponse?: string;
}

export interface AgentTrigger {
  id: string;
  type: 'message' | 'keyword' | 'lead' | 'manual';
  enabled: boolean;
  conditions?: string[];
}

export interface AgentKnowledge {
  files: string[];
  urls: string[];
  qandas: any[];
  writingSampleTxt: string;
  externalUrls?: { url: string; description: string }[];
  knowledgeNotes?: string[];
}

export interface AgentAutomation {
  triggers: AgentTrigger[];
  customLogic?: string;
  useCustomLogic: boolean;
  actionTriggers?: { text: string; type: string }[];
}

export interface AgentMetrics {
  totalConversations: number;
  avgResponseTime: number;
  lastActive?: string;
  successRate?: number;
}

export interface Agent {
  id: string;
  userId: string;
  persona: AgentPersona;
  knowledge: AgentKnowledge;
  automation?: AgentAutomation;
  metrics?: AgentMetrics;
  whatsappNumber?: string;
  isActive?: boolean;
  isPrimary?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  id: string | null;
  persona: AgentPersona;
  knowledge: AgentKnowledge;
}

export interface CreateAgentRequest {
  userId: string;
  persona: Partial<AgentPersona> & { name: string };
  knowledge?: Partial<AgentKnowledge>;
  automation?: Partial<AgentAutomation>;
  whatsappNumber?: string;
}

export interface UpdateAgentRequest {
  userId: string;
  agentId: string;
  persona?: Partial<AgentPersona>;
  knowledge?: Partial<AgentKnowledge>;
  automation?: Partial<AgentAutomation>;
  whatsappNumber?: string;
  isActive?: boolean;
}

export interface AgentSwitchRequest {
  userId: string;
  agentId: string | null;
}

export interface InitialConfiguration {
  agentConfig: AgentConfig | null;
  rules: any[];
  starters: any[];
  flows: any[];
}

export class AgentService extends EventEmitter {
  private static instance: AgentService;
  private logger: LoggerService;
  private db: DatabaseService;
  private workerManager: WorkerManagerService;
  private triggerService: AgentTriggerService;

  // Agent state tracking
  private activeAgents: Map<string, string | null> = new Map(); // userId -> agentId

  // Default agent configuration
  private readonly DEFAULT_AGENT_CONFIG: AgentConfig = {
    id: null,
    persona: {
      name: 'Agente IA (Default)',
      role: 'Asistente',
      language: 'es',
      tone: 'Neutral',
      style: 'Directo',
      instructions: 'Eres un asistente conversacional útil y amigable.',
      guidelines: []
    },
    knowledge: {
      files: [],
      urls: [],
      qandas: [],
      writingSampleTxt: ''
    }
  };

  private constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.db = DatabaseService.getInstance();
    this.workerManager = WorkerManagerService.getInstance();
    this.triggerService = AgentTriggerService.getInstance();
  }

  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  /**
   * MIGRATED TO SUPABASE: Get all agents for a user with network status
   */
  public async getUserAgents(userId: string): Promise<Agent[]> {
    try {
      this.logger.debug('Getting user agents with network status', { userId });

      // Extract UUID from prefixed userId if needed
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      // Get user's active agent ID
      const { data: userData, error: userError } = await this.db
        .from('users')
        .select('active_agent_id')
        .eq('id', userUuid)
        .single();

      const activeAgentId = userData?.active_agent_id || null;

      // Get active network to check which agents are part of it
      const activeNetwork = await this.triggerService.getActiveNetwork(userId);
      const activeNetworkAgentIds = new Set<string>();
      
      if (activeNetwork) {
        // Add primary agent
        activeNetworkAgentIds.add(activeNetwork.primaryAgentId);
        
        // Add all network nodes
        if (activeNetwork.nodes) {
          activeNetwork.nodes.forEach((node: any) => {
            if (node.agentId) {
              activeNetworkAgentIds.add(node.agentId);
            }
          });
        }
      }

      const { data: agents, error } = await this.db
        .from('agents')
        .select('*')
        .eq('user_id', userUuid)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const result = (agents || []).map(agent => ({
        id: agent.id,
        userId,
        persona: agent.config?.persona || {},
        knowledge: agent.config?.knowledge || {},
        automation: agent.config?.automation || null,
        metrics: agent.performance || null,
        whatsappNumber: agent.config?.whatsappNumber || null,
        isActive: activeNetworkAgentIds.has(agent.id), // Check if part of active network
        isPrimary: agent.id === activeAgentId, // Mark if it's the primary active agent
        createdAt: agent.created_at,
        updatedAt: agent.updated_at
      }));

      this.logger.debug('User agents retrieved with network status', { 
        userId, 
        agentCount: result.length,
        activeAgentId,
        activeNetworkSize: activeNetworkAgentIds.size
      });

      return result;

    } catch (error) {
      this.logger.error('Error getting user agents', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return [];
    }
  }

  /**
   * MIGRATED TO SUPABASE: Create new agent for user
   */
  public async createAgent(request: CreateAgentRequest): Promise<Agent> {
    try {
      const { userId, persona, knowledge = {}, automation, whatsappNumber } = request;

      this.logger.info('Creating new agent', { 
        userId, 
        agentName: persona.name 
      });

      // Validate required fields
      if (!persona.name || !persona.name.trim()) {
        throw new Error('Agent name is required');
      }

      // Verify user exists - extract UUID from prefixed userId if needed
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      let { data: user, error: userError } = await this.db
        .from('users')
        .select('id')
        .eq('id', userUuid)
        .single();

      // If user doesn't exist, create the user record
      if (userError || !user) {
        this.logger.info('User not found during agent creation, creating user record', { userId, userUuid });
        
        const { data: newUser, error: createError } = await this.db
          .from('users')
          .insert({
            id: userUuid,
            active_agent_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('id')
          .single();
          
        if (createError) {
          this.logger.error('Failed to create user record during agent creation', { userId, userUuid, error: createError.message });
          throw new Error('Failed to create user record');
        }
        
        user = newUser;
        this.logger.info('User record created successfully during agent creation', { userId, userUuid });
      }

      const agentId = uuidv4();
      const now = new Date().toISOString();

      // Build agent configuration compatible with existing table structure
      const agentData = {
        id: agentId,
        user_id: userUuid, // Use the extracted UUID
        name: persona.name.trim(),
        agent_type: persona.role || 'Asistente',
        config: {
          persona: {
            name: persona.name.trim(),
            role: persona.role || 'Asistente',
            language: persona.language || 'es',
            tone: persona.tone || 'Amigable',
            style: persona.style || 'Conversacional',
            instructions: persona.instructions || 'Eres un asistente conversacional útil y amigable.',
            guidelines: persona.guidelines || [],
            systemMessage: persona.systemMessage,
            guardrails: persona.guardrails,
            defaultResponse: persona.defaultResponse
          },
          knowledge: {
            files: knowledge.files || [],
            urls: knowledge.urls || [],
            qandas: knowledge.qandas || [],
            writingSampleTxt: knowledge.writingSampleTxt || '',
            externalUrls: knowledge.externalUrls || [],
            knowledgeNotes: knowledge.knowledgeNotes || []
          },
          automation: automation ? {
            triggers: automation.triggers || [],
            customLogic: automation.customLogic || '',
            useCustomLogic: automation.useCustomLogic || false,
            actionTriggers: automation.actionTriggers || []
          } : null,
          whatsappNumber: whatsappNumber || null
        },
        is_active: true,
        is_default: false,
        performance: {
          totalConversations: 0,
          avgResponseTime: 0,
          lastActive: null,
          successRate: 0
        },
        created_at: now,
        updated_at: now
      };

      // Save to Supabase
      const { data: createdAgentData, error } = await this.db
        .from('agents')
        .insert(agentData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Notify worker if active
      this.notifyWorkerAgentChange(userId, 'RELOAD_AGENT_CONFIG');

      const createdAgent: Agent = {
        id: createdAgentData.id,
        userId,
        persona: createdAgentData.config?.persona || {},
        knowledge: createdAgentData.config?.knowledge || {},
        automation: createdAgentData.config?.automation || null,
        metrics: createdAgentData.performance || null,
        whatsappNumber: createdAgentData.config?.whatsappNumber || null,
        isActive: createdAgentData.is_active,
        createdAt: createdAgentData.created_at,
        updatedAt: createdAgentData.updated_at
      };

      this.emit('agentCreated', { userId, agent: createdAgent });

      this.logger.info('Agent created successfully', {
        userId,
        agentId,
        agentName: persona.name
      });

      return createdAgent;

    } catch (error) {
      this.logger.error('Error creating agent', {
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        errorDetails: error
      });
      throw error;
    }
  }

  /**
   * MIGRATED TO SUPABASE: Update existing agent
   */
  public async updateAgent(request: UpdateAgentRequest): Promise<Agent> {
    try {
      const { userId, agentId, persona, knowledge, automation, whatsappNumber, isActive } = request;

      this.logger.info('Updating agent', { userId, agentId });

      // Extract UUID from prefixed userId if needed
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      // Check if agent exists
      const { data: existingAgent, error: fetchError } = await this.db
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .eq('user_id', userUuid)
        .single();

      if (fetchError || !existingAgent) {
        throw new Error('Agent not found');
      }

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Update persona if provided
      if (persona) {
        updateData.config = {
          ...existingAgent.config,
          persona: {
            ...existingAgent.config?.persona,
            ...persona
          }
        };

        // Validate required persona fields
        if (persona.name !== undefined && !persona.name.trim()) {
          throw new Error('Agent name cannot be empty');
        }
      }

      // Update knowledge if provided
      if (knowledge) {
        updateData.config = {
          ...updateData.config || existingAgent.config,
          knowledge: {
            ...existingAgent.config?.knowledge,
            ...knowledge
          }
        };
      }

      // Update automation if provided
      if (automation) {
        updateData.config = {
          ...updateData.config || existingAgent.config,
          automation: {
            ...existingAgent.config?.automation,
            ...automation
          }
        };
      }

      // Update WhatsApp number if provided
      if (whatsappNumber !== undefined) {
        updateData.config = {
          ...updateData.config || existingAgent.config,
          whatsappNumber: whatsappNumber
        };
      }

      // Update active status if provided
      if (isActive !== undefined) {
        updateData.is_active = isActive;
      }

      // Perform update
      const { data: updatedAgentData, error: updateError } = await this.db
        .from('agents')
        .update(updateData)
        .eq('id', agentId)
        .eq('user_id', userUuid)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      // Check if this was the active agent and notify worker
      const activeAgentId = this.activeAgents.get(userId);
      if (activeAgentId === agentId) {
        this.logger.info('Notifying worker of active agent update', { userId, agentId });
        
        this.notifyWorkerAgentChange(userId, 'RELOAD_AGENT_CONFIG', {
          agentConfig: updatedAgentData
        });
      }

      const updatedAgent: Agent = {
        id: agentId,
        userId,
        persona: updatedAgentData.config?.persona || {},
        knowledge: updatedAgentData.config?.knowledge || {},
        automation: updatedAgentData.config?.automation || null,
        metrics: updatedAgentData.performance || null,
        whatsappNumber: updatedAgentData.config?.whatsappNumber || null,
        isActive: updatedAgentData.is_active,
        createdAt: updatedAgentData.created_at,
        updatedAt: updatedAgentData.updated_at
      };

      this.emit('agentUpdated', { userId, agent: updatedAgent });

      this.logger.info('Agent updated successfully', { userId, agentId });
      return updatedAgent;

    } catch (error) {
      this.logger.error('Error updating agent', {
        userId: request.userId,
        agentId: request.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * MIGRATED TO SUPABASE: Delete agent
   */
  public async deleteAgent(userId: string, agentId: string): Promise<void> {
    try {
      this.logger.info('Deleting agent', { userId, agentId });

      // Extract UUID from prefixed userId if needed
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      // Check if agent exists
      const { data: agent, error: fetchError } = await this.db
        .from('agents')
        .select('id')
        .eq('id', agentId)
        .eq('user_id', userUuid)
        .single();

      if (fetchError || !agent) {
        throw new Error('Agent not found');
      }

      // Check if this is the active agent
      const { data: user, error: userError } = await this.db
        .from('users')
        .select('active_agent_id')
        .eq('id', userUuid)
        .single();

      let wasActiveAgent = false;
      
      if (!userError && user && user.active_agent_id === agentId) {
        this.logger.info('Deactivating agent before deletion', { userId, agentId });
        
        // Remove as active agent
        const { error: updateError } = await this.db
          .from('users')
          .update({ 
            active_agent_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', userUuid);

        if (updateError) {
          this.logger.warn('Failed to clear active agent before deletion', { userId, agentId, error: updateError.message });
        }
        
        this.activeAgents.set(userId, null);
        wasActiveAgent = true;
      }

      // Delete the agent
      const { error: deleteError } = await this.db
        .from('agents')
        .delete()
        .eq('id', agentId)
        .eq('user_id', userUuid);

      if (deleteError) {
        throw deleteError;
      }

      // Notify worker if this was the active agent
      if (wasActiveAgent) {
        this.logger.info('Notifying worker of active agent deletion', { userId });
        
        this.notifyWorkerAgentChange(userId, 'SWITCH_AGENT', {
          agentId: null,
          agentConfig: null
        });
      }

      this.emit('agentDeleted', { userId, agentId, wasActive: wasActiveAgent });

      this.logger.info('Agent deleted successfully', { userId, agentId });

    } catch (error) {
      this.logger.error('Error deleting agent', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * MIGRATED TO SUPABASE: Get specific agent by ID
   */
  public async getAgent(userId: string, agentId: string): Promise<Agent> {
    try {
      this.logger.debug('Getting specific agent', { userId, agentId });

      // Extract UUID from prefixed userId if needed
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      const { data: agent, error } = await this.db
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .eq('user_id', userUuid)
        .single();

      if (error || !agent) {
        throw new Error('Agent not found');
      }
      
      return {
        id: agent.id,
        userId,
        persona: agent.config?.persona || {},
        knowledge: agent.config?.knowledge || {},
        automation: agent.config?.automation || null,
        metrics: agent.performance || null,
        whatsappNumber: agent.config?.whatsappNumber || null,
        isActive: this.activeAgents.get(userId) === agent.id,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at
      };

    } catch (error) {
      this.logger.error('Error getting agent', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * MIGRATED TO SUPABASE: Get active agent for user
   */
  public async getActiveAgent(userId: string): Promise<{ activeAgentId: string | null; agent?: Agent }> {
    try {
      this.logger.debug('Getting active agent', { userId });

      // Extract UUID from prefixed userId (tribe-ia-nexus_uuid -> uuid)
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      let { data: user, error: userError } = await this.db
        .from('users')
        .select('active_agent_id')
        .eq('id', userUuid)
        .single();
      
      // If user doesn't exist, create the user record
      if (userError || !user) {
        this.logger.info('User not found, creating user record', { userId, userUuid });
        
        const { data: newUser, error: createError } = await this.db
          .from('users')
          .insert({
            id: userUuid,
            active_agent_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('active_agent_id')
          .single();
          
        if (createError) {
          this.logger.error('Failed to create user record', { userId, userUuid, error: createError.message });
          throw new Error('Failed to create user record');
        }
        
        user = newUser;
        this.logger.info('User record created successfully', { userId, userUuid });
      }

      const activeAgentId = user.active_agent_id || null;
      
      // Update local cache
      this.activeAgents.set(userId, activeAgentId);

      if (!activeAgentId) {
        return { activeAgentId: null };
      }

      // Get agent details
      const agent = await this.getAgent(userId, activeAgentId);
      
      return { 
        activeAgentId, 
        agent 
      };

    } catch (error) {
      this.logger.error('Error getting active agent', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * MIGRATED TO SUPABASE: Set active agent for user with network support
   */
  public async setActiveAgent(request: AgentSwitchRequest): Promise<{ activeAgentId: string | null; agent?: Agent; network?: any }> {
    try {
      const { userId, agentId } = request;

      this.logger.info('Setting active agent with network support', { userId, agentId });

      // Verify user exists - extract UUID from prefixed userId if needed
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      let { data: user, error: userError } = await this.db
        .from('users')
        .select('id')
        .eq('id', userUuid)
        .single();

      // If user doesn't exist, create the user record
      if (userError || !user) {
        this.logger.info('User not found during setActiveAgent, creating user record', { userId, userUuid });
        
        const { data: newUser, error: createError } = await this.db
          .from('users')
          .insert({
            id: userUuid,
            active_agent_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('id')
          .single();
          
        if (createError) {
          this.logger.error('Failed to create user record during setActiveAgent', { userId, userUuid, error: createError.message });
          throw new Error('Failed to create user record');
        }
        
        user = newUser;
        this.logger.info('User record created successfully during setActiveAgent', { userId, userUuid });
      }

      let agentConfig: any = null;
      let agent: Agent | undefined;
      let networkResult: any = null;

      // If agentId is provided, verify agent exists and activate its network
      if (agentId) {
        const { data: agentData, error: agentError } = await this.db
          .from('agents')
          .select('*')
          .eq('id', agentId)
          .eq('user_id', userUuid)
          .single();
        
        if (agentError || !agentData) {
          throw new Error(`Agent with ID ${agentId} not found for this user`);
        }

        agentConfig = agentData;
        agent = {
          id: agentData.id,
          userId,
          persona: agentData.config?.persona || agentData.persona || {},
          knowledge: agentData.config?.knowledge || agentData.knowledge || {},
          automation: agentData.config?.automation || null,
          isActive: true,
          createdAt: agentData.created_at,
          updatedAt: agentData.updated_at
        };

        // Activate the agent's network (this includes updating user's active_agent_id)
        try {
          networkResult = await this.triggerService.activateAgentNetwork(userId, agentId);
          this.logger.info('Agent network activated', { 
            userId, 
            agentId,
            activatedAgents: networkResult.activatedAgents 
          });
        } catch (networkError) {
          // If network activation fails, still set the agent as active
          this.logger.warn('Failed to activate agent network, continuing with single agent', {
            userId,
            agentId,
            error: networkError instanceof Error ? networkError.message : 'Unknown error'
          });

          // Fallback: just update the active agent without network
          await this.db
            .from('users')
            .update({ 
              active_agent_id: agentId,
              updated_at: new Date().toISOString()
            })
            .eq('id', userUuid);
        }
      } else {
        // Deactivate any existing network when setting to null
        try {
          const currentActive = this.activeAgents.get(userId);
          if (currentActive) {
            await this.triggerService.deactivateAgentNetwork(userId, currentActive);
          }
        } catch (deactivateError) {
          this.logger.warn('Failed to deactivate previous network', {
            userId,
            error: deactivateError instanceof Error ? deactivateError.message : 'Unknown error'
          });
        }

        // Clear active agent
        await this.db
          .from('users')
          .update({ 
            active_agent_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', userUuid);
      }

      // Update local cache
      this.activeAgents.set(userId, agentId);

      // Notify worker about agent switch
      this.logger.info('Notifying worker about agent switch', { 
        userId, 
        newAgentId: agentId || 'default',
        hasNetwork: !!networkResult
      });

      this.notifyWorkerAgentChange(userId, 'SWITCH_AGENT', {
        agentId,
        agentConfig,
        network: networkResult
      });

      this.emit('activeAgentChanged', { 
        userId, 
        previousAgentId: this.activeAgents.get(userId),
        newAgentId: agentId,
        agent,
        network: networkResult
      });

      this.logger.info('Active agent set successfully with network', { 
        userId, 
        agentId,
        networkSize: networkResult?.activatedAgents?.length || 0
      });

      return { 
        activeAgentId: agentId, 
        agent,
        network: networkResult
      };

    } catch (error) {
      this.logger.error('Error setting active agent', {
        userId: request.userId,
        agentId: request.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * MIGRATED TO SUPABASE: Get initial configuration for worker startup
   */
  public async getInitialConfiguration(userId: string, activeAgentId?: string | null): Promise<InitialConfiguration> {
    try {
      this.logger.info('Preparing initial configuration for worker', { 
        userId, 
        activeAgentId: activeAgentId || 'default' 
      });

      // Extract UUID from prefixed userId if needed
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      let agentConfig: AgentConfig | null = null;

      // 1. Get agent configuration
      if (activeAgentId) {
        try {
          const { data: agentData, error } = await this.db
            .from('agents')
            .select('*')
            .eq('id', activeAgentId)
            .eq('user_id', userUuid)
            .single();
          
          if (!error && agentData) {
            agentConfig = {
              id: activeAgentId,
              persona: agentData.persona || this.DEFAULT_AGENT_CONFIG.persona,
              knowledge: agentData.knowledge || this.DEFAULT_AGENT_CONFIG.knowledge
            };
            this.logger.debug('Agent configuration found', { activeAgentId });
          } else {
            this.logger.warn('Agent specified but not found, using default', { activeAgentId });
            agentConfig = this.DEFAULT_AGENT_CONFIG;
          }
        } catch (error) {
          this.logger.error('Error loading agent config, using default', { 
            activeAgentId, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          agentConfig = this.DEFAULT_AGENT_CONFIG;
        }
      } else {
        this.logger.debug('No active agent specified, using default');
        agentConfig = this.DEFAULT_AGENT_CONFIG;
      }

      // 2. Get rules, starters, and flows
      const [
        { data: rules = [] },
        { data: starters = [] },
        { data: flows = [] }
      ] = await Promise.all([
        this.db.from('automation_rules').select('*').eq('user_id', userUuid),
        this.db.from('gemini_starters').select('*').eq('user_id', userUuid),
        this.db.from('action_flows').select('*').eq('user_id', userUuid)
      ]);

      this.logger.info('Initial configuration loaded', {
        userId,
        rulesCount: rules.length,
        startersCount: starters.length,
        flowsCount: flows.length,
        hasAgentConfig: !!agentConfig
      });

      return {
        agentConfig,
        rules,
        starters,
        flows
      };

    } catch (error) {
      this.logger.error('Error getting initial configuration', {
        userId,
        activeAgentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return minimal configuration on error
      return {
        agentConfig: this.DEFAULT_AGENT_CONFIG,
        rules: [],
        starters: [],
        flows: []
      };
    }
  }

  /**
   * Get agent configuration for AI processing
   */
  public async getAgentConfigForAI(userId: string, agentId?: string | null): Promise<AgentConfig> {
    try {
      if (!agentId) {
        const activeAgent = await this.getActiveAgent(userId);
        agentId = activeAgent.activeAgentId;
      }

      if (!agentId) {
        return this.DEFAULT_AGENT_CONFIG;
      }

      const agent = await this.getAgent(userId, agentId);
      
      return {
        id: agent.id,
        persona: agent.persona,
        knowledge: agent.knowledge
      };

    } catch (error) {
      this.logger.error('Error getting agent config for AI', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return this.DEFAULT_AGENT_CONFIG;
    }
  }

  /**
   * Create default agent for new user
   */
  public async createDefaultAgent(userId: string): Promise<Agent> {
    return await this.createAgent({
      userId,
      persona: {
        name: 'Asistente Personal',
        role: 'Asistente virtual',
        language: 'es',
        tone: 'Amigable',
        style: 'Conversacional',
        instructions: 'Eres un asistente virtual amigable y útil. Ayuda a los usuarios con sus consultas de manera clara y profesional.',
        guidelines: ['Sé cortés y respetuoso', 'Proporciona respuestas útiles y precisas', 'Mantén un tono profesional pero amigable']
      },
      knowledge: {
        files: [],
        urls: [],
        qandas: [],
        writingSampleTxt: ''
      }
    });
  }

  /**
   * Check if an agent is active (either primary or part of active network)
   */
  public async isAgentActive(userId: string, agentId: string): Promise<boolean> {
    try {
      // Check if it's the primary active agent
      const { activeAgentId } = await this.getActiveAgent(userId);
      if (activeAgentId === agentId) {
        return true;
      }

      // Check if it's part of the active network
      return await this.triggerService.isAgentInActiveNetwork(userId, agentId);

    } catch (error) {
      this.logger.error('Error checking if agent is active', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get agent statistics
   */
  public async getAgentStatistics(userId: string): Promise<{
    totalAgents: number;
    activeAgent: string | null;
    activeNetwork: any;
    defaultConfigUsage: boolean;
  }> {
    try {
      const agents = await this.getUserAgents(userId);
      const activeAgent = await this.getActiveAgent(userId);
      const activeNetwork = await this.triggerService.getActiveNetwork(userId);
      
      return {
        totalAgents: agents.length,
        activeAgent: activeAgent.activeAgentId,
        activeNetwork,
        defaultConfigUsage: !activeAgent.activeAgentId
      };

    } catch (error) {
      this.logger.error('Error getting agent statistics', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        totalAgents: 0,
        activeAgent: null,
        activeNetwork: null,
        defaultConfigUsage: true
      };
    }
  }

  /**
   * Validate agent configuration
   */
  public validateAgentConfig(agentConfig: Partial<AgentConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (agentConfig.persona) {
      if (!agentConfig.persona.name || !agentConfig.persona.name.trim()) {
        errors.push('Agent name is required');
      }
      
      if (agentConfig.persona.name && agentConfig.persona.name.length > 100) {
        errors.push('Agent name must be less than 100 characters');
      }
      
      if (agentConfig.persona.instructions && agentConfig.persona.instructions.length > 5000) {
        errors.push('Instructions must be less than 5000 characters');
      }
    }

    if (agentConfig.knowledge) {
      if (agentConfig.knowledge.writingSampleTxt && agentConfig.knowledge.writingSampleTxt.length > 2000) {
        errors.push('Writing sample must be less than 2000 characters');
      }
      
      if (agentConfig.knowledge.urls && agentConfig.knowledge.urls.length > 10) {
        errors.push('Maximum 10 URLs allowed');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Notify worker about agent changes
   */
  private notifyWorkerAgentChange(userId: string, command: string, payload?: any): void {
    try {
      if (this.workerManager.isWorkerActive(userId)) {
        this.workerManager.sendCommand(userId, command);
        this.logger.debug('Worker notified of agent change', { userId, command });
      } else {
        this.logger.debug('No active worker to notify', { userId, command });
      }
    } catch (error) {
      this.logger.error('Error notifying worker of agent change', {
        userId,
        command,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.logger.info('Cleaning up agent service');
    this.activeAgents.clear();
    this.removeAllListeners();
  }

  /**
   * Get service status
   */
  public getServiceStatus(): {
    trackedUsers: number;
    activeAgentsCount: number;
  } {
    const activeAgentsCount = Array.from(this.activeAgents.values())
      .filter(agentId => agentId !== null).length;

    return {
      trackedUsers: this.activeAgents.size,
      activeAgentsCount
    };
  }

  /**
   * Get default agent configuration
   */
  public getDefaultConfig(): AgentConfig {
    return JSON.parse(JSON.stringify(this.DEFAULT_AGENT_CONFIG));
  }
} 