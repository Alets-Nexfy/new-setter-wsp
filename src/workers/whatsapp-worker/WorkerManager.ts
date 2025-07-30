import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import Queue from 'bull';
import { createClient } from 'redis';
import { DatabaseService } from '@/core/services/DatabaseService';
import { LoggerService } from '@/core/services/LoggerService';

interface WorkerConfig {
  userId: string;
  sessionId: string;
  phoneNumber?: string;
  agentId?: string;
  maxRestarts: number;
  restartDelay: number;
  timeout: number;
  puppeteerConfig: {
    headless: boolean;
    args: string[];
    executablePath?: string;
  };
}

interface WorkerStatus {
  userId: string;
  processId: number | null;
  status: 'starting' | 'running' | 'paused' | 'error' | 'stopped';
  qrCode?: string;
  qrImage?: string;
  lastActivity: Date;
  restartCount: number;
  isAuthenticated: boolean;
  phoneNumber?: string;
  agentId?: string;
  errorMessage?: string;
  uptime: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

interface IPCMessage {
  type: 'qr' | 'ready' | 'message' | 'auth_failure' | 'error' | 'status' | 'response' | 'command';
  userId: string;
  data: any;
  timestamp: Date;
  messageId?: string;
}

interface MessageData {
  from: string;
  to: string;
  body: string;
  type: 'chat' | 'group';
  timestamp: Date;
  messageId: string;
  hasMedia: boolean;
  mediaType?: string;
  isFromMe: boolean;
}

export class WhatsAppWorkerManager extends EventEmitter {
  private workers: Map<string, ChildProcess> = new Map();
  private workerConfigs: Map<string, WorkerConfig> = new Map();
  private workerStatuses: Map<string, WorkerStatus> = new Map();
  private messageQueue: Queue;
  private logger: Logger;
  private redis: any;
  private firebase: FirebaseService;
  private isShuttingDown: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly WORKER_SCRIPT_PATH: string;
  private readonly DATA_DIR: string;
  private readonly MAX_WORKERS: number = 50;
  private readonly HEALTH_CHECK_INTERVAL: number = 30000; // 30 seconds
  private readonly WORKER_TIMEOUT: number = 300000; // 5 minutes
  private readonly MAX_MEMORY_MB: number = 512; // 512MB per worker

  constructor() {
    super();
    this.logger = LoggerService.getInstance();
    this.firebase = DatabaseService.getInstance();
    this.WORKER_SCRIPT_PATH = path.join(__dirname, 'worker-process.js');
    this.DATA_DIR = process.env.USER_DATA_PATH || './data_v2';
    
    this.messageQueue = new Queue('whatsapp-messages', process.env.REDIS_URL || 'redis://localhost:6379');
    this.redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    
    this.setupEventHandlers();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      await this.ensureDataDirectories();
      await this.createWorkerScript();
      await this.restoreWorkersFromDatabase();
      this.startHealthCheckInterval();
      
      this.logger.info('WorkerManager inicializado correctamente');
      this.emit('manager:ready');
    } catch (error) {
      this.logger.error('Error inicializando WorkerManager:', error);
      throw error;
    }
  }

  private async ensureDataDirectories(): Promise<void> {
    const directories = [
      this.DATA_DIR,
      path.join(this.DATA_DIR, 'sessions'),
      path.join(this.DATA_DIR, 'uploads'),
      path.join(this.DATA_DIR, 'logs'),
      path.join(this.DATA_DIR, 'qr-codes')
    ];

    for (const dir of directories) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        this.logger.info(`Directorio creado: ${dir}`);
      }
    }
  }

  private async createWorkerScript(): Promise<void> {
    const workerScript = `#!/usr/bin/env node

// Worker Process Script - Ejecuta WhatsAppWorker en proceso separado
const { WhatsAppWorker } = require('./WhatsAppWorker');
const path = require('path');

// Configurar TypeScript para el worker
require('ts-node/register');
require('tsconfig-paths/register');

process.on('message', async (message) => {
  const { type, userId, data } = message;
  
  if (type === 'init') {
    try {
      const worker = new WhatsAppWorker(userId, data.config);
      
      // Configurar listeners del worker
      worker.on('qr', (qr, qrImage) => {
        process.send({
          type: 'qr',
          userId,
          data: { qr, qrImage },
          timestamp: new Date()
        });
      });

      worker.on('ready', (phoneNumber) => {
        process.send({
          type: 'ready',
          userId,
          data: { phoneNumber },
          timestamp: new Date()
        });
      });

      worker.on('message', (messageData) => {
        process.send({
          type: 'message',
          userId,
          data: messageData,
          timestamp: new Date()
        });
      });

      worker.on('auth_failure', (error) => {
        process.send({
          type: 'auth_failure',
          userId,
          data: { error: error.message },
          timestamp: new Date()
        });
      });

      worker.on('error', (error) => {
        process.send({
          type: 'error',
          userId,
          data: { error: error.message, stack: error.stack },
          timestamp: new Date()
        });
      });

      // Inicializar worker
      await worker.initialize();
      
      // Responder con éxito
      process.send({
        type: 'initialized',
        userId,
        data: { success: true },
        timestamp: new Date()
      });

      // Mantener referencia global del worker
      global.workerInstance = worker;
      
    } catch (error) {
      process.send({
        type: 'error',
        userId,
        data: { error: error.message, stack: error.stack },
        timestamp: new Date()
      });
      process.exit(1);
    }
  } else if (type === 'command' && global.workerInstance) {
    try {
      const worker = global.workerInstance;
      const { command, params } = data;
      
      let result;
      switch (command) {
        case 'sendMessage':
          result = await worker.sendMessage(params.to, params.message, params.options);
          break;
        case 'pauseBot':
          result = await worker.pauseBot();
          break;
        case 'resumeBot':
          result = await worker.resumeBot();
          break;
        case 'setAgent':
          result = await worker.setActiveAgent(params.agentId);
          break;
        case 'getStatus':
          result = await worker.getStatus();
          break;
        case 'disconnect':
          result = await worker.disconnect();
          break;
        default:
          throw new Error(\`Comando desconocido: \${command}\`);
      }
      
      process.send({
        type: 'response',
        userId,
        data: { success: true, result, command },
        timestamp: new Date(),
        messageId: data.messageId
      });
      
    } catch (error) {
      process.send({
        type: 'response',
        userId,
        data: { success: false, error: error.message, command: data.command },
        timestamp: new Date(),
        messageId: data.messageId
      });
    }
  }
});

// Manejar señales de cierre
const gracefulShutdown = async (signal) => {
  console.log(\`Worker process received \${signal}, shutting down gracefully...\`);
  
  if (global.workerInstance) {
    try {
      await global.workerInstance.shutdown();
    } catch (error) {
      console.error('Error during worker shutdown:', error);
    }
  }
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in worker process:', error);
  process.send({
    type: 'error',
    userId: process.env.WORKER_USER_ID,
    data: { error: error.message, stack: error.stack },
    timestamp: new Date()
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection in worker process:', reason);
  process.send({
    type: 'error',
    userId: process.env.WORKER_USER_ID,
    data: { error: reason?.message || 'Unhandled rejection', stack: reason?.stack },
    timestamp: new Date()
  });
});

console.log('Worker process initialized and waiting for commands...');
`;

    const scriptPath = path.join(__dirname, 'worker-process.js');
    await fs.writeFile(scriptPath, workerScript, 'utf8');
    this.logger.info('Worker script creado:', scriptPath);
  }

  private setupEventHandlers(): void {
    // Manejar cierre gracioso
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    
    // Limpiar workers muertos
    setInterval(() => {
      this.cleanupDeadWorkers();
    }, 60000); // Cada minuto
  }

  public async createWorker(userId: string, config: Partial<WorkerConfig> = {}): Promise<boolean> {
    if (this.workers.has(userId)) {
      this.logger.warn(`Worker ya existe para usuario: ${userId}`);
      return false;
    }

    if (this.workers.size >= this.MAX_WORKERS) {
      this.logger.error('Límite máximo de workers alcanzado');
      throw new Error('Límite máximo de workers alcanzado');
    }

    const workerConfig: WorkerConfig = {
      userId,
      sessionId: config.sessionId || uuidv4(),
      phoneNumber: config.phoneNumber,
      agentId: config.agentId,
      maxRestarts: config.maxRestarts || 3,
      restartDelay: config.restartDelay || 5000,
      timeout: config.timeout || this.WORKER_TIMEOUT,
      puppeteerConfig: {
        headless: config.puppeteerConfig?.headless ?? (process.env.WHATSAPP_PUPPETEER_HEADLESS === 'true'),
        args: config.puppeteerConfig?.args || [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        executablePath: config.puppeteerConfig?.executablePath
      }
    };

    try {
      const workerProcess = await this.spawnWorkerProcess(userId, workerConfig);
      
      if (workerProcess) {
        this.workers.set(userId, workerProcess);
        this.workerConfigs.set(userId, workerConfig);
        
        const status: WorkerStatus = {
          userId,
          processId: workerProcess.pid || null,
          status: 'starting',
          lastActivity: new Date(),
          restartCount: 0,
          isAuthenticated: false,
          uptime: 0
        };
        
        this.workerStatuses.set(userId, status);
        await this.saveWorkerStatusToDatabase(userId, status);
        
        this.logger.info(`Worker creado para usuario: ${userId}, PID: ${workerProcess.pid}`);
        this.emit('worker:created', { userId, processId: workerProcess.pid });
        
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Error creando worker para ${userId}:`, error);
      throw error;
    }
  }

  private async spawnWorkerProcess(userId: string, config: WorkerConfig): Promise<ChildProcess | null> {
    const userDataPath = path.join(this.DATA_DIR, 'sessions', userId);
    
    try {
      await fs.mkdir(userDataPath, { recursive: true });
    } catch (error) {
      this.logger.error(`Error creando directorio para usuario ${userId}:`, error);
      throw error;
    }

    const env = {
      ...process.env,
      WORKER_USER_ID: userId,
      USER_DATA_PATH: userDataPath,
      NODE_ENV: process.env.NODE_ENV || 'development',
      DEBUG: process.env.DEBUG || ''
    };

    const workerProcess = spawn('node', [
      '--require', 'ts-node/register',
      '--require', 'tsconfig-paths/register',
      this.WORKER_SCRIPT_PATH
    ], {
      env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      cwd: process.cwd()
    });

    if (!workerProcess.pid) {
      throw new Error('No se pudo obtener PID del proceso worker');
    }

    // Configurar listeners del proceso
    this.setupWorkerProcessListeners(userId, workerProcess);

    // Inicializar el worker
    workerProcess.send({
      type: 'init',
      userId,
      data: { config },
      timestamp: new Date()
    });

    return workerProcess;
  }

  private setupWorkerProcessListeners(userId: string, workerProcess: ChildProcess): void {
    // Manejar mensajes del worker
    workerProcess.on('message', (message: IPCMessage) => {
      this.handleWorkerMessage(userId, message);
    });

    // Manejar stdout del worker
    workerProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        this.logger.debug(`Worker ${userId} stdout:`, output);
      }
    });

    // Manejar stderr del worker
    workerProcess.stderr?.on('data', (data) => {
      const error = data.toString().trim();
      if (error) {
        this.logger.error(`Worker ${userId} stderr:`, error);
      }
    });

    // Manejar salida del proceso
    workerProcess.on('exit', (code, signal) => {
      this.handleWorkerExit(userId, code, signal);
    });

    // Manejar errores del proceso
    workerProcess.on('error', (error) => {
      this.logger.error(`Error en worker process ${userId}:`, error);
      this.updateWorkerStatus(userId, { 
        status: 'error', 
        errorMessage: error.message,
        lastActivity: new Date()
      });
    });
  }

  private async handleWorkerMessage(userId: string, message: IPCMessage): Promise<void> {
    try {
      this.updateWorkerStatus(userId, { lastActivity: new Date() });

      switch (message.type) {
        case 'qr':
          await this.handleQRCode(userId, message.data);
          break;

        case 'ready':
          await this.handleWorkerReady(userId, message.data);
          break;

        case 'message':
          await this.handleIncomingMessage(userId, message.data);
          break;

        case 'auth_failure':
          await this.handleAuthFailure(userId, message.data);
          break;

        case 'error':
          await this.handleWorkerError(userId, message.data);
          break;

        case 'response':
          this.emit('worker:response', { userId, data: message.data, messageId: message.messageId });
          break;

        default:
          this.logger.warn(`Mensaje desconocido del worker ${userId}:`, message.type);
      }
    } catch (error) {
      this.logger.error(`Error manejando mensaje del worker ${userId}:`, error);
    }
  }

  private async handleQRCode(userId: string, data: { qr: string; qrImage: string }): Promise<void> {
    this.updateWorkerStatus(userId, {
      status: 'starting',
      qrCode: data.qr,
      qrImage: data.qrImage,
      lastActivity: new Date()
    });

    // Guardar QR en Firebase
    await this.firebase.setDocument(`whatsapp_sessions/${userId}`, {
      qrCode: data.qr,
      qrImage: data.qrImage,
      status: 'waiting_qr',
      updatedAt: new Date()
    });

    this.emit('worker:qr', { userId, qr: data.qr, qrImage: data.qrImage });
    this.logger.info(`QR generado para usuario: ${userId}`);
  }

  private async handleWorkerReady(userId: string, data: { phoneNumber: string }): Promise<void> {
    this.updateWorkerStatus(userId, {
      status: 'running',
      isAuthenticated: true,
      phoneNumber: data.phoneNumber,
      lastActivity: new Date()
    });

    // Actualizar en Firebase
    await this.firebase.setDocument(`whatsapp_sessions/${userId}`, {
      phoneNumber: data.phoneNumber,
      status: 'authenticated',
      isAuthenticated: true,
      authenticatedAt: new Date(),
      updatedAt: new Date()
    });

    this.emit('worker:ready', { userId, phoneNumber: data.phoneNumber });
    this.logger.info(`Worker listo para usuario: ${userId}, teléfono: ${data.phoneNumber}`);
  }

  private async handleIncomingMessage(userId: string, messageData: MessageData): Promise<void> {
    // Encolar mensaje para procesamiento
    await this.messageQueue.add('process-message', {
      userId,
      messageData,
      timestamp: new Date()
    });

    this.emit('worker:message', { userId, messageData });
  }

  private async handleAuthFailure(userId: string, data: { error: string }): Promise<void> {
    this.updateWorkerStatus(userId, {
      status: 'error',
      errorMessage: `Auth failure: ${data.error}`,
      isAuthenticated: false,
      lastActivity: new Date()
    });

    this.emit('worker:auth_failure', { userId, error: data.error });
    this.logger.error(`Fallo de autenticación para usuario ${userId}:`, data.error);
  }

  private async handleWorkerError(userId: string, data: { error: string; stack?: string }): Promise<void> {
    this.updateWorkerStatus(userId, {
      status: 'error',
      errorMessage: data.error,
      lastActivity: new Date()
    });

    this.emit('worker:error', { userId, error: data.error, stack: data.stack });
    this.logger.error(`Error en worker ${userId}:`, data.error);
  }

  private async handleWorkerExit(userId: string, code: number | null, signal: string | null): Promise<void> {
    this.logger.info(`Worker ${userId} terminado - Código: ${code}, Señal: ${signal}`);
    
    const status = this.workerStatuses.get(userId);
    const config = this.workerConfigs.get(userId);
    
    if (status && config && !this.isShuttingDown) {
      // Intentar reiniciar si no se alcanzó el límite
      if (status.restartCount < config.maxRestarts) {
        this.logger.info(`Reiniciando worker ${userId} (intento ${status.restartCount + 1}/${config.maxRestarts})`);
        
        setTimeout(async () => {
          try {
            await this.restartWorker(userId);
          } catch (error) {
            this.logger.error(`Error reiniciando worker ${userId}:`, error);
          }
        }, config.restartDelay);
      } else {
        this.logger.error(`Worker ${userId} alcanzó límite de reinicios`);
        this.updateWorkerStatus(userId, { 
          status: 'error', 
          errorMessage: 'Límite de reinicios alcanzado' 
        });
      }
    }

    // Limpiar worker
    this.workers.delete(userId);
    this.emit('worker:exit', { userId, code, signal });
  }

  public async sendMessage(userId: string, to: string, message: string, options: any = {}): Promise<any> {
    const worker = this.workers.get(userId);
    if (!worker) {
      throw new Error(`Worker no encontrado para usuario: ${userId}`);
    }

    return new Promise((resolve, reject) => {
      const messageId = uuidv4();
      const timeout = setTimeout(() => {
        reject(new Error('Timeout enviando mensaje'));
      }, 30000);

      const responseHandler = (event: any) => {
        if (event.messageId === messageId) {
          clearTimeout(timeout);
          this.off('worker:response', responseHandler);
          
          if (event.data.success) {
            resolve(event.data.result);
          } else {
            reject(new Error(event.data.error));
          }
        }
      };

      this.on('worker:response', responseHandler);

      worker.send({
        type: 'command',
        userId,
        data: {
          command: 'sendMessage',
          params: { to, message, options },
          messageId
        },
        timestamp: new Date()
      });
    });
  }

  public async pauseBot(userId: string): Promise<void> {
    return this.sendWorkerCommand(userId, 'pauseBot');
  }

  public async resumeBot(userId: string): Promise<void> {
    return this.sendWorkerCommand(userId, 'resumeBot');
  }

  public async setActiveAgent(userId: string, agentId: string): Promise<void> {
    return this.sendWorkerCommand(userId, 'setAgent', { agentId });
  }

  public async getWorkerStatus(userId: string): Promise<WorkerStatus | null> {
    return this.workerStatuses.get(userId) || null;
  }

  public async disconnectWorker(userId: string): Promise<void> {
    try {
      await this.sendWorkerCommand(userId, 'disconnect');
    } catch (error) {
      this.logger.error(`Error desconectando worker ${userId}:`, error);
    }

    const worker = this.workers.get(userId);
    if (worker) {
      worker.kill('SIGTERM');
      setTimeout(() => {
        if (!worker.killed) {
          worker.kill('SIGKILL');
        }
      }, 5000);
    }

    this.cleanupWorker(userId);
  }

  public getAllWorkerStatuses(): Map<string, WorkerStatus> {
    return new Map(this.workerStatuses);
  }

  public getActiveWorkerCount(): number {
    return this.workers.size;
  }

  private async sendWorkerCommand(userId: string, command: string, params: any = {}): Promise<any> {
    const worker = this.workers.get(userId);
    if (!worker) {
      throw new Error(`Worker no encontrado para usuario: ${userId}`);
    }

    return new Promise((resolve, reject) => {
      const messageId = uuidv4();
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout ejecutando comando: ${command}`));
      }, 30000);

      const responseHandler = (event: any) => {
        if (event.messageId === messageId) {
          clearTimeout(timeout);
          this.off('worker:response', responseHandler);
          
          if (event.data.success) {
            resolve(event.data.result);
          } else {
            reject(new Error(event.data.error));
          }
        }
      };

      this.on('worker:response', responseHandler);

      worker.send({
        type: 'command',
        userId,
        data: { command, params, messageId },
        timestamp: new Date()
      });
    });
  }

  private updateWorkerStatus(userId: string, updates: Partial<WorkerStatus>): void {
    const currentStatus = this.workerStatuses.get(userId);
    if (currentStatus) {
      const newStatus = { ...currentStatus, ...updates };
      this.workerStatuses.set(userId, newStatus);
      this.saveWorkerStatusToDatabase(userId, newStatus);
    }
  }

  private async saveWorkerStatusToDatabase(userId: string, status: WorkerStatus): Promise<void> {
    try {
      await this.firebase.setDocument(`worker_statuses/${userId}`, status);
    } catch (error) {
      this.logger.error(`Error guardando estado del worker ${userId}:`, error);
    }
  }

  private async restoreWorkersFromDatabase(): Promise<void> {
    try {
      const statuses = await this.firebase.getCollection('worker_statuses');
      
      for (const [userId, status] of Object.entries(statuses)) {
        if ((status as any).status === 'running') {
          this.logger.info(`Restaurando worker para usuario: ${userId}`);
          // Aquí podrías implementar lógica para restaurar workers activos
          // Por ahora, solo marcamos como detenidos
          this.updateWorkerStatus(userId, { status: 'stopped' });
        }
      }
    } catch (error) {
      this.logger.error('Error restaurando workers desde base de datos:', error);
    }
  }

  private async restartWorker(userId: string): Promise<void> {
    const config = this.workerConfigs.get(userId);
    const status = this.workerStatuses.get(userId);
    
    if (!config || !status) {
      throw new Error(`Configuración no encontrada para worker ${userId}`);
    }

    // Limpiar worker anterior
    this.cleanupWorker(userId);

    // Incrementar contador de reinicios
    status.restartCount++;
    this.updateWorkerStatus(userId, { restartCount: status.restartCount });

    // Crear nuevo worker
    await this.createWorker(userId, config);
  }

  private cleanupWorker(userId: string): void {
    this.workers.delete(userId);
    this.workerConfigs.delete(userId);
    this.updateWorkerStatus(userId, { 
      status: 'stopped', 
      processId: null,
      lastActivity: new Date()
    });
  }

  private cleanupDeadWorkers(): void {
    for (const [userId, worker] of this.workers.entries()) {
      if (worker.killed || worker.exitCode !== null) {
        this.logger.info(`Limpiando worker muerto: ${userId}`);
        this.cleanupWorker(userId);
      }
    }
  }

  private startHealthCheckInterval(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private async performHealthCheck(): Promise<void> {
    const now = new Date();
    
    for (const [userId, status] of this.workerStatuses.entries()) {
      const worker = this.workers.get(userId);
      if (!worker) continue;

      // Verificar si el worker ha estado inactivo por mucho tiempo
      const inactiveTime = now.getTime() - status.lastActivity.getTime();
      if (inactiveTime > this.WORKER_TIMEOUT) {
        this.logger.warn(`Worker ${userId} inactivo por ${inactiveTime}ms, reiniciando...`);
        await this.restartWorker(userId);
        continue;
      }

      // Verificar uso de memoria (si está disponible)
      if (worker.pid && status.memoryUsage && status.memoryUsage > this.MAX_MEMORY_MB * 1024 * 1024) {
        this.logger.warn(`Worker ${userId} excede límite de memoria (${status.memoryUsage} bytes), reiniciando...`);
        await this.restartWorker(userId);
      }

      // Actualizar tiempo de actividad
      const uptime = now.getTime() - (status.lastActivity.getTime() - status.uptime);
      this.updateWorkerStatus(userId, { uptime });
    }
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    this.logger.info('Iniciando cierre gracioso del WorkerManager...');

    // Detener health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Cerrar todos los workers
    const shutdownPromises = Array.from(this.workers.keys()).map(userId => 
      this.disconnectWorker(userId)
    );

    try {
      await Promise.allSettled(shutdownPromises);
    } catch (error) {
      this.logger.error('Error cerrando workers:', error);
    }

    // Cerrar conexiones
    try {
      await this.messageQueue.close();
      await this.redis.quit();
    } catch (error) {
      this.logger.error('Error cerrando conexiones:', error);
    }

    this.logger.info('WorkerManager cerrado correctamente');
    this.emit('manager:shutdown');
  }
}