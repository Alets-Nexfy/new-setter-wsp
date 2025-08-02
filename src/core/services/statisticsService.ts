import { SupabaseService } from './SupabaseService';
import { LoggerService } from './LoggerService';
import { CacheService } from './CacheService';
import { WebSocketService } from './websocketService';

export interface UserStatistics {
  userId: string;
  totalMessages: number;
  totalChats: number;
  totalAgents: number;
  totalRules: number;
  totalActionFlows: number;
  totalKanbanBoards: number;
  messageStats: {
    sent: number;
    received: number;
    automated: number;
    manual: number;
  };
  chatStats: {
    active: number;
    inactive: number;
    totalContacts: number;
  };
  agentStats: {
    active: number;
    inactive: number;
    totalTriggers: number;
  };
  flowStats: {
    active: number;
    inactive: number;
    totalExecutions: number;
    successRate: number;
  };
  kanbanStats: {
    totalBoards: number;
    totalCards: number;
    totalColumns: number;
  };
  period: {
    start: Date;
    end: Date;
  };
  timestamp: Date;
}

export interface SystemStatistics {
  totalUsers: number;
  activeUsers: number;
  totalMessages: number;
  totalChats: number;
  totalAgents: number;
  totalRules: number;
  totalActionFlows: number;
  totalKanbanBoards: number;
  systemMetrics: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    activeConnections: number;
    cacheHitRate: number;
    queueSize: number;
  };
  period: {
    start: Date;
    end: Date;
  };
  timestamp: Date;
}

export interface MessageAnalytics {
  totalMessages: number;
  messagesByType: Record<string, number>;
  messagesByHour: Record<number, number>;
  messagesByDay: Record<string, number>;
  topSenders: Array<{
    userId: string;
    count: number;
  }>;
  topReceivers: Array<{
    userId: string;
    count: number;
  }>;
  averageResponseTime: number;
  period: {
    start: Date;
    end: Date;
  };
}

export interface AgentAnalytics {
  totalAgents: number;
  activeAgents: number;
  agentsByType: Record<string, number>;
  topAgents: Array<{
    agentId: string;
    userId: string;
    triggerCount: number;
    responseCount: number;
  }>;
  triggerAnalytics: {
    totalTriggers: number;
    triggersByType: Record<string, number>;
    mostUsedTriggers: Array<{
      trigger: string;
      count: number;
    }>;
  };
  period: {
    start: Date;
    end: Date;
  };
}

export class StatisticsService {
  private db: SupabaseService;
  private logger: LoggerService;
  private cache: CacheService;
  private wsService: WebSocketService;

  constructor(
    db: DatabaseService,
    logger: LoggerService,
    cache: CacheService,
    wsService: WebSocketService
  ) {
    this.db = db;
    this.logger = logger;
    this.cache = cache;
    this.wsService = wsService;
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(
    userId: string, 
    period: { start: Date; end: Date } = this.getDefaultPeriod()
  ): Promise<UserStatistics> {
    try {
      this.logger.info(`[Statistics] Getting statistics for user: ${userId}`);

      // Check cache first
      const cacheKey = `user_stats:${userId}:${period.start.getTime()}:${period.end.getTime()}`;
      const cachedStats = await this.cache.get<UserStatistics>(cacheKey);
      if (cachedStats) {
        this.logger.info(`[Statistics] Returning cached statistics for user: ${userId}`);
        return cachedStats;
      }

      const stats: UserStatistics = {
        userId,
        totalMessages: 0,
        totalChats: 0,
        totalAgents: 0,
        totalRules: 0,
        totalActionFlows: 0,
        totalKanbanBoards: 0,
        messageStats: {
          sent: 0,
          received: 0,
          automated: 0,
          manual: 0
        },
        chatStats: {
          active: 0,
          inactive: 0,
          totalContacts: 0
        },
        agentStats: {
          active: 0,
          inactive: 0,
          totalTriggers: 0
        },
        flowStats: {
          active: 0,
          inactive: 0,
          totalExecutions: 0,
          successRate: 0
        },
        kanbanStats: {
          totalBoards: 0,
          totalCards: 0,
          totalColumns: 0
        },
        period,
        timestamp: new Date()
      };

      // Get message statistics
      await this.getUserMessageStats(userId, period, stats);

      // Get chat statistics
      await this.getUserChatStats(userId, stats);

      // Get agent statistics
      await this.getUserAgentStats(userId, stats);

      // Get rule statistics
      await this.getUserRuleStats(userId, stats);

      // Get action flow statistics
      await this.getUserActionFlowStats(userId, stats);

      // Get kanban statistics
      await this.getUserKanbanStats(userId, stats);

      // Cache the result
      await this.cache.set(cacheKey, stats, 300); // 5 minutes

      this.logger.info(`[Statistics] Retrieved statistics for user: ${userId}`);
      return stats;

    } catch (error) {
      this.logger.error(`[Statistics] Error getting user statistics for ${userId}:`, error);
      throw new Error(`Failed to get user statistics: ${error.message}`);
    }
  }

  /**
   * Get system statistics
   */
  async getSystemStatistics(
    period: { start: Date; end: Date } = this.getDefaultPeriod()
  ): Promise<SystemStatistics> {
    try {
      this.logger.info('[Statistics] Getting system statistics');

      // Check cache first
      const cacheKey = `system_stats:${period.start.getTime()}:${period.end.getTime()}`;
      const cachedStats = await this.cache.get<SystemStatistics>(cacheKey);
      if (cachedStats) {
        this.logger.info('[Statistics] Returning cached system statistics');
        return cachedStats;
      }

      const stats: SystemStatistics = {
        totalUsers: 0,
        activeUsers: 0,
        totalMessages: 0,
        totalChats: 0,
        totalAgents: 0,
        totalRules: 0,
        totalActionFlows: 0,
        totalKanbanBoards: 0,
        systemMetrics: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          activeConnections: this.wsService ? this.wsService.getStatistics().activeConnections : 0,
          cacheHitRate: 0,
          queueSize: 0
        },
        period,
        timestamp: new Date()
      };

      // Get user statistics
      await this.getSystemUserStats(stats);

      // Get message statistics
      await this.getSystemMessageStats(period, stats);

      // Get chat statistics
      await this.getSystemChatStats(stats);

      // Get agent statistics
      await this.getSystemAgentStats(stats);

      // Get rule statistics
      await this.getSystemRuleStats(stats);

      // Get action flow statistics
      await this.getSystemActionFlowStats(stats);

      // Get kanban statistics
      await this.getSystemKanbanStats(stats);

      // Cache the result
      await this.cache.set(cacheKey, stats, 300); // 5 minutes

      this.logger.info('[Statistics] Retrieved system statistics');
      return stats;

    } catch (error) {
      this.logger.error('[Statistics] Error getting system statistics:', error);
      throw new Error(`Failed to get system statistics: ${error.message}`);
    }
  }

  /**
   * Get message analytics
   */
  async getMessageAnalytics(
    period: { start: Date; end: Date } = this.getDefaultPeriod()
  ): Promise<MessageAnalytics> {
    try {
      this.logger.info('[Statistics] Getting message analytics');

      const analytics: MessageAnalytics = {
        totalMessages: 0,
        messagesByType: {},
        messagesByHour: {},
        messagesByDay: {},
        topSenders: [],
        topReceivers: [],
        averageResponseTime: 0,
        period
      };

      // This would query the messages collection and aggregate data
      // For now, we'll return a placeholder structure

      this.logger.info('[Statistics] Retrieved message analytics');
      return analytics;

    } catch (error) {
      this.logger.error('[Statistics] Error getting message analytics:', error);
      throw new Error(`Failed to get message analytics: ${error.message}`);
    }
  }

  /**
   * Get agent analytics
   */
  async getAgentAnalytics(
    period: { start: Date; end: Date } = this.getDefaultPeriod()
  ): Promise<AgentAnalytics> {
    try {
      this.logger.info('[Statistics] Getting agent analytics');

      const analytics: AgentAnalytics = {
        totalAgents: 0,
        activeAgents: 0,
        agentsByType: {},
        topAgents: [],
        triggerAnalytics: {
          totalTriggers: 0,
          triggersByType: {},
          mostUsedTriggers: []
        },
        period
      };

      // This would query the agents collection and aggregate data
      // For now, we'll return a placeholder structure

      this.logger.info('[Statistics] Retrieved agent analytics');
      return analytics;

    } catch (error) {
      this.logger.error('[Statistics] Error getting agent analytics:', error);
      throw new Error(`Failed to get agent analytics: ${error.message}`);
    }
  }

  /**
   * Get real-time statistics
   */
  async getRealTimeStatistics(): Promise<{
    activeUsers: number;
    activeConnections: number;
    messagesPerMinute: number;
    systemLoad: number;
    timestamp: Date;
  }> {
    try {
      const wsStats = this.wsService ? this.wsService.getStatistics() : { activeConnections: 0, usersConnected: 0 };
      
      const realTimeStats = {
        activeUsers: wsStats.usersConnected || 0,
        activeConnections: wsStats.activeConnections || 0,
        messagesPerMinute: 0, // This would be calculated from recent message activity
        systemLoad: process.cpuUsage().user / 1000000, // CPU usage in seconds
        timestamp: new Date()
      };

      return realTimeStats;

    } catch (error) {
      this.logger.error('[Statistics] Error getting real-time statistics:', error);
      throw new Error(`Failed to get real-time statistics: ${error.message}`);
    }
  }

  /**
   * Generate statistics report
   */
  async generateReport(
    type: 'user' | 'system' | 'message' | 'agent',
    userId?: string,
    period?: { start: Date; end: Date }
  ): Promise<any> {
    try {
      this.logger.info(`[Statistics] Generating ${type} report`);

      let report: any = {};

      switch (type) {
        case 'user':
          if (!userId) throw new Error('User ID is required for user report');
          report = await this.getUserStatistics(userId, period);
          break;
        case 'system':
          report = await this.getSystemStatistics(period);
          break;
        case 'message':
          report = await this.getMessageAnalytics(period);
          break;
        case 'agent':
          report = await this.getAgentAnalytics(period);
          break;
        default:
          throw new Error(`Unknown report type: ${type}`);
      }

      // Add report metadata
      report.reportMetadata = {
        generatedAt: new Date(),
        type,
        userId,
        period,
        version: '1.0'
      };

      this.logger.info(`[Statistics] Generated ${type} report`);
      return report;

    } catch (error) {
      this.logger.error(`[Statistics] Error generating ${type} report:`, error);
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  }

  /**
   * Helper methods for getting specific statistics
   */
  private async getUserMessageStats(
    userId: string, 
    period: { start: Date; end: Date }, 
    stats: UserStatistics
  ): Promise<void> {
    try {
      // Get messages from all chats for this user
      const chatsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .get();

      for (const chatDoc of chatsSnapshot.docs) {
        const messagesSnapshot = await chatDoc.ref
          .collection('messages_all')
          .where('timestamp', '>=', period.start)
          .where('timestamp', '<=', period.end)
          .get();

        stats.totalMessages += messagesSnapshot.size;

        messagesSnapshot.forEach(doc => {
          const message = doc.data();
          if (message.type === 'sent') {
            stats.messageStats.sent++;
          } else if (message.type === 'received') {
            stats.messageStats.received++;
          }
          
          if (message.isAutomated) {
            stats.messageStats.automated++;
          } else {
            stats.messageStats.manual++;
          }
        });
      }
    } catch (error) {
      this.logger.error(`[Statistics] Error getting message stats for user ${userId}:`, error);
    }
  }

  private async getUserChatStats(userId: string, stats: UserStatistics): Promise<void> {
    try {
      const chatsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('chats')
        .get();

      stats.totalChats = chatsSnapshot.size;

      chatsSnapshot.forEach(doc => {
        const chat = doc.data();
        if (chat.isActive) {
          stats.chatStats.active++;
        } else {
          stats.chatStats.inactive++;
        }
        stats.chatStats.totalContacts++;
      });
    } catch (error) {
      this.logger.error(`[Statistics] Error getting chat stats for user ${userId}:`, error);
    }
  }

  private async getUserAgentStats(userId: string, stats: UserStatistics): Promise<void> {
    try {
      const agentsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('agents')
        .get();

      stats.totalAgents = agentsSnapshot.size;

      agentsSnapshot.forEach(doc => {
        const agent = doc.data();
        if (agent.isActive) {
          stats.agentStats.active++;
        } else {
          stats.agentStats.inactive++;
        }
        stats.agentStats.totalTriggers += agent.triggers?.length || 0;
      });
    } catch (error) {
      this.logger.error(`[Statistics] Error getting agent stats for user ${userId}:`, error);
    }
  }

  private async getUserRuleStats(userId: string, stats: UserStatistics): Promise<void> {
    try {
      const rulesSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('rules')
        .get();

      stats.totalRules = rulesSnapshot.size;
    } catch (error) {
      this.logger.error(`[Statistics] Error getting rule stats for user ${userId}:`, error);
    }
  }

  private async getUserActionFlowStats(userId: string, stats: UserStatistics): Promise<void> {
    try {
      const flowsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('action_flows')
        .get();

      stats.totalActionFlows = flowsSnapshot.size;

      flowsSnapshot.forEach(doc => {
        const flow = doc.data();
        if (flow.isActive) {
          stats.flowStats.active++;
        } else {
          stats.flowStats.inactive++;
        }
        stats.flowStats.totalExecutions += flow.executionCount || 0;
      });

      // Calculate success rate
      if (stats.flowStats.totalExecutions > 0) {
        // This would be calculated from execution logs
        stats.flowStats.successRate = 0.95; // Placeholder
      }
    } catch (error) {
      this.logger.error(`[Statistics] Error getting action flow stats for user ${userId}:`, error);
    }
  }

  private async getUserKanbanStats(userId: string, stats: UserStatistics): Promise<void> {
    try {
      const boardsSnapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('kanban_boards')
        .get();

      stats.totalKanbanBoards = boardsSnapshot.size;

      for (const boardDoc of boardsSnapshot.docs) {
        const columnsSnapshot = await boardDoc.ref.collection('columns').get();
        stats.kanbanStats.totalColumns += columnsSnapshot.size;

        for (const columnDoc of columnsSnapshot.docs) {
          const cardsSnapshot = await columnDoc.ref.collection('cards').get();
          stats.kanbanStats.totalCards += cardsSnapshot.size;
        }
      }
    } catch (error) {
      this.logger.error(`[Statistics] Error getting kanban stats for user ${userId}:`, error);
    }
  }

  private async getSystemUserStats(stats: SystemStatistics): Promise<void> {
    try {
      const usersSnapshot = await this.db.collection('users').get();
      stats.totalUsers = usersSnapshot.size;
      stats.activeUsers = usersSnapshot.size; // This would be calculated based on activity
    } catch (error) {
      this.logger.error('[Statistics] Error getting system user stats:', error);
    }
  }

  private async getSystemMessageStats(
    period: { start: Date; end: Date }, 
    stats: SystemStatistics
  ): Promise<void> {
    try {
      // This would aggregate messages across all users
      stats.totalMessages = 0; // Placeholder
    } catch (error) {
      this.logger.error('[Statistics] Error getting system message stats:', error);
    }
  }

  private async getSystemChatStats(stats: SystemStatistics): Promise<void> {
    try {
      // This would aggregate chats across all users
      stats.totalChats = 0; // Placeholder
    } catch (error) {
      this.logger.error('[Statistics] Error getting system chat stats:', error);
    }
  }

  private async getSystemAgentStats(stats: SystemStatistics): Promise<void> {
    try {
      // This would aggregate agents across all users
      stats.totalAgents = 0; // Placeholder
    } catch (error) {
      this.logger.error('[Statistics] Error getting system agent stats:', error);
    }
  }

  private async getSystemRuleStats(stats: SystemStatistics): Promise<void> {
    try {
      // This would aggregate rules across all users
      stats.totalRules = 0; // Placeholder
    } catch (error) {
      this.logger.error('[Statistics] Error getting system rule stats:', error);
    }
  }

  private async getSystemActionFlowStats(stats: SystemStatistics): Promise<void> {
    try {
      // This would aggregate action flows across all users
      stats.totalActionFlows = 0; // Placeholder
    } catch (error) {
      this.logger.error('[Statistics] Error getting system action flow stats:', error);
    }
  }

  private async getSystemKanbanStats(stats: SystemStatistics): Promise<void> {
    try {
      // This would aggregate kanban boards across all users
      stats.totalKanbanBoards = 0; // Placeholder
    } catch (error) {
      this.logger.error('[Statistics] Error getting system kanban stats:', error);
    }
  }

  /**
   * Get default period (last 30 days)
   */
  private getDefaultPeriod(): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start, end };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: string;
    timestamp: Date;
  }> {
    try {
      // Test database connection
      await this.db.collection('users').limit(1).get();

      return {
        status: 'healthy',
        details: 'Statistics service is operational',
        timestamp: new Date()
      };
    } catch (error) {
      this.logger.error('[Statistics] Health check failed:', error);
      return {
        status: 'unhealthy',
        details: `Service error: ${error.message}`,
        timestamp: new Date()
      };
    }
  }
} 