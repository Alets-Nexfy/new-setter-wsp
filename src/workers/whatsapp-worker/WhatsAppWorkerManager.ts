import { ChildProcess, fork } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { LoggerService } from '../../core/services/LoggerService';
import { SupabaseService } from '../../core/services/SupabaseService';
import { WebSocketService } from '../../core/services/websocketService';
import { WorkerIPCHandler } from './WorkerIPCHandler';
import { UserTierService } from '../../core/services/UserTierService';
import { WhatsAppConnectionPool } from '../../core/services/WhatsAppConnectionPool';
import { ChromeCleanupService } from '../../core/services/ChromeCleanupService';

export interface WorkerInstance {
  process: ChildProcess;
  userId: string;
  activeAgentId?: string;
  status: 'starting' | 'connected' | 'disconnected' | 'error';
  createdAt: Date;
  lastActivity: Date;
}

export interface WorkerMessage {
  type: 'STATUS_UPDATE' | 'QR_CODE' | 'ERROR_INFO' | 'NEW_MESSAGE_RECEIVED' | 'COMMAND';
  status?: string;
  error?: string;
  qr?: string;
  qrText?: string;
  payload?: any;
  command?: string;
}

export interface StartWorkerOptions {
  userId: string;
  activeAgentId?: string;
  forceRestart?: boolean;
}

export class WhatsAppWorkerManager extends EventEmitter {
  private static instance: WhatsAppWorkerManager;
  private workers: Map<string, WorkerInstance> = new Map();
  private connectingUsers: Set<string> = new Set();
  private logger: LoggerService;
  private db: SupabaseService;
  private wsService: WebSocketService;
  private ipcHandler: WorkerIPCHandler;
  private userTierService: UserTierService;
  private connectionPool: WhatsAppConnectionPool;

  constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.db = SupabaseService.getInstance();
    this.wsService = WebSocketService.getInstance();
    this.ipcHandler = new WorkerIPCHandler(this);
    this.userTierService = UserTierService.getInstance();
    this.connectionPool = WhatsAppConnectionPool.getInstance();
    
    this.setupEventHandlers();
  }

  public static getInstance(): WhatsAppWorkerManager {
    if (!WhatsAppWorkerManager.instance) {
      WhatsAppWorkerManager.instance = new WhatsAppWorkerManager();
    }
    return WhatsAppWorkerManager.instance;
  }

  /**
   * Initialize the WhatsApp Worker Manager
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing WhatsApp Worker Manager');
      
      // Setup cleanup intervals
      this.setupCleanupInterval();
      
      // Log current state
      this.logger.info('WhatsApp Worker Manager initialized successfully', {
        activeWorkers: this.workers.size,
        connectingUsers: this.connectingUsers.size
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize WhatsApp Worker Manager', { error });
      throw error;
    }
  }

  /**
   * Setup cleanup interval for inactive workers
   */
  private setupCleanupInterval(): void {
    setInterval(() => {
      this.cleanupInactiveWorkers();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Cleanup inactive workers
   */
  private cleanupInactiveWorkers(): void {
    const now = new Date();
    for (const [userId, worker] of this.workers.entries()) {
      const inactiveTime = now.getTime() - worker.lastActivity.getTime();
      // Clean up workers inactive for more than 30 minutes
      if (inactiveTime > 30 * 60 * 1000) {
        this.logger.info('Cleaning up inactive worker', { userId, inactiveTime });
        this.stopWorker(userId);
      }
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 350-623
   * FUNCIÓN: startWorker(userId)
   * MEJORAS: TypeScript types, error handling robusto, logging estructurado
   */
  public async startWorker(options: StartWorkerOptions): Promise<WorkerInstance | null> {
    const { userId, activeAgentId, forceRestart = false } = options;
    
    this.logger.info('Starting worker for user', {
      userId,
      activeAgentId,
      forceRestart,
      currentWorkersCount: this.workers.size
    });

    // Check user tier to determine if we should use connection pool
    try {
      const tierInfo = await this.userTierService.getUserTier(userId);
      
      // Validate tierInfo is properly formed
      if (!tierInfo || typeof tierInfo !== 'object') {
        throw new Error('Invalid tier info received');
      }
      
      this.logger.info('User tier detected', { 
        userId, 
        tier: tierInfo.tier,
        hasUsage: !!tierInfo.usage,
        hasLastActivity: !!(tierInfo.usage && tierInfo.usage.lastActivity)
      });
      
      // If user should use connection pool (enterprise_b2b tier)
      if (tierInfo.tier === 'enterprise_b2b') {
        this.logger.info('User should use connection pool, delegating to pool', { 
          userId, 
          tier: tierInfo.tier 
        });
        
        // Delegate to connection pool instead of creating individual worker
        const connection = await this.connectionPool.connectUser(userId);
        
        if (connection) {
          this.logger.info('Connection pool assigned session', { 
            userId, 
            connectionType: connection.connectionType,
            connectionId: connection.connectionId 
          });
          
          // Return a mock WorkerInstance that represents the pool connection
          return {
            process: { pid: -1 } as any, // Mock process with fake PID for pool connections
            userId,
            activeAgentId,
            status: 'connected',
            createdAt: new Date(),
            lastActivity: new Date()
          };
        } else {
          this.logger.error('Connection pool failed to assign session', { userId });
          return null;
        }
      }
      
      this.logger.info('User should use dedicated worker', { userId, tier: tierInfo.tier });
    } catch (error) {
      this.logger.warn('Failed to get user tier, falling back to dedicated worker', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
    }

    // Check for concurrent connection attempts
    if (this.connectingUsers.has(userId)) {
      this.logger.warn('Concurrent connection attempt blocked', { userId });
      return null;
    }

    this.connectingUsers.add(userId);

    try {
      this.logger.info('Step 1: Checking existing workers', { userId });
      
      // Check if worker already exists and is connected
      const existingWorker = this.workers.get(userId);
      if (existingWorker && existingWorker.process.connected && !forceRestart) {
        this.logger.warn('Worker already exists and connected', { 
          userId, 
          pid: existingWorker.process.pid 
        });
        this.connectingUsers.delete(userId);
        return existingWorker;
      }

      // Clean up zombie worker if exists
      if (existingWorker && !existingWorker.process.connected) {
        this.logger.warn('Cleaning up zombie worker', { 
          userId, 
          pid: existingWorker.process.pid 
        });
        await this.cleanupWorker(userId);
      }

      this.logger.info('Step 2: Creating session directory', { userId });
      
      // Create session directory for WhatsApp Web
      const userDataDir = path.join(process.cwd(), 'data_v2', userId);
      const sessionPath = path.join(userDataDir, '.wwebjs_auth');
      
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
        this.logger.info('Created session directory', { userId, sessionPath });
      }

      this.logger.info('Step 3: Checking worker script', { userId });
      
      // Get worker script path - fix to point to correct source file
      const workerScript = path.join(process.cwd(), 'src', 'workers', 'whatsapp-worker', 'index.ts');
      this.logger.info('Worker script path', { userId, workerScript, exists: fs.existsSync(workerScript) });
      
      if (!fs.existsSync(workerScript)) {
        throw new Error(`Worker script not found: ${workerScript}`);
      }

      this.logger.info('Step 4: Resolving agent ID', { userId });
      
      // Get active agent from Supabase
      let resolvedAgentId = activeAgentId;
      if (!resolvedAgentId) {
        try {
          const { data: userData, error } = await this.db.getClient().from('users').select('active_agent_id').eq('id', userId).single();
          if (!error && userData) {
            resolvedAgentId = userData.active_agent_id || null;
          }
          this.logger.debug('Agent resolved from Supabase', { userId, resolvedAgentId });
        } catch (dbError) {
          this.logger.warn('Failed to resolve agent from Supabase, continuing with null', { 
            userId, 
            error: dbError instanceof Error ? dbError.message : 'Unknown error'
          });
        }
      }

      this.logger.debug('Step 5: Starting worker process', { userId, resolvedAgentId });

      // Fork worker process with ts-node
      const args = [userId, resolvedAgentId].filter(Boolean);
      
      this.logger.debug('Starting worker with working command', {
        userId,
        workerScript,
        args
      });

      const workerProcess = fork(workerScript, args, { 
        stdio: 'inherit',
        env: { 
          ...process.env, 
          NODE_ENV: process.env.NODE_ENV,
          TS_NODE_TRANSPILE_ONLY: 'true'
        },
        execArgv: [
          '--require', 'ts-node/register',
          '--require', 'tsconfig-paths/register'
        ]
      });

      this.logger.debug('Step 6: Worker process forked', { 
        userId, 
        pid: workerProcess.pid,
        connected: workerProcess.connected
      });

      // Add immediate error handling for the forked process
      workerProcess.on('error', (error) => {
        this.logger.error('Worker process error immediately after fork', {
          userId,
          error: error.message,
          stack: error.stack
        });
      });

      workerProcess.on('exit', (code, signal) => {
        this.logger.error('Worker process exited immediately after fork', {
          userId,
          code,
          signal,
          pid: workerProcess.pid
        });
      });

      // Wait a moment to see if worker starts successfully
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.logger.info('Worker appears to be starting normally', { userId });
          resolve(true);
        }, 2000);

        workerProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Worker startup error: ${error.message}`));
        });

        workerProcess.on('exit', (code, signal) => {
          clearTimeout(timeout);
          reject(new Error(`Worker exited during startup with code ${code} signal ${signal}`));
        });
      });

      // Create worker instance
      const workerInstance: WorkerInstance = {
        process: workerProcess,
        userId,
        activeAgentId: resolvedAgentId,
        status: 'starting',
        createdAt: new Date(),
        lastActivity: new Date()
      };

      this.workers.set(userId, workerInstance);
      this.logger.debug('Step 7: Worker instance created and stored', { userId });

      // Update Supabase - main document and status subcollection
      try {
        this.logger.debug('Step 8: Updating Supabase', { userId });
        
        const timestamp = new Date().toISOString();

        await Promise.all([
          this.db.getClient().from('users').update({
            worker_pid: workerProcess.pid,
            last_error: null,
            updated_at: timestamp
          }).eq('id', userId),
          this.db.getClient().from('user_status').upsert({
            user_id: userId,
            platform: 'whatsapp',
            status: 'connecting',
            last_error: null,
            last_qr_code: null,
            updated_at: timestamp
          })
        ]);
        
        this.logger.debug('Step 8: Supabase updated successfully', { userId });
      } catch (dbUpdateError) {
        this.logger.warn('Failed to update Supabase, continuing anyway', {
          userId,
          error: dbUpdateError instanceof Error ? dbUpdateError.message : 'Unknown error'
        });
      }

      this.logger.debug('Step 9: Setting up event handlers', { userId });
      
      // Setup worker event handlers
      this.setupWorkerEventHandlers(workerInstance);

      this.logger.debug('Step 10: Sending initial configuration', { userId });
      
      // Send initial configuration
      try {
        await this.sendInitialConfiguration(userId, resolvedAgentId);
        this.logger.debug('Step 10: Initial configuration sent', { userId });
      } catch (configError) {
        this.logger.warn('Failed to send initial configuration, continuing anyway', {
          userId,
          error: configError instanceof Error ? configError.message : 'Unknown error'
        });
      }

      this.connectingUsers.delete(userId);
      
      this.logger.info('Worker started successfully', {
        userId,
        pid: workerProcess.pid,
        activeAgentId: resolvedAgentId
      });

      this.emit('workerStarted', { userId, worker: workerInstance });
      return workerInstance;

    } catch (error) {
      this.connectingUsers.delete(userId);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : 'No stack trace';
      
      this.logger.error('Failed to start worker - DETAILED ERROR', {
        userId,
        error: errorMessage,
        stack: errorStack,
        errorType: typeof error,
        errorConstructor: error?.constructor?.name,
        fullError: error,
        stringifiedError: JSON.stringify(error, null, 2)
      });

      // Update Supabase with error status
      try {
        await this.db.getClient().from('user_status').upsert({
          user_id: userId,
          platform: 'whatsapp',
          status: 'error',
          last_error: errorMessage,
          updated_at: new Date().toISOString()
        });
      } catch (dbError) {
        this.logger.error('Failed to update error status in Supabase', {
          userId,
          dbError: dbError instanceof Error ? dbError.message : 'Unknown error'
        });
      }

      // Return detailed error instead of null
      throw new Error(`Worker startup failed: ${errorMessage}`);
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 749-843
   * FUNCIÓN: stopWorker(userId)
   * MEJORAS: async/await, error handling mejorado, cleanup completo
   */
  public async stopWorker(userId: string): Promise<boolean> {
    this.logger.info('Stopping worker', { userId });

    const workerInstance = this.workers.get(userId);
    const timestamp = new Date().toISOString();
    const chromeCleanup = ChromeCleanupService.getInstance();
    
    // Check if user is in connection pool
    const poolManager = this.connectionPool;
    const userConnections = poolManager.getUserConnections();
    const isInPool = userConnections.has(userId);
    
    this.logger.info('Stop worker check', { 
      userId, 
      hasWorkerInstance: !!workerInstance,
      isInPool,
      totalPoolConnections: userConnections.size
    });
    
    if (workerInstance && workerInstance.process.connected) {
      try {
        // Update Supabase first
        await Promise.all([
          this.db.getClient().from('users').update({ 
            worker_pid: null, 
            updated_at: timestamp 
          }).eq('id', userId),
          this.db.getClient().from('user_status').upsert({
            user_id: userId,
            platform: 'whatsapp',
            status: 'disconnected',
            last_qr_code: null,
            last_error: null,
            updated_at: timestamp
          })
        ]);

        // Send shutdown command to worker
        if (workerInstance.process.connected) {
          this.logger.debug('Sending SHUTDOWN command to worker', { 
            userId, 
            pid: workerInstance.process.pid 
          });
          
          workerInstance.process.send({ 
            type: 'COMMAND', 
            command: 'SHUTDOWN' 
          });

          // Wait for graceful shutdown with timeout
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              this.logger.warn('Worker shutdown timeout, forcing kill', { userId });
              workerInstance.process.kill('SIGTERM');
              resolve();
            }, 5000);

            workerInstance.process.once('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          });
        }

        await this.cleanupWorker(userId);
        
        // Clean up any Chrome processes for this user
        await chromeCleanup.cleanupUserSession(userId);
        
        this.logger.info('Worker stopped successfully', { userId });
        this.emit('workerStopped', { userId });
        return true;

      } catch (error) {
        this.logger.error('Error stopping worker', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Force cleanup on error
        await this.cleanupWorker(userId);
        await chromeCleanup.cleanupUserSession(userId);
        return true;
      }
    } else if (isInPool) {
      // User is in connection pool, disconnect from pool
      this.logger.info('Disconnecting user from connection pool', { userId });
      
      try {
        // Disconnect from connection pool
        await poolManager.disconnectUser(userId);
        
        // Update database
        await Promise.all([
          this.db.getClient().from('users').update({ 
            worker_pid: null, 
            updated_at: timestamp 
          }).eq('id', userId),
          this.db.getClient().from('user_status').upsert({
            user_id: userId,
            platform: 'whatsapp',
            status: 'disconnected',
            last_error: null,
            last_qr_code: null,
            updated_at: timestamp
          })
        ]);

        // Clean up any Chrome processes for this user
        await chromeCleanup.cleanupUserSession(userId);
        
        this.logger.info('User disconnected from connection pool successfully', { userId });
        this.emit('workerStopped', { userId });
        return true;
        
      } catch (error) {
        this.logger.error('Error disconnecting user from connection pool', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
      }
    } else {
      // Neither worker nor pool connection found, ensure database is consistent
      this.logger.debug('No worker or pool connection found, ensuring database consistency', { userId });
      
      try {
        await Promise.all([
          this.db.getClient().from('users').update({ 
            worker_pid: null, 
            updated_at: timestamp 
          }).eq('id', userId),
          this.db.getClient().from('user_status').upsert({
            user_id: userId,
            platform: 'whatsapp',
            status: 'disconnected',
            last_error: null,
            last_qr_code: null,
            updated_at: timestamp
          })
        ]);

        this.logger.debug('Supabase status updated to disconnected', { userId });
      } catch (error) {
        this.logger.error('Error updating Supabase status on worker stop', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      return false;
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 315-340
   * FUNCIÓN: notifyWorker(userId, message)
   * MEJORAS: Type safety, error handling, validation
   */
  public async notifyWorker(userId: string, message: WorkerMessage): Promise<boolean> {
    const workerInstance = this.workers.get(userId);
    
    if (!workerInstance) {
      this.logger.error('Cannot notify worker: worker not found', { userId });
      return false;
    }

    if (!workerInstance.process.connected) {
      this.logger.error('Cannot notify worker: process not connected', { userId });
      return false;
    }

    try {
      this.logger.debug('Sending message to worker', {
        userId,
        messageType: message.type,
        command: message.command
      });

      const result = workerInstance.process.send(message);
      workerInstance.lastActivity = new Date();
      
      return result !== false;
    } catch (error) {
      this.logger.error('Error sending message to worker', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get worker instance by userId
   */
  public getWorker(userId: string): WorkerInstance | undefined {
    return this.workers.get(userId);
  }

  /**
   * Get all active workers
   */
  public getAllWorkers(): Map<string, WorkerInstance> {
    return new Map(this.workers);
  }

  /**
   * Get count of active workers
   */
  public getActiveWorkerCount(): number {
    let activeCount = 0;
    for (const worker of this.workers.values()) {
      if (worker.process.connected && worker.status === 'connected') {
        activeCount++;
      }
    }
    return activeCount;
  }

  /**
   * Check if worker is active and connected
   */
  public isWorkerActive(userId: string): boolean {
    const worker = this.workers.get(userId);
    return worker ? worker.process.connected : false;
  }

  /**
   * Get worker status
   */
  public getWorkerStatus(userId: string): string {
    const worker = this.workers.get(userId);
    return worker ? worker.status : 'not_found';
  }

  /**
   * Send message to worker
   */
  public async sendMessageToWorker(userId: string, message: any): Promise<boolean> {
    return this.notifyWorker(userId, message);
  }

  /**
   * Send a WhatsApp message through the worker
   */
  public async sendMessage(userId: string, chatId: string, message: string): Promise<boolean> {
    try {
      const worker = this.workers.get(userId);
      if (!worker) {
        this.logger.error('Worker not found for sendMessage', { userId });
        return false;
      }

      const messagePayload: any = {
        type: 'SEND_MESSAGE',
        chatId,
        message,
        timestamp: new Date().toISOString()
      };

      return await this.notifyWorker(userId, messagePayload);
    } catch (error) {
      this.logger.error('Failed to send message through worker', { userId, chatId, error });
      return false;
    }
  }

  /**
   * Send a command to the worker
   */
  public sendCommand(userId: string, command: string): void {
    try {
      const worker = this.workers.get(userId);
      if (!worker) {
        this.logger.error('Worker not found for sendCommand', { userId });
        return;
      }

      const commandPayload: any = {
        type: 'COMMAND',
        command,
        timestamp: new Date().toISOString()
      };

      this.notifyWorker(userId, commandPayload);
    } catch (error) {
      this.logger.error('Failed to send command to worker', { userId, command, error });
    }
  }

  /**
   * MIGRADO DE: whatsapp-api/src/server.js líneas 660-748
   * FUNCIÓN: fetchInitialConfigsAndNotifyWorker(userId, activeAgentId)
   * MEJORAS: Async/await, error handling, structured data
   */
  private async sendInitialConfiguration(userId: string, activeAgentId?: string): Promise<void> {
    this.logger.debug('Preparing initial configuration for worker', { 
      userId, 
      activeAgentId 
    });

    try {
      // Get agent configuration
      let agentConfigData = null;
      if (activeAgentId) {
        const agentQuery = this.db.getClient().from('agents')
          .select('*')
          .eq('user_id', userId)
          .eq('id', activeAgentId);
        
        const { data: agentData, error } = await agentQuery.single();
        
        if (!error && agentData) {
          agentConfigData = agentData;
          this.logger.debug('Agent configuration loaded', { userId, activeAgentId });
        } else {
          this.logger.warn('Active agent not found in Supabase', { userId, activeAgentId });
        }
      }

      // Get rules, starters, and flows in parallel
      const [rulesResult, startersResult, flowsResult] = await Promise.all([
        this.db.getClient().from('rules').select('*').eq('user_id', userId),
        this.db.getClient().from('gemini_starters').select('*').eq('user_id', userId),
        this.db.getClient().from('action_flows').select('*').eq('user_id', userId)
      ]);

      const rulesData = rulesResult.data || [];
      const startersData = startersResult.data || [];
      const flowsData = flowsResult.data || [];

      this.logger.debug('Configuration data loaded', {
        userId,
        rulesCount: rulesData.length,
        startersCount: startersData.length,
        flowsCount: flowsData.length
      });

      // Send initial configuration to worker
      await this.notifyWorker(userId, {
        type: 'COMMAND',
        command: 'INITIAL_CONFIG',
        payload: {
          agentConfig: agentConfigData,
          rules: rulesData,
          starters: startersData,
          flows: flowsData
        }
      });

    } catch (error) {
      this.logger.error('Failed to send initial configuration', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Setup event handlers for worker process
   */
  private setupWorkerEventHandlers(workerInstance: WorkerInstance): void {
    const { process: workerProcess, userId } = workerInstance;

    // Handle IPC messages from worker
    workerProcess.on('message', (message: WorkerMessage) => {
      this.ipcHandler.handleWorkerMessage(userId, message);
      workerInstance.lastActivity = new Date();
    });

    // Handle worker process exit
    workerProcess.on('exit', async (code, signal) => {
      this.logger.warn('Worker process exited', {
        userId,
        pid: workerProcess.pid,
        code,
        signal
      });

      const workerExisted = this.workers.has(userId);
      await this.cleanupWorker(userId);

      try {
        const timestamp = new Date().toISOString();

        // Update Supabase status
        await this.db.getClient().from('users').update({ 
          worker_pid: null, 
          updated_at: timestamp 
        }).eq('id', userId);

        // Only update status to 'error' if worker existed and current status is not 'disconnected'
        const statusQuery = this.db.getClient().from('user_status')
          .select('status')
          .eq('user_id', userId)
          .eq('platform', 'whatsapp');
        
        const { data: statusData } = await statusQuery.single();
        
        if (workerExisted && (!statusData || statusData.status !== 'disconnected')) {
          const exitErrorMsg = `Worker exited with code ${code}${signal ? ` (signal ${signal})` : ''} unexpectedly`;
          
          await this.db.getClient().from('user_status').upsert({
            user_id: userId,
            platform: 'whatsapp',
            status: 'error',
            last_error: exitErrorMsg,
            updated_at: timestamp
          });
        }

        this.connectingUsers.delete(userId);
        this.emit('workerExited', { userId, code, signal });

      } catch (error) {
        this.logger.error('Error updating Supabase on worker exit', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Handle worker process errors
    workerProcess.on('error', async (error) => {
      this.logger.error('Worker process error', {
        userId,
        pid: workerProcess.pid,
        error: error.message
      });

      await this.cleanupWorker(userId);
      this.connectingUsers.delete(userId);

      try {
        const timestamp = new Date().toISOString();

        await Promise.all([
          this.db.getClient().from('users').update({ 
            worker_pid: null, 
            updated_at: timestamp 
          }).eq('id', userId),
          this.db.getClient().from('user_status').upsert({
            user_id: userId,
            platform: 'whatsapp',
            status: 'error',
            last_error: error.message || 'Unknown worker error',
            updated_at: timestamp
          })
        ]);

        this.emit('workerError', { userId, error });

      } catch (dbError) {
        this.logger.error('Error updating Supabase on worker error', {
          userId,
          dbError: dbError instanceof Error ? dbError.message : 'Unknown error'
        });
      }
    });
  }

  /**
   * Cleanup worker instance and references
   */
  private async cleanupWorker(userId: string): Promise<void> {
    const workerInstance = this.workers.get(userId);
    
    if (workerInstance) {
      try {
        if (workerInstance.process && !workerInstance.process.killed) {
          workerInstance.process.kill('SIGTERM');
        }
      } catch (error) {
        this.logger.error('Error killing worker process', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      
      this.workers.delete(userId);
      this.logger.debug('Worker instance cleaned up', { userId });
    }
  }

  /**
   * Setup global event handlers
   */
  private setupEventHandlers(): void {
    // Handle process shutdown
    process.on('SIGINT', async () => {
      this.logger.info('Received SIGINT, shutting down all workers...');
      
      const shutdownPromises = Array.from(this.workers.keys()).map(userId => 
        this.stopWorker(userId)
      );
      
      await Promise.allSettled(shutdownPromises);
      this.logger.info('All workers shutdown completed');
    });

    process.on('SIGTERM', async () => {
      this.logger.info('Received SIGTERM, shutting down all workers...');
      
      const shutdownPromises = Array.from(this.workers.keys()).map(userId => 
        this.stopWorker(userId)
      );
      
      await Promise.allSettled(shutdownPromises);
      this.logger.info('All workers shutdown completed');
    });
  }

  /**
   * Get connection pool instance
   */
  public getConnectionPool(): WhatsAppConnectionPool {
    return this.connectionPool;
  }

  /**
   * Pause user bot - stops responding to messages but keeps connection alive
   */
  public async pauseUserBot(userId: string): Promise<void> {
    this.logger.info('Pausing user bot', { userId });
    
    const workerInstance = this.workers.get(userId);
    const poolManager = this.connectionPool;
    const userConnections = poolManager.getUserConnections();
    const isInPool = userConnections.has(userId);
    
    this.logger.info('Pause bot check', { 
      userId, 
      hasWorkerInstance: !!workerInstance,
      isInPool
    });
    
    if (workerInstance && workerInstance.process.connected) {
      // For individual workers, send pause command
      try {
        workerInstance.process.send({ 
          type: 'COMMAND', 
          command: 'PAUSE_BOT',
          userId 
        });
        
        this.logger.info('Pause command sent to individual worker', { userId });
      } catch (error) {
        this.logger.error('Error pausing individual worker', { userId, error });
        throw error;
      }
    } else if (isInPool) {
      // For connection pool users, set pause flag in user session
      try {
        const paused = poolManager.pauseUser(userId);
        if (paused) {
          this.logger.info('User in connection pool - pause flag set', { userId });
        } else {
          this.logger.warn('User session not found in connection pool', { userId });
          throw new Error('User session not found in connection pool');
        }
      } catch (error) {
        this.logger.error('Error pausing user in connection pool', { userId, error });
        throw error;
      }
    } else {
      this.logger.warn('No worker or pool connection found for user', { userId });
      throw new Error('User not connected - cannot pause');
    }
  }

  /**
   * Resume user bot - start responding to messages again
   */
  public async resumeUserBot(userId: string): Promise<void> {
    this.logger.info('Resuming user bot', { userId });
    
    const workerInstance = this.workers.get(userId);
    const poolManager = this.connectionPool;
    const userConnections = poolManager.getUserConnections();
    const isInPool = userConnections.has(userId);
    
    this.logger.info('Resume bot check', { 
      userId, 
      hasWorkerInstance: !!workerInstance,
      isInPool
    });
    
    if (workerInstance && workerInstance.process.connected) {
      // For individual workers, send resume command
      try {
        workerInstance.process.send({ 
          type: 'COMMAND', 
          command: 'RESUME_BOT',
          userId 
        });
        
        this.logger.info('Resume command sent to individual worker', { userId });
      } catch (error) {
        this.logger.error('Error resuming individual worker', { userId, error });
        throw error;
      }
    } else if (isInPool) {
      // For connection pool users, remove pause flag from user session
      try {
        const resumed = poolManager.resumeUser(userId);
        if (resumed) {
          this.logger.info('User in connection pool - pause flag removed', { userId });
        } else {
          this.logger.warn('User session not found in connection pool', { userId });
          throw new Error('User session not found in connection pool');
        }
      } catch (error) {
        this.logger.error('Error resuming user in connection pool', { userId, error });
        throw error;
      }
    } else {
      this.logger.warn('No worker or pool connection found for user', { userId });
      throw new Error('User not connected - cannot resume');
    }
  }

  /**
   * Shutdown all workers
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down WhatsApp Worker Manager');
    
    const shutdownPromises = Array.from(this.workers.keys()).map(userId => 
      this.stopWorker(userId)
    );
    
    await Promise.allSettled(shutdownPromises);
    this.workers.clear();
    
    this.logger.info('WhatsApp Worker Manager shutdown completed');
  }
} 