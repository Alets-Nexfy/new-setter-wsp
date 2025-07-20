import { ChildProcess, fork } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { LoggerService } from '@/core/services/LoggerService';
import { DatabaseService } from '@/core/services/DatabaseService';
import { WebSocketService } from '@/core/services/websocketService';
import { WorkerIPCHandler } from './WorkerIPCHandler';
import { FieldValue } from 'firebase-admin/firestore';

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
  private db: DatabaseService;
  private wsService: WebSocketService;
  private ipcHandler: WorkerIPCHandler;

  constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.db = DatabaseService.getInstance();
    this.wsService = WebSocketService.getInstance();
    this.ipcHandler = new WorkerIPCHandler(this);
    
    this.setupEventHandlers();
  }

  public static getInstance(): WhatsAppWorkerManager {
    if (!WhatsAppWorkerManager.instance) {
      WhatsAppWorkerManager.instance = new WhatsAppWorkerManager();
    }
    return WhatsAppWorkerManager.instance;
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

    // Check for concurrent connection attempts
    if (this.connectingUsers.has(userId)) {
      this.logger.warn('Concurrent connection attempt blocked', { userId });
      return null;
    }

    this.connectingUsers.add(userId);

    try {
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

      // Create session directory for WhatsApp Web
      const userDataDir = path.join(process.cwd(), 'data_v2', userId);
      const sessionPath = path.join(userDataDir, '.wwebjs_auth');
      
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
        this.logger.debug('Created session directory', { userId, sessionPath });
      }

      // Get worker script path
      const workerScript = path.join(__dirname, 'index.ts');
      if (!fs.existsSync(workerScript)) {
        throw new Error(`Worker script not found: ${workerScript}`);
      }

      // Get active agent from Firestore
      let resolvedAgentId = activeAgentId;
      if (!resolvedAgentId) {
        const userDoc = await this.db.doc('users', userId).get();
        if (userDoc.exists) {
          resolvedAgentId = userDoc.data()?.active_agent_id || null;
        }
      }

      this.logger.debug('Resolved agent for worker', { 
        userId, 
        activeAgentId: resolvedAgentId 
      });

      // Fork worker process
      const workerArgs = [userId];
      if (resolvedAgentId) {
        workerArgs.push(resolvedAgentId);
      }

      const workerProcess = fork(workerScript, workerArgs, { 
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: process.env.NODE_ENV }
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

      // Update Firestore - main document and status subcollection
      const timestamp = FieldValue.serverTimestamp();
      const userDocRef = this.db.collection('users').doc(userId);
      const statusDocRef = userDocRef.collection('status').doc('whatsapp');

      await Promise.all([
        userDocRef.update({
          worker_pid: workerProcess.pid,
          last_error: null,
          updatedAt: timestamp
        }),
        statusDocRef.set({
          status: 'connecting',
          last_error: null,
          last_qr_code: null,
          updatedAt: timestamp
        }, { merge: true })
      ]);

      // Setup worker event handlers
      this.setupWorkerEventHandlers(workerInstance);

      // Send initial configuration
      await this.sendInitialConfiguration(userId, resolvedAgentId);

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
      this.logger.error('Failed to start worker', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Update Firestore with error status
      try {
        const statusDocRef = this.db
          .collection('users')
          .doc(userId)
          .collection('status')
          .doc('whatsapp');
        
        await statusDocRef.set({
          status: 'error',
          last_error: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (dbError) {
        this.logger.error('Failed to update error status in Firestore', {
          userId,
          dbError: dbError instanceof Error ? dbError.message : 'Unknown error'
        });
      }

      return null;
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
    const timestamp = FieldValue.serverTimestamp();
    
    if (workerInstance && workerInstance.process.connected) {
      try {
        // Update Firestore first
        const userDocRef = this.db.collection('users').doc(userId);
        const statusDocRef = userDocRef.collection('status').doc('whatsapp');

        await Promise.all([
          userDocRef.update({ 
            worker_pid: null, 
            updatedAt: timestamp 
          }),
          statusDocRef.set({
            status: 'disconnected',
            last_qr_code: null,
            last_error: null,
            updatedAt: timestamp
          }, { merge: true })
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
        return true;
      }
    } else {
      // Worker not found or not connected, ensure Firestore is consistent
      this.logger.debug('Worker not found or not connected, ensuring Firestore consistency', { userId });
      
      try {
        const userDocRef = this.db.collection('users').doc(userId);
        const statusDocRef = userDocRef.collection('status').doc('whatsapp');

        await Promise.all([
          userDocRef.update({ 
            worker_pid: null, 
            updatedAt: timestamp 
          }),
          statusDocRef.set({
            status: 'disconnected',
            last_error: null,
            last_qr_code: null,
            updatedAt: timestamp
          }, { merge: true })
        ]);

        this.logger.debug('Firestore status updated to disconnected', { userId });
      } catch (error) {
        this.logger.error('Error updating Firestore status on worker stop', {
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
      const userDocRef = this.db.collection('users').doc(userId);

      // Get agent configuration
      let agentConfigData = null;
      if (activeAgentId) {
        const agentDoc = await userDocRef.collection('agents').doc(activeAgentId).get();
        if (agentDoc.exists) {
          agentConfigData = agentDoc.data();
          this.logger.debug('Agent configuration loaded', { userId, activeAgentId });
        } else {
          this.logger.warn('Active agent not found in Firestore', { userId, activeAgentId });
        }
      }

      // Get rules, starters, and flows in parallel
      const [rulesSnapshot, startersSnapshot, flowsSnapshot] = await Promise.all([
        userDocRef.collection('rules').get(),
        userDocRef.collection('gemini_starters').get(),
        userDocRef.collection('action_flows').get()
      ]);

      const rulesData = rulesSnapshot.docs.map(doc => doc.data());
      const startersData = startersSnapshot.docs.map(doc => doc.data());
      const flowsData = flowsSnapshot.docs.map(doc => doc.data());

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
        const timestamp = FieldValue.serverTimestamp();
        const userDocRef = this.db.collection('users').doc(userId);
        const statusDocRef = userDocRef.collection('status').doc('whatsapp');

        // Update Firestore status
        await userDocRef.update({ 
          worker_pid: null, 
          updatedAt: timestamp 
        });

        // Only update status to 'error' if worker existed and current status is not 'disconnected'
        const statusDoc = await statusDocRef.get();
        if (workerExisted && 
            (!statusDoc.exists || statusDoc.data()?.status !== 'disconnected')) {
          
          const exitErrorMsg = `Worker exited with code ${code}${signal ? ` (signal ${signal})` : ''} unexpectedly`;
          
          await statusDocRef.set({
            status: 'error',
            last_error: exitErrorMsg,
            updatedAt: timestamp
          }, { merge: true });
        }

        this.connectingUsers.delete(userId);
        this.emit('workerExited', { userId, code, signal });

      } catch (error) {
        this.logger.error('Error updating Firestore on worker exit', {
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
        const timestamp = FieldValue.serverTimestamp();
        const userDocRef = this.db.collection('users').doc(userId);
        const statusDocRef = userDocRef.collection('status').doc('whatsapp');

        await Promise.all([
          userDocRef.update({ 
            worker_pid: null, 
            updatedAt: timestamp 
          }),
          statusDocRef.set({
            status: 'error',
            last_error: error.message || 'Unknown worker error',
            updatedAt: timestamp
          }, { merge: true })
        ]);

        this.emit('workerError', { userId, error });

      } catch (dbError) {
        this.logger.error('Error updating Firestore on worker error', {
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
} 