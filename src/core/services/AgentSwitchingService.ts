import { LoggerService } from './LoggerService';
import { SupabaseService } from './SupabaseService';
import { CacheService } from './CacheService';
import { AgentService } from './AgentService';
import { 
  ChatAgentState, 
  AgentSwitchResult, 
  AgentSwitchReason,
  MultiAgentConfiguration 
} from '../types/MultiAgent';

export class AgentSwitchingService {
  private static instance: AgentSwitchingService;
  private readonly logger: LoggerService;
  private readonly db: SupabaseService;
  private readonly cache: CacheService;
  private readonly agentService: AgentService;

  private constructor() {
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.agentService = AgentService.getInstance();
  }

  public static getInstance(): AgentSwitchingService {
    if (!AgentSwitchingService.instance) {
      AgentSwitchingService.instance = new AgentSwitchingService();
    }
    return AgentSwitchingService.instance;
  }

  /**
   * Ejecuta un cambio de agente con preservación de contexto
   */
  async switchAgent(
    userId: string,
    chatId: string,
    toAgentId: string,
    reason: AgentSwitchReason,
    trigger?: string
  ): Promise<AgentSwitchResult> {
    try {
      // Obtener estado actual del chat
      const currentState = await this.getChatAgentState(userId, chatId);
      const fromAgentId = currentState?.currentAgentId;

      // Verificar si es necesario cambiar
      if (fromAgentId === toAgentId) {
        return {
          success: true,
          switched: false,
          reason: 'Agent is already active for this chat',
          contextPreserved: true
        };
      }

      // Verificar límites de cambios
      if (currentState && !await this.canSwitchAgent(currentState)) {
        return {
          success: false,
          switched: false,
          reason: 'Switch limit exceeded',
          contextPreserved: false
        };
      }

      // Verificar que el agente destino existe y está activo
      const targetAgent = await this.agentService.getAgent(userId, toAgentId);
      if (!targetAgent) {
        return {
          success: false,
          switched: false,
          reason: 'Target agent not found',
          contextPreserved: false
        };
      }

      // Preservar contexto si está habilitado
      let contextPreserved = false;
      let conversationSummary = '';

      if (currentState && fromAgentId) {
        const config = await this.getMultiAgentConfig(userId);
        if (config?.switchingBehavior.preserveContext) {
          conversationSummary = await this.generateContextSummary(userId, chatId, fromAgentId);
          contextPreserved = true;
        }
      }

      // Crear o actualizar estado del chat
      const newState: ChatAgentState = {
        chatId,
        userId,
        currentAgentId: toAgentId,
        previousAgentId: fromAgentId || null,
        switchHistory: [
          ...(currentState?.switchHistory || []),
          {
            fromAgent: fromAgentId || 'none',
            toAgent: toAgentId,
            reason,
            trigger,
            timestamp: new Date()
          }
        ],
        context: {
          ...currentState?.context,
          conversationSummary: contextPreserved ? conversationSummary : null,
          currentTopic: null // Reset topic on switch
        },
        switchCount: {
          lastHour: this.calculateSwitchesLastHour(currentState?.switchHistory || []) + 1,
          today: this.calculateSwitchesToday(currentState?.switchHistory || []) + 1,
          total: (currentState?.switchCount.total || 0) + 1
        },
        lastUpdated: new Date()
      };

      // Guardar nuevo estado
      await this.saveChatAgentState(newState);

      // Generar mensaje de transición si está habilitado
      let switchMessage = '';
      const config = await this.getMultiAgentConfig(userId);
      if (config?.switchingBehavior.announceSwitch) {
        const fromAgentName = fromAgentId ? (await this.agentService.getAgent(userId, fromAgentId))?.persona.name : 'Sistema';
        const toAgentName = targetAgent.persona.name;
        switchMessage = config.switchingBehavior.switchMessage || 
          `Te he transferido con ${toAgentName} para ayudarte mejor.`;
      }

      this.logger.info(`Agent switched successfully`, {
        userId,
        chatId,
        fromAgent: fromAgentId,
        toAgent: toAgentId,
        reason,
        trigger
      });

      return {
        success: true,
        switched: true,
        fromAgent: fromAgentId,
        toAgent: toAgentId,
        reason,
        trigger,
        contextPreserved,
        message: switchMessage
      };

    } catch (error) {
      this.logger.error('Error switching agent:', error);
      return {
        success: false,
        switched: false,
        reason: 'Internal error during agent switch',
        contextPreserved: false
      };
    }
  }

  /**
   * Obtiene el agente actual para un chat específico
   */
  async getCurrentAgent(userId: string, chatId: string): Promise<string | null> {
    try {
      const state = await this.getChatAgentState(userId, chatId);
      return state?.currentAgentId || null;
    } catch (error) {
      this.logger.error(`Error getting current agent for chat ${chatId}:`, error);
      return null;
    }
  }

  /**
   * Obtiene el estado completo de agente para un chat
   */
  async getChatAgentState(userId: string, chatId: string): Promise<ChatAgentState | null> {
    try {
      // Intentar desde cache primero
      const cacheKey = `chat_agent_state_${userId}_${chatId}`;
      const cached = await this.cache.get(cacheKey);
      if (cached) return JSON.parse(cached);

      // Obtener desde base de datos
      const doc = await this.db.collection('users')
        .doc(userId)
        .collection('chatAgentStates')
        .doc(chatId)
        .get();

      if (!doc.exists) return null;

      const state = doc.data() as ChatAgentState;
      
      // Cachear por 1 minuto
      await this.cache.set(cacheKey, JSON.stringify(state), 60);
      
      return state;

    } catch (error) {
      this.logger.error(`Error getting chat agent state for ${chatId}:`, error);
      return null;
    }
  }

  /**
   * Guarda el estado de agente para un chat
   */
  private async saveChatAgentState(state: ChatAgentState): Promise<void> {
    await this.db.collection('users')
      .doc(state.userId)
      .collection('chatAgentStates')
      .doc(state.chatId)
      .set(state);

    // Actualizar cache
    const cacheKey = `chat_agent_state_${state.userId}_${state.chatId}`;
    await this.cache.set(cacheKey, JSON.stringify(state), 60);
  }

  /**
   * Verifica si se puede cambiar de agente (límites)
   */
  private async canSwitchAgent(currentState: ChatAgentState): Promise<boolean> {
    const config = await this.getMultiAgentConfig(currentState.userId);
    if (!config) return false;

    const maxSwitchesPerHour = config.switchingBehavior.maxSwitchesPerHour;
    const switchesLastHour = this.calculateSwitchesLastHour(currentState.switchHistory);

    return switchesLastHour < maxSwitchesPerHour;
  }

  /**
   * Calcula cambios de agente en la última hora
   */
  private calculateSwitchesLastHour(switchHistory: ChatAgentState['switchHistory']): number {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return switchHistory.filter(switch_ => switch_.timestamp > oneHourAgo).length;
  }

  /**
   * Calcula cambios de agente hoy
   */
  private calculateSwitchesToday(switchHistory: ChatAgentState['switchHistory']): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return switchHistory.filter(switch_ => switch_.timestamp >= today).length;
  }

  /**
   * Genera resumen de contexto para preservar entre agentes
   */
  private async generateContextSummary(
    userId: string, 
    chatId: string, 
    fromAgentId: string
  ): Promise<string> {
    try {
      // Obtener últimos mensajes del chat
      const messages = await this.db.collection('users')
        .doc(userId)
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      if (messages.empty) return '';

      // Crear resumen básico
      const messageTexts = messages.docs
        .reverse()
        .map(doc => {
          const data = doc.data();
          return `${data.origin === 'human' ? 'Cliente' : 'Bot'}: ${data.content || data.text}`;
        })
        .join('\\n');

      return `Resumen de conversación anterior:\\n${messageTexts}`;

    } catch (error) {
      this.logger.error('Error generating context summary:', error);
      return '';
    }
  }

  /**
   * Obtiene configuración multi-agente
   */
  private async getMultiAgentConfig(userId: string): Promise<MultiAgentConfiguration | null> {
    try {
      const doc = await this.db.collection('users')
        .doc(userId)
        .collection('multiAgentConfig')
        .doc('current')
        .get();

      return doc.exists ? doc.data() as MultiAgentConfiguration : null;
    } catch (error) {
      this.logger.error(`Error getting multi-agent config:`, error);
      return null;
    }
  }

  /**
   * Limpia estados de chat antiguos (maintenance task)
   */
  async cleanupOldChatStates(userId: string, olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      
      const oldStates = await this.db.collection('users')
        .doc(userId)
        .collection('chatAgentStates')
        .where('lastUpdated', '<', cutoffDate)
        .get();

      const batch = this.db.batch();
      oldStates.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      this.logger.info(`Cleaned up ${oldStates.size} old chat agent states for user ${userId}`);
      return oldStates.size;

    } catch (error) {
      this.logger.error('Error cleaning up old chat states:', error);
      return 0;
    }
  }
}