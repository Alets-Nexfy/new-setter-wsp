import { Request, Response } from 'express';
import { StatisticsService } from '../../core/services/statisticsService';
import { LoggerService } from '../../core/services/LoggerService';

export class StatisticsController {
  private statisticsService: StatisticsService;
  private logger: LoggerService;

  constructor(statisticsService: StatisticsService) {
    this.statisticsService = statisticsService;
    this.logger = LoggerService.getInstance();
  }

  /**
   * Get user statistics
   * GET /users/:userId/statistics
   */
  async getUserStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { start, end } = req.query;

      this.logger.info(`[StatisticsController] Getting statistics for user: ${userId}`);

      let period;
      if (start && end) {
        period = {
          start: new Date(start as string),
          end: new Date(end as string)
        };
      }

      const statistics = await this.statisticsService.getUserStatistics(userId, period);

      res.json({
        success: true,
        data: statistics,
        message: 'User statistics retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[StatisticsController] Error getting user statistics:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user statistics'
      });
    }
  }

  /**
   * Get system statistics
   * GET /statistics/system
   */
  async getSystemStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = req.query;

      this.logger.info('[StatisticsController] Getting system statistics');

      let period;
      if (start && end) {
        period = {
          start: new Date(start as string),
          end: new Date(end as string)
        };
      }

      const statistics = await this.statisticsService.getSystemStatistics(period);

      res.json({
        success: true,
        data: statistics,
        message: 'System statistics retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[StatisticsController] Error getting system statistics:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get system statistics'
      });
    }
  }

  /**
   * Get message analytics
   * GET /statistics/messages
   */
  async getMessageAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = req.query;

      this.logger.info('[StatisticsController] Getting message analytics');

      let period;
      if (start && end) {
        period = {
          start: new Date(start as string),
          end: new Date(end as string)
        };
      }

      const analytics = await this.statisticsService.getMessageAnalytics(period);

      res.json({
        success: true,
        data: analytics,
        message: 'Message analytics retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[StatisticsController] Error getting message analytics:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get message analytics'
      });
    }
  }

  /**
   * Get agent analytics
   * GET /statistics/agents
   */
  async getAgentAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = req.query;

      this.logger.info('[StatisticsController] Getting agent analytics');

      let period;
      if (start && end) {
        period = {
          start: new Date(start as string),
          end: new Date(end as string)
        };
      }

      const analytics = await this.statisticsService.getAgentAnalytics(period);

      res.json({
        success: true,
        data: analytics,
        message: 'Agent analytics retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[StatisticsController] Error getting agent analytics:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get agent analytics'
      });
    }
  }

  /**
   * Get real-time statistics
   * GET /statistics/realtime
   */
  async getRealTimeStatistics(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('[StatisticsController] Getting real-time statistics');

      const statistics = await this.statisticsService.getRealTimeStatistics();

      res.json({
        success: true,
        data: statistics,
        message: 'Real-time statistics retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[StatisticsController] Error getting real-time statistics:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get real-time statistics'
      });
    }
  }

  /**
   * Generate statistics report
   * POST /statistics/reports
   */
  async generateReport(req: Request, res: Response): Promise<void> {
    try {
      const { type, userId, start, end } = req.body;

      this.logger.info(`[StatisticsController] Generating ${type} report`);

      if (!type || !['user', 'system', 'message', 'agent'].includes(type)) {
        res.status(400).json({
          success: false,
          message: 'Invalid report type. Must be one of: user, system, message, agent'
        });
        return;
      }

      if (type === 'user' && !userId) {
        res.status(400).json({
          success: false,
          message: 'User ID is required for user reports'
        });
        return;
      }

      let period;
      if (start && end) {
        period = {
          start: new Date(start),
          end: new Date(end)
        };
      }

      const report = await this.statisticsService.generateReport(type, userId, period);

      res.json({
        success: true,
        data: report,
        message: `${type} report generated successfully`
      });
    } catch (error) {
      this.logger.error(`[StatisticsController] Error generating report:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate report'
      });
    }
  }

  /**
   * Get dashboard statistics
   * GET /statistics/dashboard
   */
  async getDashboardStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.query;

      this.logger.info('[StatisticsController] Getting dashboard statistics');

      const dashboardData = {
        realTime: await this.statisticsService.getRealTimeStatistics(),
        system: await this.statisticsService.getSystemStatistics(),
        timestamp: new Date()
      };

      if (userId) {
        dashboardData['user'] = await this.statisticsService.getUserStatistics(userId as string);
      }

      res.json({
        success: true,
        data: dashboardData,
        message: 'Dashboard statistics retrieved successfully'
      });
    } catch (error) {
      this.logger.error(`[StatisticsController] Error getting dashboard statistics:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get dashboard statistics'
      });
    }
  }

  /**
   * Export statistics data
   * GET /statistics/export
   */
  async exportStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { type, format = 'json', userId, start, end } = req.query;

      this.logger.info(`[StatisticsController] Exporting ${type} statistics in ${format} format`);

      if (!type || !['user', 'system', 'message', 'agent'].includes(type as string)) {
        res.status(400).json({
          success: false,
          message: 'Invalid export type. Must be one of: user, system, message, agent'
        });
        return;
      }

      if (type === 'user' && !userId) {
        res.status(400).json({
          success: false,
          message: 'User ID is required for user exports'
        });
        return;
      }

      let period;
      if (start && end) {
        period = {
          start: new Date(start as string),
          end: new Date(end as string)
        };
      }

      const data = await this.statisticsService.generateReport(
        type as 'user' | 'system' | 'message' | 'agent',
        userId as string,
        period
      );

      if (format === 'csv') {
        // Convert to CSV format
        const csv = this.convertToCSV(data);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_statistics_${Date.now()}.csv"`);
        res.send(csv);
      } else {
        // JSON format
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_statistics_${Date.now()}.json"`);
        res.json(data);
      }
    } catch (error) {
      this.logger.error(`[StatisticsController] Error exporting statistics:`, error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to export statistics'
      });
    }
  }

  /**
   * Health check for statistics service
   * GET /statistics/health
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      this.logger.info('[StatisticsController] Health check requested');

      const health = await this.statisticsService.healthCheck();

      if (health.status === 'healthy') {
        res.json({
          success: true,
          data: health,
          message: 'Statistics service is healthy'
        });
      } else {
        res.status(503).json({
          success: false,
          data: health,
          message: 'Statistics service is unhealthy'
        });
      }
    } catch (error) {
      this.logger.error(`[StatisticsController] Health check failed:`, error);
      res.status(503).json({
        success: false,
        message: 'Statistics service health check failed'
      });
    }
  }

  /**
   * Helper method to convert data to CSV format
   */
  private convertToCSV(data: any): string {
    // This is a simple CSV conversion
    // In a real implementation, you'd want a more robust CSV library
    const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
      const flattened: Record<string, any> = {};
      
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const newKey = prefix ? `${prefix}.${key}` : key;
          
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            Object.assign(flattened, flattenObject(obj[key], newKey));
          } else {
            flattened[newKey] = obj[key];
          }
        }
      }
      
      return flattened;
    };

    const flattened = flattenObject(data);
    const headers = Object.keys(flattened);
    const values = Object.values(flattened);

    const csv = [
      headers.join(','),
      values.map(v => typeof v === 'string' ? `"${v}"` : v).join(',')
    ].join('\n');

    return csv;
  }
}

export default StatisticsController; 