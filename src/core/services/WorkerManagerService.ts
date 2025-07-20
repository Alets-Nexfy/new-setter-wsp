/**
 * Worker Manager Service
 * 
 * Manages worker processes for both WhatsApp and Instagram platforms
 * Coordinates with WhatsAppWorkerManager and handles cross-platform logic
 */

import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { LoggerService } from './LoggerService';
import { DatabaseService } from './DatabaseService';
import { WhatsAppWorkerManager } from '../../workers/whatsapp-worker/WhatsAppWorkerManager';
import { environment } from '../../../config/environment';

interface WorkerStartOptions {
  userId: string;
  platform: 'whatsapp' | 'instagram';
  activeAgentId?: string;
  forceRestart?: boolean;
}

interface PlatformStatus {
  enabled: boolean;
  activeWorkers: number;
  totalSessions: number;
  status: 'healthy' | 'degraded' | 'offline';
}

interface WorkerInfo {
  workerId: string;
  userId: string;
  platform: 'whatsapp' | 'instagram';
  status: string;
  createdAt: Date;
  lastActivity: Date;
  pid?: number;
}

export class WorkerManagerService extends EventEmitter {
  private static instance: WorkerManagerService;
  private logger: LoggerService;
  private db: DatabaseService;
  private whatsappManager: WhatsAppWorkerManager;
  private instagramWorkers: Map<string, ChildProcess> = new Map();
  private initialized: boolean = false;

  private constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.db = DatabaseService.getInstance();
    this.whatsappManager = WhatsAppWorkerManager.getInstance();
  }

  public static getInstance(): WorkerManagerService {
    if (!WorkerManagerService.instance) {
      WorkerManagerService.instance = new WorkerManagerService();
    }
    return WorkerManagerService.instance;
  }

  /**
   * Initialize the worker manager service
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('Initializing Worker Manager Service', {
        whatsappEnabled: environment.ENABLE_WHATSAPP,
        instagramEnabled: environment.ENABLE_INSTAGRAM
      });

      // Initialize WhatsApp worker manager if enabled
      if (environment.ENABLE_WHATSAPP) {
        await this.whatsappManager.initialize();
        this.logger.info('WhatsApp Worker Manager initialized');
      }

      // Setup event listeners
      this.setupEventListeners();

      this.initialized = true;
      this.logger.info('Worker Manager Service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Worker Manager Service', { error });
      throw error;
    }
  }

  /**
   * Setup event listeners for worker events
   */
  private setupEventListeners(): void {
    // Listen to WhatsApp worker events
    this.whatsappManager.on('workerStarted', (workerId, userId) => {
      this.emit('workerStarted', { workerId, userId, platform: 'whatsapp' });
    });

    this.whatsappManager.on('workerStopped', (workerId, userId) => {
      this.emit('workerStopped', { workerId, userId, platform: 'whatsapp' });
    });

    this.whatsappManager.on('workerError', (workerId, userId, error) => {
      this.emit('workerError', { workerId, userId, platform: 'whatsapp', error });
    });

    // Add Instagram worker event listeners here when implemented
  }

  /**
   * Start a worker for a specific user and platform
   */
  public async startWorker(options: WorkerStartOptions): Promise<boolean> {
    const { userId, platform, activeAgentId, forceRestart = false } = options;

    try {
      this.logger.info('Starting worker', { userId, platform, activeAgentId, forceRestart });

      // Check if platform is enabled
      if (!this.isPlatformEnabled(platform)) {
        throw new Error(`Platform ${platform} is not enabled`);
      }

      switch (platform) {
        case 'whatsapp':
          return await this.startWhatsAppWorker(userId, activeAgentId, forceRestart);
        
        case 'instagram':
          return await this.startInstagramWorker(userId, activeAgentId, forceRestart);
        
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

    } catch (error) {
      this.logger.error('Failed to start worker', { userId, platform, error });
      return false;
    }
  }

  /**
   * Stop a worker for a specific user and platform
   */
  public async stopWorker(userId: string, platform: 'whatsapp' | 'instagram'): Promise<void> {
    try {
      this.logger.info('Stopping worker', { userId, platform });

      switch (platform) {
        case 'whatsapp':
          await this.whatsappManager.stopWorker(userId);
          break;
        
        case 'instagram':
          await this.stopInstagramWorker(userId);
          break;
        
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

    } catch (error) {
      this.logger.error('Failed to stop worker', { userId, platform, error });
      throw error;
    }
  }

  /**
   * Start WhatsApp worker
   */
  private async startWhatsAppWorker(
    userId: string, 
    activeAgentId?: string, 
    forceRestart: boolean = false
  ): Promise<boolean> {
    try {
      const result = await this.whatsappManager.startWorker({
        userId,
        activeAgentId,
        forceRestart
      });

      return result !== null;

    } catch (error) {
      this.logger.error('Failed to start WhatsApp worker', { userId, error });
      return false;
    }
  }

  /**
   * Start Instagram worker
   */
  private async startInstagramWorker(
    userId: string, 
    activeAgentId?: string, 
    forceRestart: boolean = false
  ): Promise<boolean> {
    try {
      // Check if worker already exists
      const workerId = `${userId}:instagram`;
      
      if (this.instagramWorkers.has(workerId) && !forceRestart) {
        const existingWorker = this.instagramWorkers.get(workerId);
        if (existingWorker && !existingWorker.killed) {
          this.logger.warn('Instagram worker already exists', { userId });
          return true;
        }
      }

      // Import and start Instagram worker
      const { fork } = await import('child_process');
      const path = await import('path');
      
      const workerScript = path.join(__dirname, '../../workers/instagram-worker/index.ts');
      const workerArgs = [userId];
      
      if (activeAgentId) {
        workerArgs.push(activeAgentId);
      }

      const worker = fork(workerScript, workerArgs, {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: process.env.NODE_ENV }
      });

      this.instagramWorkers.set(workerId, worker);

      // Setup worker event handlers
      worker.on('exit', (code, signal) => {
        this.logger.info('Instagram worker exited', { userId, code, signal });
        this.instagramWorkers.delete(workerId);
        this.emit('workerStopped', { workerId, userId, platform: 'instagram' });
      });

      worker.on('error', (error) => {
        this.logger.error('Instagram worker error', { userId, error });
        this.emit('workerError', { workerId, userId, platform: 'instagram', error });
      });

      // Update Firestore
      const userDocRef = this.db.collection('users').doc(userId);
      await userDocRef.collection('status').doc('instagram').set({
        status: 'connecting',
        worker_pid: worker.pid,
        last_error: null,
        updatedAt: new Date()
      }, { merge: true });

      this.emit('workerStarted', { workerId, userId, platform: 'instagram' });
      
      this.logger.info('Instagram worker started successfully', { userId, pid: worker.pid });
      return true;

    } catch (error) {
      this.logger.error('Failed to start Instagram worker', { userId, error });
      return false;
    }
  }

  /**
   * Stop Instagram worker
   */
  private async stopInstagramWorker(userId: string): Promise<void> {
    const workerId = `${userId}:instagram`;
    const worker = this.instagramWorkers.get(workerId);

    if (worker) {
      try {
        worker.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            worker.kill('SIGKILL');
            resolve();
          }, 10000);

          worker.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        this.instagramWorkers.delete(workerId);
        
        // Update Firestore
        const userDocRef = this.db.collection('users').doc(userId);
        await userDocRef.collection('status').doc('instagram').update({
          status: 'disconnected',
          worker_pid: null,
          updatedAt: new Date()
        });

        this.logger.info('Instagram worker stopped successfully', { userId });

      } catch (error) {
        this.logger.error('Error stopping Instagram worker', { userId, error });
        throw error;
      }
    } else {
      this.logger.warn('Instagram worker not found for stop request', { userId });
    }
  }

  /**
   * Get platform status
   */
  public async getPlatformStatus(): Promise<Record<string, PlatformStatus>> {
    const status: Record<string, PlatformStatus> = {};

    // WhatsApp status
    if (environment.ENABLE_WHATSAPP) {
      const whatsappWorkers = this.whatsappManager.getActiveWorkerCount();
      status.whatsapp = {
        enabled: true,
        activeWorkers: whatsappWorkers,
        totalSessions: whatsappWorkers, // Simplified
        status: whatsappWorkers > 0 ? 'healthy' : 'offline'
      };
    } else {
      status.whatsapp = {
        enabled: false,
        activeWorkers: 0,
        totalSessions: 0,
        status: 'offline'
      };
    }

    // Instagram status
    if (environment.ENABLE_INSTAGRAM) {
      const instagramWorkers = this.instagramWorkers.size;
      status.instagram = {
        enabled: true,
        activeWorkers: instagramWorkers,
        totalSessions: instagramWorkers, // Simplified
        status: instagramWorkers > 0 ? 'healthy' : 'offline'
      };
    } else {
      status.instagram = {
        enabled: false,
        activeWorkers: 0,
        totalSessions: 0,
        status: 'offline'
      };
    }

    return status;
  }

  /**
   * Get all active workers
   */
  public async getActiveWorkers(): Promise<WorkerInfo[]> {
    const workers: WorkerInfo[] = [];

    // Get WhatsApp workers
    if (environment.ENABLE_WHATSAPP) {
      const whatsappWorkers = this.whatsappManager.getAllWorkers();
      
      for (const [userId, workerInstance] of whatsappWorkers) {
        workers.push({
          workerId: `${userId}:whatsapp`,
          userId,
          platform: 'whatsapp',
          status: workerInstance.status,
          createdAt: workerInstance.createdAt,
          lastActivity: workerInstance.lastActivity,
          pid: workerInstance.process.pid
        });
      }
    }

    // Get Instagram workers
    for (const [workerId, worker] of this.instagramWorkers) {
      const userId = workerId.split(':')[0];
      workers.push({
        workerId,
        userId,
        platform: 'instagram',
        status: worker.killed ? 'stopped' : 'running',
        createdAt: new Date(), // Would need to track this
        lastActivity: new Date(), // Would need to track this
        pid: worker.pid
      });
    }

    return workers;
  }

  /**
   * Check if worker is active
   */
  public isWorkerActive(userId: string, platform: 'whatsapp' | 'instagram'): boolean {
    switch (platform) {
      case 'whatsapp':
        return this.whatsappManager.isWorkerActive(userId);
      
      case 'instagram':
        const workerId = `${userId}:instagram`;
        const worker = this.instagramWorkers.get(workerId);
        return worker !== undefined && !worker.killed;
      
      default:
        return false;
    }
  }

  /**
   * Check if platform is enabled
   */
  private isPlatformEnabled(platform: 'whatsapp' | 'instagram'): boolean {
    switch (platform) {
      case 'whatsapp':
        return environment.ENABLE_WHATSAPP;
      case 'instagram':
        return environment.ENABLE_INSTAGRAM;
      default:
        return false;
    }
  }

  /**
   * Send message to worker
   */
  public async sendMessageToWorker(
    userId: string,
    platform: 'whatsapp' | 'instagram',
    message: any
  ): Promise<boolean> {
    try {
      switch (platform) {
        case 'whatsapp':
          return this.whatsappManager.sendMessageToWorker(userId, message);
        
        case 'instagram':
          const workerId = `${userId}:instagram`;
          const worker = this.instagramWorkers.get(workerId);
          
          if (worker && !worker.killed) {
            worker.send(message);
            return true;
          }
          return false;
        
        default:
          return false;
      }

    } catch (error) {
      this.logger.error('Failed to send message to worker', { userId, platform, error });
      return false;
    }
  }

  /**
   * Shutdown all workers
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down Worker Manager Service');

    try {
      // Shutdown WhatsApp workers
      if (environment.ENABLE_WHATSAPP) {
        await this.whatsappManager.shutdown();
      }

      // Shutdown Instagram workers
      const shutdownPromises: Promise<void>[] = [];
      
      for (const [workerId, worker] of this.instagramWorkers) {
        const userId = workerId.split(':')[0];
        shutdownPromises.push(this.stopInstagramWorker(userId));
      }

      await Promise.all(shutdownPromises);

      this.logger.info('Worker Manager Service shutdown completed');

    } catch (error) {
      this.logger.error('Error during Worker Manager Service shutdown', { error });
      throw error;
    }
  }
} 