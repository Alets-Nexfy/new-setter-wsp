import { LoggerService } from './LoggerService';
import { SupabaseService } from './SupabaseService';
import { CacheService } from './CacheService';
import { UserTierService } from './UserTierService';
import { 
  AgentTrigger, 
  MultiAgentConfiguration, 
  TriggerMatchResult,
  AgentSwitchReason 
} from '../types/MultiAgent';

export class AgentTriggerService {
  private static instance: AgentTriggerService;
  private readonly logger: LoggerService;
  private readonly db: DatabaseService;
  private readonly cache: CacheService;
  private readonly tierService: UserTierService;

  private constructor() {
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.tierService = UserTierService.getInstance();
  }

  public static getInstance(): AgentTriggerService {
    if (!AgentTriggerService.instance) {
      AgentTriggerService.instance = new AgentTriggerService();
    }
    return AgentTriggerService.instance;
  }

  /**
   * Evalúa triggers iniciales para determinar qué agente debe manejar un nuevo chat
   */
  async evaluateInitialTriggers(
    userId: string, 
    message: string, 
    chatId: string
  ): Promise<TriggerMatchResult> {
    try {
      const config = await this.getMultiAgentConfig(userId);
      if (!config) {
        return { matched: false, confidence: 0, reason: 'No multi-agent config found' };
      }

      const matches: Array<{ agentId: string; trigger: AgentTrigger; confidence: number }> = [];

      // Evaluar triggers iniciales para cada agente activo
      for (const agentId of config.activeAgents) {
        const triggers = config.triggerConfig.initial[agentId] || [];
        
        for (const trigger of triggers) {
          const confidence = this.evaluateTriggerMatch(message, trigger);
          if (confidence > 0) {
            matches.push({ agentId, trigger, confidence });
          }
        }
      }

      // Ordenar por confianza y prioridad
      matches.sort((a, b) => {
        const scoreA = a.confidence * (a.trigger.priority / 10);
        const scoreB = b.confidence * (b.trigger.priority / 10);
        return scoreB - scoreA;
      });

      if (matches.length > 0) {
        const bestMatch = matches[0];
        return {
          matched: true,
          agentId: bestMatch.agentId,
          trigger: bestMatch.trigger,
          confidence: bestMatch.confidence,
          reason: `Initial trigger matched: "${bestMatch.trigger.keyword}"`
        };
      }

      // Fallback al agente por defecto
      return {
        matched: true,
        agentId: config.defaultAgent,
        confidence: 0.1,
        reason: 'Using default agent (no initial triggers matched)'
      };

    } catch (error) {
      this.logger.error('Error evaluating initial triggers:', error);
      return { matched: false, confidence: 0, reason: 'Error evaluating triggers' };
    }
  }

  /**
   * Evalúa triggers de cambio durante una conversación
   */
  async evaluateSwitchTriggers(
    userId: string,
    message: string,
    currentAgentId: string,
    chatId: string
  ): Promise<TriggerMatchResult> {
    try {
      const config = await this.getMultiAgentConfig(userId);
      if (!config) {
        return { matched: false, confidence: 0, reason: 'No multi-agent config found' };
      }

      const matches: Array<{ agentId: string; trigger: AgentTrigger; confidence: number }> = [];

      // Evaluar triggers de cambio para todos los agentes activos (excepto el actual)
      for (const agentId of config.activeAgents) {
        if (agentId === currentAgentId) continue;

        const triggers = config.triggerConfig.switch[agentId] || [];
        
        for (const trigger of triggers) {
          // Verificar condiciones adicionales
          if (await this.checkTriggerConditions(trigger, chatId, currentAgentId)) {
            const confidence = this.evaluateTriggerMatch(message, trigger);
            if (confidence > 0) {
              matches.push({ agentId, trigger, confidence });
            }
          }
        }
      }

      // Ordenar por confianza y prioridad
      matches.sort((a, b) => {
        const scoreA = a.confidence * (a.trigger.priority / 10);
        const scoreB = b.confidence * (b.trigger.priority / 10);
        return scoreB - scoreA;
      });

      if (matches.length > 0) {
        const bestMatch = matches[0];
        return {
          matched: true,
          agentId: bestMatch.agentId,
          trigger: bestMatch.trigger,
          confidence: bestMatch.confidence,
          reason: `Switch trigger matched: "${bestMatch.trigger.keyword}"`
        };
      }

      return { matched: false, confidence: 0, reason: 'No switch triggers matched' };

    } catch (error) {
      this.logger.error('Error evaluating switch triggers:', error);
      return { matched: false, confidence: 0, reason: 'Error evaluating switch triggers' };
    }
  }

  /**
   * Evalúa qué tan bien coincide un mensaje con un trigger
   */
  private evaluateTriggerMatch(message: string, trigger: AgentTrigger): number {
    const normalizedMessage = message.toLowerCase().trim();
    const normalizedKeyword = trigger.keyword.toLowerCase().trim();

    switch (trigger.type) {
      case 'exact':
        return normalizedMessage === normalizedKeyword ? 1.0 : 0;
      
      case 'contains':
        return normalizedMessage.includes(normalizedKeyword) ? 0.8 : 0;
      
      case 'regex':
        try {
          const regex = new RegExp(trigger.keyword, 'i');
          const match = regex.exec(normalizedMessage);
          return match ? Math.min(match[0].length / normalizedMessage.length, 1.0) : 0;
        } catch (error) {
          this.logger.warn(`Invalid regex trigger: ${trigger.keyword}`);
          return 0;
        }
      
      default:
        return 0;
    }
  }

  /**
   * Verifica condiciones adicionales del trigger
   */
  private async checkTriggerConditions(
    trigger: AgentTrigger, 
    chatId: string, 
    currentAgentId: string
  ): Promise<boolean> {
    if (!trigger.conditions) return true;

    // Verificar condición de agente anterior
    if (trigger.conditions.previousAgent && trigger.conditions.previousAgent !== currentAgentId) {
      return false;
    }

    // Verificar hora del día
    if (trigger.conditions.timeOfDay) {
      const hour = new Date().getHours();
      const timeCondition = trigger.conditions.timeOfDay;
      
      if (timeCondition === 'morning' && (hour < 6 || hour >= 12)) return false;
      if (timeCondition === 'afternoon' && (hour < 12 || hour >= 18)) return false;
      if (timeCondition === 'evening' && (hour < 18 || hour >= 22)) return false;
    }

    return true;
  }

  /**
   * Obtiene la configuración multi-agente de un usuario
   */
  private async getMultiAgentConfig(userId: string): Promise<MultiAgentConfiguration | null> {
    try {
      // Intentar desde cache primero
      const cacheKey = `multi_agent_config_${userId}`;
      const cached = await this.cache.get(cacheKey);
      if (cached) return JSON.parse(cached);

      // Obtener desde base de datos
      const doc = await this.db.collection('users')
        .doc(userId)
        .collection('multiAgentConfig')
        .doc('current')
        .get();

      if (!doc.exists) return null;

      const config = doc.data() as MultiAgentConfiguration;
      
      // Cachear por 5 minutos
      await this.cache.set(cacheKey, JSON.stringify(config), 300);
      
      return config;

    } catch (error) {
      this.logger.error(`Error getting multi-agent config for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Crea configuración multi-agente por defecto basada en el tier del usuario
   */
  async createDefaultMultiAgentConfig(userId: string): Promise<MultiAgentConfiguration> {
    const userTier = await this.tierService.getUserTier(userId);
    const tierConfig = this.tierService.getTierConfiguration(userTier?.tier || 'standard');

    const maxAgents = Math.min(tierConfig.features.customAgents, 3);
    
    const defaultConfig: MultiAgentConfiguration = {
      userId,
      maxActiveAgents: maxAgents,
      activeAgents: ['default-agent'], // Start with default agent
      defaultAgent: 'default-agent',
      triggerConfig: {
        initial: {
          'default-agent': [
            { keyword: 'hola', type: 'contains', priority: 1 },
            { keyword: 'ayuda', type: 'contains', priority: 2 }
          ]
        },
        switch: {},
        fallback: [
          { keyword: 'operador', type: 'contains', priority: 10 },
          { keyword: 'humano', type: 'contains', priority: 9 }
        ]
      },
      switchingBehavior: {
        preserveContext: true,
        announceSwitch: false,
        maxSwitchesPerHour: 10
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Guardar en base de datos
    await this.db.collection('users')
      .doc(userId)
      .collection('multiAgentConfig')
      .doc('current')
      .set(defaultConfig);

    return defaultConfig;
  }

  /**
   * Obtiene configuración multi-agente (método público)
   */
  async getMultiAgentConfiguration(userId: string): Promise<MultiAgentConfiguration | null> {
    return await this.getMultiAgentConfig(userId);
  }

  /**
   * Actualiza configuración multi-agente
   */
  async updateMultiAgentConfig(
    userId: string, 
    updates: Partial<MultiAgentConfiguration>
  ): Promise<boolean> {
    try {
      const docRef = this.db.collection('users')
        .doc(userId)
        .collection('multiAgentConfig')
        .doc('current');

      await docRef.update({
        ...updates,
        updatedAt: new Date()
      });

      // Limpiar cache
      const cacheKey = `multi_agent_config_${userId}`;
      await this.cache.delete(cacheKey);

      this.logger.info(`Multi-agent config updated for user: ${userId}`);
      return true;

    } catch (error) {
      this.logger.error(`Error updating multi-agent config for user ${userId}:`, error);
      return false;
    }
  }
}