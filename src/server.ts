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
import { DatabaseService } from './core/services/DatabaseService';
import { CacheService } from './core/services/CacheService';
import { QueueService } from './core/services/QueueService';
import { WebSocketService } from './core/services/websocketService';

// Import routes
import apiRoutes from './api/routes';

// Import middleware
import { errorHandler } from './api/middleware/errorHandler';
import { requestLogger } from './api/middleware/requestLogger';

class WhatsAppAPIServer {
  private app: express.Application;
  private server: any;
  private logger: LoggerService;
  private db: DatabaseService;
  private cache: CacheService;
  private queue: QueueService;
  private wsService: WebSocketService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.logger = new LoggerService();
    
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
      this.logger.info('[Server] Initializing core services...');

      // Initialize database
      this.db = new DatabaseService();
      await this.db.initialize();

      // Initialize cache
      this.cache = new CacheService();
      await this.cache.initialize();

      // Initialize queue
      this.queue = new QueueService();
      await this.queue.initialize();

      // Initialize WebSocket service
      this.wsService = new WebSocketService(this.server);

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
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Request logging
    this.app.use(requestLogger);

    this.logger.info('[Server] Middleware setup completed');
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    this.logger.info('[Server] Setting up routes...');

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        message: 'WhatsApp API v2 is running',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API routes
    this.app.use('/api', apiRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl,
        method: req.method
      });
    });

    this.logger.info('[Server] Routes setup completed');
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.logger.info('[Server] Setting up error handling...');

    // Global error handler
    this.app.use(errorHandler);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      this.logger.info('[Server] SIGTERM received, shutting down gracefully...');
      this.gracefulShutdown();
    });

    process.on('SIGINT', () => {
      this.logger.info('[Server] SIGINT received, shutting down gracefully...');
      this.gracefulShutdown();
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('[Server] Uncaught Exception:', error);
      this.gracefulShutdown();
    });

    this.logger.info('[Server] Error handling setup completed');
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      const port = process.env.PORT || 3000;
      
      this.server.listen(port, () => {
        this.logger.info(`[Server] WhatsApp API v2 server started on port ${port}`);
        this.logger.info(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
        this.logger.info(`[Server] Health check: http://localhost:${port}/health`);
        this.logger.info(`[Server] API base: http://localhost:${port}/api`);
        this.logger.info(`[Server] WebSocket: ws://localhost:${port}`);
      });
    } catch (error) {
      this.logger.error('[Server] Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  private async gracefulShutdown(): Promise<void> {
    this.logger.info('[Server] Starting graceful shutdown...');

    try {
      // Close WebSocket connections
      if (this.wsService) {
        this.wsService.cleanup();
      }

      // Close database connections
      if (this.db) {
        await this.db.close();
      }

      // Close cache connections
      if (this.cache) {
        await this.cache.close();
      }

      // Close queue connections
      if (this.queue) {
        await this.queue.close();
      }

      // Close HTTP server
      if (this.server) {
        this.server.close(() => {
          this.logger.info('[Server] HTTP server closed');
          process.exit(0);
        });
      }

      // Force exit after 10 seconds
      setTimeout(() => {
        this.logger.error('[Server] Forced shutdown after timeout');
        process.exit(1);
      }, 10000);

    } catch (error) {
      this.logger.error('[Server] Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get server statistics
   */
  getStatistics(): any {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      websocket: this.wsService ? this.wsService.getStatistics() : null,
      timestamp: new Date().toISOString()
    };
  }
}

// Start the server
const server = new WhatsAppAPIServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default server; 