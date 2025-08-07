import { Request, Response } from 'express';
import { LoggerService } from '@/core/services/LoggerService';
import { SupabaseService } from '@/core/services/SupabaseService';
import { CacheService } from '@/core/services/CacheService';
import { QueueService } from '@/core/services/QueueService';
import { AIService } from '@/core/services/AIService';

export class GeneralController {
  private logger: LoggerService;
  private db: SupabaseService;
  private cache: CacheService;
  private queue: QueueService;
  private aiService: AIService;

  constructor() {
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.cache = CacheService.getInstance();
    this.queue = QueueService.getInstance();
    this.aiService = AIService.getInstance();
  }

  // GET /api/v2/health
  public async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();

      // Check all services
      const [dbHealthy, cacheHealthy, queueHealthy, aiHealthy] = await Promise.all([
        this.db.healthCheck(),
        this.cache.healthCheck(),
        this.queue.healthCheck(),
        this.aiService.healthCheck(),
      ]);

      const responseTime = Date.now() - startTime;

      const overallHealth = dbHealthy && cacheHealthy && queueHealthy && aiHealthy;

      const healthData = {
        status: overallHealth ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        services: {
          database: {
            status: dbHealthy ? 'healthy' : 'unhealthy',
            service: 'Firebase Firestore',
          },
          cache: {
            status: cacheHealthy ? 'healthy' : 'unhealthy',
            service: 'Redis',
          },
          queue: {
            status: queueHealthy ? 'healthy' : 'unhealthy',
            service: 'Bull/Redis',
          },
          ai: {
            status: aiHealthy ? 'healthy' : 'unhealthy',
            service: 'Google Gemini',
          },
        },
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
      };

      if (overallHealth) {
        res.json({
          success: true,
          data: healthData,
        });
      } else {
        res.status(503).json({
          success: false,
          error: 'Service unhealthy',
          data: healthData,
        });
      }

    } catch (error) {
      this.logger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(503).json({
        success: false,
        error: 'Health check failed',
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  // GET /api/v2/stats
  public async getStats(req: Request, res: Response): Promise<void> {
    try {
      const [queueStats, cacheStats] = await Promise.all([
        this.queue.getAllQueuesStatus(),
        this.getCacheStats(),
      ]);

      const stats = {
        timestamp: new Date().toISOString(),
        queues: queueStats,
        cache: cacheStats,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform,
        },
      };

      res.json({
        success: true,
        data: stats,
      });

    } catch (error) {
      this.logger.error('Error getting stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get stats',
      });
    }
  }

  // GET /api/v2/info
  public async getInfo(req: Request, res: Response): Promise<void> {
    try {
      const info = {
        name: 'WhatsApp API v2',
        version: '2.0.0',
        description: 'Modular and Scalable WhatsApp Integration API',
        author: 'Your Name',
        license: 'MIT',
        repository: 'https://github.com/yourusername/whatsapp-api-v2',
        documentation: '/api/v2/docs',
        endpoints: {
          whatsapp: '/api/v2/whatsapp',
          ai: '/api/v2/ai',
          health: '/api/v2/health',
          stats: '/api/v2/stats',
        },
        features: [
          'WhatsApp Web Integration',
          'Instagram Integration (coming soon)',
          'AI-Powered Responses (Gemini)',
          'Session Management',
          'Message Handling',
          'Webhook Support',
          'Rate Limiting',
          'Real-time Monitoring',
        ],
        technologies: [
          'Node.js',
          'TypeScript',
          'Express.js',
          'Firebase Firestore',
          'Redis',
          'Bull Queue',
          'Google Gemini AI',
          'WhatsApp Web.js',
        ],
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: info,
      });

    } catch (error) {
      this.logger.error('Error getting API info', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get API info',
      });
    }
  }

  // POST /api/v2/webhook
  public async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { platform, event, data, sessionId } = req.body;

      if (!platform || !event || !data) {
        res.status(400).json({
          success: false,
          error: 'Platform, event, and data are required',
        });
        return;
      }

      // Validate webhook signature if provided
      const signature = req.headers['x-webhook-signature'] as string;
      if (signature) {
        const isValid = this.validateWebhookSignature(req.body, signature);
        if (!isValid) {
          res.status(401).json({
            success: false,
            error: 'Invalid webhook signature',
          });
          return;
        }
      }

      // Queue webhook processing based on platform
      const jobType = `${platform}:process-webhook`;
      await this.queue.addJob(platform, {
        type: jobType,
        sessionId,
        webhookData: {
          event,
          data,
          timestamp: new Date(),
          signature,
        },
      });

      res.json({
        success: true,
        data: {
          message: 'Webhook received and queued for processing',
          platform,
          event,
        },
      });

    } catch (error) {
      this.logger.error('Error handling webhook', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to process webhook',
      });
    }
  }

  // POST /api/v2/broadcast
  public async broadcastMessage(req: Request, res: Response): Promise<void> {
    try {
      const { platform, message, recipients, options } = req.body;

      if (!platform || !message || !recipients || !Array.isArray(recipients)) {
        res.status(400).json({
          success: false,
          error: 'Platform, message, and recipients array are required',
        });
        return;
      }

      // Queue broadcast job
      await this.queue.addJob(platform, {
        type: `${platform}:broadcast`,
        message,
        recipients,
        options: options || {},
      });

      res.json({
        success: true,
        data: {
          message: 'Broadcast queued for processing',
          platform,
          recipientCount: recipients.length,
        },
      });

    } catch (error) {
      this.logger.error('Error queuing broadcast', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to queue broadcast',
      });
    }
  }

  // GET /api/v2/queue-status
  public async getQueueStatus(req: Request, res: Response): Promise<void> {
    try {
      const queueStats = await this.queue.getAllQueuesStatus();

      res.json({
        success: true,
        data: {
          queues: queueStats,
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error) {
      this.logger.error('Error getting queue status', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get queue status',
      });
    }
  }

  // POST /api/v2/cleanup
  public async cleanup(req: Request, res: Response): Promise<void> {
    try {
      const { type, options } = req.body;

      if (!type) {
        res.status(400).json({
          success: false,
          error: 'Cleanup type is required',
        });
        return;
      }

      let result: any = {};

      switch (type) {
        case 'sessions':
          // This would be implemented in session managers
          result = { message: 'Session cleanup not implemented yet' };
          break;
        case 'messages':
          const retentionDays = options?.retentionDays || 90;
          result = { message: 'Message cleanup not implemented yet' };
          break;
        case 'cache':
          await this.cache.flushdb();
          result = { message: 'Cache cleared successfully' };
          break;
        case 'queues':
          // This would clear all queues
          result = { message: 'Queue cleanup not implemented yet' };
          break;
        default:
          res.status(400).json({
            success: false,
            error: 'Invalid cleanup type',
          });
          return;
      }

      res.json({
        success: true,
        data: result,
      });

    } catch (error) {
      this.logger.error('Error during cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform cleanup',
      });
    }
  }

  private async getCacheStats(): Promise<any> {
    try {
      const keys = await this.cache.keys('*');
      const stats = {
        totalKeys: keys.length,
        memoryUsage: 'N/A', // Redis doesn't provide this easily
        connected: this.cache.getConnectionStatus(),
      };

      return stats;
    } catch (error) {
      return {
        totalKeys: 0,
        memoryUsage: 'N/A',
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private validateWebhookSignature(payload: any, signature: string): boolean {
    // This is a placeholder implementation
    // In a real implementation, you would validate the signature using your webhook secret
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      return true; // Skip validation if no secret is configured
    }

    // Implement proper signature validation here
    // This is just a basic example
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expectedSignature;
  }
}

export default GeneralController; 