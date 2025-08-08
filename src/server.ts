import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { config } from 'dotenv';

// Load environment variables
config();

// Import services
import { LoggerService } from './core/services/LoggerService';
import { SupabaseService } from './core/services/SupabaseService';
import { CacheService } from './core/services/CacheService';
import { QueueService } from './core/services/QueueService';
import { WebSocketService } from './core/services/websocketService';
import { WorkerManagerService } from './core/services/WorkerManagerService';
import { MessageBrokerService } from './core/services/MessageBrokerService';
import { ChromeCleanupService } from './core/services/ChromeCleanupService';
import { WhatsAppConnectionPool } from './core/services/WhatsAppConnectionPool';

// Import routes
import apiRoutes from './api/routes';

// Import middleware
import { errorHandler } from './api/middleware/errorHandler';
import { requestLogger } from './api/middleware/requestLogger';

// Import environment configuration
import environment from '../config/environment';

class WhatsAppAPIServer {
  private app: express.Application;
  private server: any;
  private logger: LoggerService;
  private supabase: SupabaseService;
  private cache: CacheService;
  private queue: QueueService;
  private wsService: WebSocketService;
  private workerManager: WorkerManagerService;
  private messageBroker: MessageBrokerService;
  private chromeCleanup: ChromeCleanupService;
  private connectionPool: WhatsAppConnectionPool;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.logger = LoggerService.getInstance();
    
    // Fix EventEmitter warnings
    this.server.setMaxListeners(50);
    process.setMaxListeners(50);
    
    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Initialize core services
   */
  private async initializeServices(): Promise<void> {
    try {
      this.logger.info('[Server] Initializing core services...', {
        nodeEnv: environment.nodeEnv,
        port: environment.port,
        platformConfig: {
          whatsapp: environment.enableWhatsApp,
          instagram: environment.enableInstagram,
          platform: environment.platform
        }
      });

      // Initialize Supabase
      this.supabase = SupabaseService.getInstance();
      await this.supabase.initialize();

      // Initialize cache
      this.cache = CacheService.getInstance();
      await this.cache.initialize();

      // Initialize queue
      this.queue = QueueService.getInstance();
      await this.queue.initialize();

      // Initialize WebSocket service (singleton pattern)
      this.wsService = WebSocketService.getInstance();
      this.wsService.initializeWithServer(this.server);

      // Initialize Worker Manager Service
      this.workerManager = WorkerManagerService.getInstance();
      await this.workerManager.initialize();

      // Initialize Message Broker Service
      this.messageBroker = MessageBrokerService.getInstance();

      // Initialize Chrome cleanup service
      this.chromeCleanup = ChromeCleanupService.getInstance();
      this.logger.info('[Server] Chrome cleanup service initialized');
      
      // Run initial cleanup
      const cleanedCount = await this.chromeCleanup.cleanupZombieProcesses();
      if (cleanedCount > 0) {
        this.logger.info(`[Server] Initial cleanup: removed ${cleanedCount} zombie Chrome processes`);
      }

      // Initialize WhatsApp connection pool
      this.connectionPool = WhatsAppConnectionPool.getInstance();
      
      // Setup connection pool message listener
      this.connectionPool.on('message:received', ({ userId, messageData }) => {
        this.logger.info(`[Server] Message received from connection pool for user ${userId}`);
        // Forward to message broker for processing
        this.messageBroker.processIncomingMessage(userId, messageData);
      });

      this.logger.info('[Server] Core services initialized successfully');
    } catch (error) {
      this.logger.error('[Server] Failed to initialize core services:', error);
      process.exit(1);
    }
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    this.logger.info('[Server] Setting up middleware...');

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration - DISABLED because nginx handles CORS
    // Nginx already adds CORS headers, having both causes conflicts
    /*
    this.app.use(cors({
      origin: environment.cors.origin?.split(',') || ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174'],
      credentials: true,
      allowedHeaders: [
        'Origin',
        'X-Requested-With', 
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'x-api-key'
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
    }));
    */

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Configure trust proxy for rate limiting
    this.app.set('trust proxy', 1);

    // Request logging
    this.app.use(requestLogger);

    // Rate limiting
    const limiter = rateLimit({
      windowMs: environment.rateLimit.window * 60 * 1000,
      max: environment.rateLimit.maxRequests,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    this.logger.info('[Server] Middleware setup completed');
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    this.logger.info('[Server] Setting up routes...');

    // Health check
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        platforms: {
          whatsapp: environment.enableWhatsApp,
          instagram: environment.enableInstagram
        }
      });
    });

    // API routes
    this.app.use('/api', apiRoutes);

    // Platform status endpoints
    this.app.get('/api/platforms/status', async (req, res) => {
      try {
        const status = await this.workerManager.getPlatformStatus();
        res.json({
          success: true,
          data: status
        });
      } catch (error) {
        this.logger.error('[Server] Error getting platform status:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // Worker management endpoints
    this.app.post('/api/workers/:userId/start', async (req, res) => {
      try {
        const { userId } = req.params;
        const { platform = 'whatsapp', agentId } = req.body;

        if (!this.isPlatformEnabled(platform)) {
          return res.status(400).json({
            success: false,
            error: `Platform ${platform} is not enabled`
          });
        }

        const result = await this.workerManager.startWorker({
          userId,
          platform: platform as 'whatsapp' | 'instagram',
          activeAgentId: agentId
        });

        if (result) {
          res.json({
            success: true,
            data: {
              workerId: `${userId}:${platform}`,
              status: 'starting'
            }
          });
        } else {
          res.status(500).json({
            success: false,
            error: 'Failed to start worker'
          });
        }
      } catch (error) {
        this.logger.error('[Server] Error starting worker:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    this.app.post('/api/workers/:userId/stop', async (req, res) => {
      try {
        const { userId } = req.params;
        const { platform = 'whatsapp' } = req.body;

        await this.workerManager.stopWorker(userId, platform as 'whatsapp' | 'instagram');

        res.json({
          success: true,
          message: 'Worker stopped successfully'
        });
      } catch (error) {
        this.logger.error('[Server] Error stopping worker:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found'
      });
    });

    this.logger.info('[Server] Routes setup completed');
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.app.use(errorHandler);

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('[Server] Uncaught Exception:', error);
      this.gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('[Server] Unhandled Rejection', { promise, reason });
      // TEMPORARY: Don't shutdown on unhandled rejections for testing
      // this.gracefulShutdown('unhandledRejection');
      this.logger.warn('[Server] Continuing despite unhandled rejection for testing purposes');
    });

    // Handle termination signals
    process.on('SIGTERM', () => {
      this.logger.info('[Server] Received SIGTERM signal');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      this.logger.info('[Server] Received SIGINT signal');
      this.gracefulShutdown('SIGINT');
    });
  }

  /**
   * Check if platform is enabled
   */
  private isPlatformEnabled(platform: string): boolean {
    switch (platform) {
      case 'whatsapp':
        return environment.enableWhatsApp;
      case 'instagram':
        return environment.enableInstagram;
      default:
        return false;
    }
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      const port = environment.port;
      const host = environment.host;

      await new Promise<void>((resolve) => {
        this.server.listen(port, host, () => {
          this.logger.info(`[Server] Server started successfully`, {
            port,
            host,
            environment: environment.nodeEnv,
            platforms: {
              whatsapp: environment.enableWhatsApp,
              instagram: environment.enableInstagram
            }
          });
          resolve();
        });
      });

      // Log startup summary
      this.logger.info('[Server] 🚀 WhatsApp API v2 Server is running!', {
        healthCheck: `http://${host}:${port}/health`,
        apiDocs: `http://${host}:${port}/api`,
        enabledPlatforms: [
          environment.enableWhatsApp && 'WhatsApp',
          environment.enableInstagram && 'Instagram'
        ].filter(Boolean)
      });

    } catch (error) {
      this.logger.error('[Server] Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    this.logger.info(`[Server] Graceful shutdown initiated by ${signal}`);

    try {
      // Stop accepting new connections
      this.server.close(() => {
        this.logger.info('[Server] HTTP server closed');
      });

      // Shutdown worker manager
      if (this.workerManager) {
        await this.workerManager.shutdown();
      }

      // Close database connections
      if (this.supabase) {
        // Add database cleanup if needed
      }

      // Close cache connections
      if (this.cache) {
        // Add cache cleanup if needed
      }

      this.logger.info('[Server] Graceful shutdown completed');
          process.exit(0);

    } catch (error) {
      this.logger.error('[Server] Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the server
async function startServer(): Promise<void> {
const server = new WhatsAppAPIServer();
  await server.start();
}

// Handle module being run directly
if (require.main === module) {
  startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
}

export default WhatsAppAPIServer; 