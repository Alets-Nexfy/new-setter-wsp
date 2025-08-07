import { Request, Response } from 'express';
import { AgentTriggerService } from '../../core/services/AgentTriggerService';
import { SupabaseService } from '../../core/services/SupabaseService';
import { LoggerService } from '../../core/services/LoggerService';

/**
 * Controller para manejar la activación de redes de agentes
 * Simplifica la activación simultánea de múltiples agentes con triggers
 */
export class AgentNetworkController {
  private readonly agentTriggerService: AgentTriggerService;
  private readonly supabase: SupabaseService;
  private readonly logger: LoggerService;

  constructor() {
    this.agentTriggerService = AgentTriggerService.getInstance();
    this.supabase = SupabaseService.getInstance();
    this.logger = LoggerService.getInstance();
  }

  /**
   * POST /api/agent-network/:userId/activate
   * Activa toda la red de agentes configurada para un usuario
   */
  async activateNetwork(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      this.logger.info('[AgentNetwork] Activating agent network', { userId });

      // 1. Obtener configuración multi-agente
      const config = await this.agentTriggerService.getMultiAgentConfiguration(userId);
      
      if (!config || !config.activeAgents || config.activeAgents.length === 0) {
        res.status(404).json({
          success: false,
          error: 'No agent network configured'
        });
        return;
      }

      // 2. Extraer el UUID del usuario
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      // 3. Obtener todos los agentes de la red
      const { data: agents, error: agentsError } = await this.supabase
        .getClient()
        .from('agents')
        .select('*')
        .in('id', config.activeAgents)
        .eq('user_id', userUuid);

      if (agentsError || !agents) {
        this.logger.error('[AgentNetwork] Error fetching agents', { error: agentsError });
        res.status(500).json({
          success: false,
          error: 'Failed to fetch agents'
        });
        return;
      }

      // 4. Activar todos los agentes de la red
      const activationResults = [];
      
      for (const agent of agents) {
        // Marcar como activo en la base de datos
        const { error: updateError } = await this.supabase
          .getClient()
          .from('agents')
          .update({ 
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', agent.id)
          .eq('user_id', userUuid);

        if (updateError) {
          this.logger.error('[AgentNetwork] Error activating agent', { 
            agentId: agent.id, 
            error: updateError 
          });
          activationResults.push({
            agentId: agent.id,
            name: agent.name,
            status: 'error',
            error: updateError.message
          });
        } else {
          this.logger.info('[AgentNetwork] Agent activated', { 
            agentId: agent.id,
            name: agent.name 
          });
          activationResults.push({
            agentId: agent.id,
            name: agent.name,
            status: 'active',
            isDefault: agent.id === config.defaultAgent
          });
        }
      }

      // 5. Establecer el agente principal/default
      if (config.defaultAgent) {
        const { error: userUpdateError } = await this.supabase
          .getClient()
          .from('users')
          .update({ 
            active_agent_id: config.defaultAgent,
            updated_at: new Date().toISOString()
          })
          .eq('id', userUuid);

        if (userUpdateError) {
          this.logger.error('[AgentNetwork] Error setting default agent', { 
            error: userUpdateError 
          });
        }
      }

      // 6. Responder con el estado de la red
      res.json({
        success: true,
        message: 'Agent network activated successfully',
        data: {
          totalAgents: config.activeAgents.length,
          defaultAgent: config.defaultAgent,
          activationResults,
          triggerConfig: config.triggerConfig,
          networkStatus: 'active'
        }
      });

    } catch (error) {
      this.logger.error('[AgentNetwork] Error activating network', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to activate network'
      });
    }
  }

  /**
   * GET /api/agent-network/:userId/status
   * Obtiene el estado de la red de agentes
   */
  async getNetworkStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      
      // Obtener configuración
      const config = await this.agentTriggerService.getMultiAgentConfiguration(userId);
      
      if (!config) {
        res.json({
          success: true,
          data: {
            configured: false,
            activeAgents: [],
            networkStatus: 'not_configured'
          }
        });
        return;
      }

      // Extraer UUID
      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      // Obtener estado de los agentes
      const { data: agents, error } = await this.supabase
        .getClient()
        .from('agents')
        .select('id, name, is_active')
        .in('id', config.activeAgents)
        .eq('user_id', userUuid);

      if (error) {
        throw error;
      }

      // Mapear estado
      const agentStatuses = agents?.map(agent => ({
        id: agent.id,
        name: agent.name,
        isActive: agent.is_active,
        isDefault: agent.id === config.defaultAgent,
        role: config.triggerConfig?.initial?.[agent.id] ? 'initial' : 
              config.triggerConfig?.switch?.[agent.id] ? 'switch' : 'fallback'
      })) || [];

      res.json({
        success: true,
        data: {
          configured: true,
          totalAgents: config.activeAgents.length,
          activeCount: agentStatuses.filter(a => a.isActive).length,
          defaultAgent: config.defaultAgent,
          agents: agentStatuses,
          triggerConfig: config.triggerConfig,
          networkStatus: agentStatuses.every(a => a.isActive) ? 'active' : 'partial'
        }
      });

    } catch (error) {
      this.logger.error('[AgentNetwork] Error getting network status', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get network status'
      });
    }
  }

  /**
   * POST /api/agent-network/:userId/deactivate
   * Desactiva toda la red de agentes excepto el principal
   */
  async deactivateNetwork(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { keepDefault = true } = req.body;
      
      this.logger.info('[AgentNetwork] Deactivating agent network', { userId, keepDefault });

      // Obtener configuración
      const config = await this.agentTriggerService.getMultiAgentConfiguration(userId);
      
      if (!config) {
        res.status(404).json({
          success: false,
          error: 'No agent network configured'
        });
        return;
      }

      const userUuid = userId.startsWith('tribe-ia-nexus_') 
        ? userId.replace('tribe-ia-nexus_', '') 
        : userId;

      // Determinar qué agentes desactivar
      const agentsToDeactivate = keepDefault && config.defaultAgent
        ? config.activeAgents.filter(id => id !== config.defaultAgent)
        : config.activeAgents;

      // Desactivar agentes
      const { error } = await this.supabase
        .getClient()
        .from('agents')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .in('id', agentsToDeactivate)
        .eq('user_id', userUuid);

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        message: 'Agent network deactivated',
        data: {
          deactivatedCount: agentsToDeactivate.length,
          defaultAgentKept: keepDefault && config.defaultAgent
        }
      });

    } catch (error) {
      this.logger.error('[AgentNetwork] Error deactivating network', { error });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deactivate network'
      });
    }
  }
}