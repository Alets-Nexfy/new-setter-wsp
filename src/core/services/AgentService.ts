import { EventEmitter } from 'events';
import { LoggerService } from './LoggerService';
import { DatabaseService } from './DatabaseService';
import { WorkerManagerService } from './WorkerManagerService';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';

export interface AgentPersona {
  name: string;
  role: string;
  language: string;
  tone: string;
  style: string;
  instructions: string;
  guidelines: string[];
}

export interface AgentKnowledge {
  files: string[];
  urls: string[];
  qandas: any[];
  writingSampleTxt: string;
}

export interface Agent {
  id: string;
  userId: string;
  persona: AgentPersona;
  knowledge: AgentKnowledge;
  isActive?: boolean;
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
}

export interface UpdateAgentRequest {
  userId: string;
  agentId: string;
  persona?: Partial<AgentPersona>;
  knowledge?: Partial<AgentKnowledge>;
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
  }

  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2009-2050
   * Get all agents for a user
   */
  public async getUserAgents(userId: string): Promise<Agent[]> {
    try {
      this.logger.debug('Getting user agents', { userId });

      const agentsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('agents')
        .orderBy('createdAt', 'desc')
        .get();

      const agents: Agent[] = [];
      agentsSnapshot.forEach(doc => {
        const data = doc.data();
        agents.push({
          id: doc.id,
          userId,
          persona: data.persona || {},
          knowledge: data.knowledge || {},
          isActive: this.activeAgents.get(userId) === doc.id,
          createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : new Date().toISOString()
        });
      });

      this.logger.debug('User agents retrieved', { 
        userId, 
        agentCount: agents.length 
      });

      return agents;

    } catch (error) {
      this.logger.error('Error getting user agents', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return empty array if user not found or no agents
      if (error instanceof Error && (error.message.includes('NOT_FOUND') || error.message.includes('5'))) {
        return [];
      }

      throw error;
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2051-2124
   * Create new agent for user
   */
  public async createAgent(request: CreateAgentRequest): Promise<Agent> {
    try {
      const { userId, persona, knowledge = {} } = request;

      this.logger.info('Creating new agent', { 
        userId, 
        agentName: persona.name 
      });

      // Validate required fields
      if (!persona.name || !persona.name.trim()) {
        throw new Error('Agent name is required');
      }

      // Verify user exists
      const userDoc = await this.db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const agentId = uuidv4();
      const timestamp = FieldValue.serverTimestamp();

      // Build complete agent configuration
      const agentData: Omit<Agent, 'createdAt' | 'updatedAt'> = {
        id: agentId,
        userId,
        persona: {
          name: persona.name.trim(),
          role: persona.role || 'Asistente',
          language: persona.language || 'es',
          tone: persona.tone || 'Amigable',
          style: persona.style || 'Conversacional',
          instructions: persona.instructions || 'Eres un asistente conversacional útil y amigable.',
          guidelines: persona.guidelines || []
        },
        knowledge: {
          files: knowledge.files || [],
          urls: knowledge.urls || [],
          qandas: knowledge.qandas || [],
          writingSampleTxt: knowledge.writingSampleTxt || ''
        }
      };

      // Save to Firestore
      await this.db
        .collection('users')
        .doc(userId)
        .collection('agents')
        .doc(agentId)
        .set({
          ...agentData,
          createdAt: timestamp,
          updatedAt: timestamp
        });

      // Notify worker if active
      this.notifyWorkerAgentChange(userId, 'RELOAD_AGENT_CONFIG');

      const createdAgent: Agent = {
        ...agentData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
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
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2152-2242
   * Update existing agent
   */
  public async updateAgent(request: UpdateAgentRequest): Promise<Agent> {
    try {
      const { userId, agentId, persona, knowledge } = request;

      this.logger.info('Updating agent', { userId, agentId });

      const agentDocRef = this.db
        .collection('users')
        .doc(userId)
        .collection('agents')
        .doc(agentId);

      // Check if agent exists
      const agentDoc = await agentDocRef.get();
      if (!agentDoc.exists) {
        throw new Error('Agent not found');
      }

      const currentData = agentDoc.data()!;
      const updateData: any = {
        updatedAt: FieldValue.serverTimestamp()
      };

      // Update persona if provided
      if (persona) {
        updateData.persona = {
          ...currentData.persona,
          ...persona
        };

        // Validate required persona fields
        if (persona.name !== undefined && !persona.name.trim()) {
          throw new Error('Agent name cannot be empty');
        }
      }

      // Update knowledge if provided
      if (knowledge) {
        updateData.knowledge = {
          ...currentData.knowledge,
          ...knowledge
        };
      }

      // Perform update
      await agentDocRef.update(updateData);

      // Check if this was the active agent and notify worker
      const activeAgentId = this.activeAgents.get(userId);
      if (activeAgentId === agentId) {
        // Fetch updated configuration and notify worker
        const updatedAgentDoc = await agentDocRef.get();
        const updatedConfig = updatedAgentDoc.data()!;
        
        this.logger.info('Notifying worker of active agent update', { userId, agentId });
        
        this.notifyWorkerAgentChange(userId, 'RELOAD_AGENT_CONFIG', {
          agentConfig: updatedConfig
        });
      }

      // Get updated agent data
      const updatedDoc = await agentDocRef.get();
      const updatedData = updatedDoc.data()!;

      const updatedAgent: Agent = {
        id: agentId,
        userId,
        persona: updatedData.persona,
        knowledge: updatedData.knowledge,
        isActive: this.activeAgents.get(userId) === agentId,
        createdAt: updatedData.createdAt?.toDate?.() ? updatedData.createdAt.toDate().toISOString() : new Date().toISOString(),
        updatedAt: updatedData.updatedAt?.toDate?.() ? updatedData.updatedAt.toDate().toISOString() : new Date().toISOString()
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
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2245-2311
   * Delete agent
   */
  public async deleteAgent(userId: string, agentId: string): Promise<void> {
    try {
      this.logger.info('Deleting agent', { userId, agentId });

      const agentDocRef = this.db
        .collection('users')
        .doc(userId)
        .collection('agents')
        .doc(agentId);

      const userDocRef = this.db.collection('users').doc(userId);

      // Check if agent exists
      const agentDoc = await agentDocRef.get();
      if (!agentDoc.exists) {
        throw new Error('Agent not found');
      }

      // Check if this is the active agent
      const userDoc = await userDocRef.get();
      let wasActiveAgent = false;
      
      if (userDoc.exists && userDoc.data()?.active_agent_id === agentId) {
        this.logger.info('Deactivating agent before deletion', { userId, agentId });
        
        // Remove as active agent
        await userDocRef.update({
          active_agent_id: null,
          updatedAt: FieldValue.serverTimestamp()
        });
        
        this.activeAgents.set(userId, null);
        wasActiveAgent = true;
      }

      // Delete the agent
      await agentDocRef.delete();

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
   * Get specific agent by ID
   */
  public async getAgent(userId: string, agentId: string): Promise<Agent> {
    try {
      this.logger.debug('Getting specific agent', { userId, agentId });

      const agentDoc = await this.db
        .collection('users')
        .doc(userId)
        .collection('agents')
        .doc(agentId)
        .get();

      if (!agentDoc.exists) {
        throw new Error('Agent not found');
      }

      const data = agentDoc.data()!;
      
      return {
        id: agentDoc.id,
        userId,
        persona: data.persona || {},
        knowledge: data.knowledge || {},
        isActive: this.activeAgents.get(userId) === agentDoc.id,
        createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.() ? data.updatedAt.toDate().toISOString() : new Date().toISOString()
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
   * MIGRADO DE: whatsapp-api/src/server.js líneas 1208-1255
   * Get active agent for user
   */
  public async getActiveAgent(userId: string): Promise<{ activeAgentId: string | null; agent?: Agent }> {
    try {
      this.logger.debug('Getting active agent', { userId });

      const userDoc = await this.db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      const userData = userDoc.data()!;
      const activeAgentId = userData.active_agent_id || null;
      
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
   * MIGRADO DE: whatsapp-api/src/server.js líneas 2313-2392
   * Set active agent for user
   */
  public async setActiveAgent(request: AgentSwitchRequest): Promise<{ activeAgentId: string | null; agent?: Agent }> {
    try {
      const { userId, agentId } = request;

      this.logger.info('Setting active agent', { userId, agentId });

      const userDocRef = this.db.collection('users').doc(userId);

      // Verify user exists
      const userDoc = await userDocRef.get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      let agentConfig: any = null;
      let agent: Agent | undefined;

      // If agentId is provided, verify agent exists and get config
      if (agentId) {
        const agentDocRef = this.db
          .collection('users')
          .doc(userId)
          .collection('agents')
          .doc(agentId);
        
        const agentDoc = await agentDocRef.get();
        if (!agentDoc.exists) {
          throw new Error(`Agent with ID ${agentId} not found for this user`);
        }

        agentConfig = agentDoc.data()!;
        agent = {
          id: agentDoc.id,
          userId,
          persona: agentConfig.persona || {},
          knowledge: agentConfig.knowledge || {},
          isActive: true,
          createdAt: agentConfig.createdAt?.toDate?.() ? agentConfig.createdAt.toDate().toISOString() : new Date().toISOString(),
          updatedAt: agentConfig.updatedAt?.toDate?.() ? agentConfig.updatedAt.toDate().toISOString() : new Date().toISOString()
        };
      }

      // Update user's active agent
      await userDocRef.update({
        active_agent_id: agentId,
        updatedAt: FieldValue.serverTimestamp()
      });

      // Update local cache
      this.activeAgents.set(userId, agentId);

      // Notify worker about agent switch
      this.logger.info('Notifying worker about agent switch', { 
        userId, 
        newAgentId: agentId || 'default'
      });

      this.notifyWorkerAgentChange(userId, 'SWITCH_AGENT', {
        agentId,
        agentConfig
      });

      this.emit('activeAgentChanged', { 
        userId, 
        previousAgentId: this.activeAgents.get(userId),
        newAgentId: agentId,
        agent 
      });

      this.logger.info('Active agent set successfully', { userId, agentId });

      return { activeAgentId: agentId, agent };

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
   * MIGRADO DE: whatsapp-api/src/server.js líneas 660-750
   * Get initial configuration for worker startup
   */
  public async getInitialConfiguration(userId: string, activeAgentId?: string | null): Promise<InitialConfiguration> {
    try {
      this.logger.info('Preparing initial configuration for worker', { 
        userId, 
        activeAgentId: activeAgentId || 'default' 
      });

      const userDocRef = this.db.collection('users').doc(userId);
      let agentConfig: AgentConfig | null = null;

      // 1. Get agent configuration
      if (activeAgentId) {
        try {
          const agentDocRef = userDocRef.collection('agents').doc(activeAgentId);
          const agentDoc = await agentDocRef.get();
          
          if (agentDoc.exists) {
            const agentData = agentDoc.data()!;
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

      // 2. Get rules
      const [rulesSnapshot, startersSnapshot, flowsSnapshot] = await Promise.all([
        userDocRef.collection('rules').get(),
        userDocRef.collection('gemini_starters').get(),
        userDocRef.collection('action_flows').get()
      ]);

      const rules = rulesSnapshot.docs.map(doc => doc.data());
      const starters = startersSnapshot.docs.map(doc => doc.data());
      const flows = flowsSnapshot.docs.map(doc => doc.data());

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
   * Get agent statistics
   */
  public async getAgentStatistics(userId: string): Promise<{
    totalAgents: number;
    activeAgent: string | null;
    defaultConfigUsage: boolean;
  }> {
    try {
      const agents = await this.getUserAgents(userId);
      const activeAgent = await this.getActiveAgent(userId);
      
      return {
        totalAgents: agents.length,
        activeAgent: activeAgent.activeAgentId,
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
        this.workerManager.sendCommand(userId, command, payload);
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